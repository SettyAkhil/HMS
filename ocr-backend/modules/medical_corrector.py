import json
import logging
import re
from openai import AsyncOpenAI

from core.config import settings, served_model

logger = logging.getLogger(__name__)

class MedicalCorrector:
    """
    Medical OCR Correction Layer.
    Utilizes internal LLM knowledge of RxNorm, SNOMED, and DrugBank
    to detect and structurally correct medical terminology typos.
    """
    def __init__(self, model_name="qwen2.5-vl-7b", base_url=None):
        self.model_name = served_model(model_name)
        # Bounded timeout (SDK default is 600s) — see modules/region_ocr.py for why.
        self.client = AsyncOpenAI(base_url=base_url or settings.VLLM_BASE_URL, api_key="EMPTY", timeout=90.0)
        
    async def correct_text(self, ocr_text: str, is_chart_cell: bool = False, field_name: str = "") -> dict:
        """
        Analyzes OCR text for medical terminology errors and corrects them.
        For Drug Chart cells (especially Name of the Drug and Dose), corrections are strictly
        returned as suggestions only for human review and NEVER auto-applied.
        """
        if not ocr_text or len(ocr_text.strip()) < 10:
            return {
                "original_text": ocr_text,
                "corrected_text": ocr_text,
                "corrections": []
            }
            
        system_prompt = (
            "You are a Medical NLP Engineer. Cross-reference the following OCR text against your "
            "internal RxNorm, SNOMED, and DrugBank knowledge. Detect and correct typos in drug names, "
            "diagnoses, procedures, and lab terminology.\n"
            "Return ONLY a JSON array of objects, where each object has the keys:\n"
            '- "original" (the exact misspelled word in the text)\n'
            '- "corrected" (the corrected medical term)\n'
            '- "confidence" (a float between 0.0 and 1.0 indicating your certainty).\n'
            "If no corrections are needed, return an empty array []. Do not output any markdown or explanation."
        )
        
        try:
            response = await self.client.chat.completions.create(
                model=self.model_name,
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": ocr_text}
                ],
                temperature=0.1,
                max_tokens=1024
            )
            
            raw_content = response.choices[0].message.content.strip()
            if raw_content.startswith("```json"):
                raw_content = raw_content[7:]
            if raw_content.startswith("```"):
                raw_content = raw_content[3:]
            if raw_content.endswith("```"):
                raw_content = raw_content[:-3]
                
            corrections = json.loads(raw_content.strip())
            if not isinstance(corrections, list):
                corrections = []
                
        except Exception as e:
            logger.error(f"Medical Corrector API failed: {e}")
            corrections = []
            
        corrected_text = ocr_text
        applied_corrections = []
        
        # Check if this cell is a Drug Name or Dose field
        is_drug_or_dose = is_chart_cell or field_name.lower() in [
            "name of the drug", "dose", "drug_name", "drug", "dose_val"
        ]

        for c in corrections:
            original = c.get("original", "")
            corrected = c.get("corrected", "")
            try:
                confidence = float(c.get("confidence", 0.0))
            except ValueError:
                confidence = 0.0
                
            if not original or not corrected or original == corrected:
                continue
                
            c["uncertain"] = confidence < 0.85
            c["suggestion_only"] = is_drug_or_dose
            
            # For drug/dose cells or chart cells, NEVER auto-apply — suggestions for human review only
            if is_drug_or_dose:
                applied_corrections.append(c)
                continue

            # Apply highly confident corrections via regex word boundary ONLY for narrative text
            if confidence >= 0.90:
                escaped_orig = re.escape(original)
                if re.search(rf'\b{escaped_orig}\b', corrected_text, re.IGNORECASE):
                    corrected_text = re.sub(rf'\b{escaped_orig}\b', corrected, corrected_text, flags=re.IGNORECASE)
                    applied_corrections.append(c)
            else:
                applied_corrections.append(c)
                
        return {
            "original_text": ocr_text,
            "corrected_text": corrected_text,
            "corrections": applied_corrections
        }

