import json
import logging
from openai import OpenAI

from core.config import settings, served_model

logger = logging.getLogger(__name__)

class HierarchicalSummarizer:
    """
    Executes the Map-Reduce summarization strategy.
    Maps extraction prompts across all chunks and reduces them into a single structured schema.
    """
    def __init__(self, model_name: str = "qwen2.5-vl-7b", base_url: str = None):
        self.model_name = served_model(model_name)
        # Bounded timeout (SDK default is 600s) — see modules/region_ocr.py for why.
        self.client = OpenAI(base_url=base_url or settings.VLLM_BASE_URL, api_key="EMPTY", timeout=120.0)
        
    def _extract_chunk_data(self, chunk_text: str) -> dict:
        from .blueprint_summary import load_blueprint, build_extraction_prompt
        BP = load_blueprint()
        prompt = build_extraction_prompt(BP, chunk_text)
        
        try:
            resp = self.client.chat.completions.create(
                model=self.model_name,
                messages=[{"role": "user", "content": prompt}],
                temperature=0.1,
                max_tokens=8192
            )
            raw = resp.choices[0].message.content.strip()
            
            # Robust JSON extraction
            import re
            match = re.search(r'\{.*\}', raw, re.DOTALL)
            if match:
                raw = match.group(0)
            
            data = json.loads(raw)
            return data
        except Exception as e:
            logger.error(f"Chunk extraction failed: {e}")
            # Return empty skeleton to prevent pipeline crash
            return {}

    def process_chunks(self, chunker, progress_callback=None) -> dict:
        """
        Processes chunks concurrently. Utilizes local caching if available.
        Merges results into a master structured dictionary.
        """
        import concurrent.futures

        chunks = chunker.get_chunks()
        total = len(chunks)

        master_data = {}

        def _process_single_chunk(i, chunk_text):
            data = chunker.load_cached_chunk(i)
            if not data:
                data = self._extract_chunk_data(chunk_text)
                # A failed extraction returns {} -- don't cache it as a result.
                if data:
                    chunker.save_chunk_cache(i, data)
            return i, data

        results = [None] * total
        completed = 0

        with concurrent.futures.ThreadPoolExecutor(max_workers=10) as executor:
            futures = {}
            for i, chunk_text in enumerate(chunks):
                future = executor.submit(_process_single_chunk, i, chunk_text)
                futures[future] = i
                
            for future in concurrent.futures.as_completed(futures):
                idx, data = future.result()
                results[idx] = data
                completed += 1
                if progress_callback:
                    progress_callback(completed, total)
                    
        page_summaries = []
        # Deep merge sections from each chunk into master_data
        for idx, data in enumerate(results):
            if not data or not isinstance(data, dict):
                continue
            chunk_summary_parts = []
            for sec_id, sec_dict in data.items():
                if not isinstance(sec_dict, dict):
                    continue
                if sec_id not in master_data:
                    master_data[sec_id] = {}
                for key, val in sec_dict.items():
                    if val is not None:
                        # For lists (tables), concatenate to avoid losing earlier rows
                        if isinstance(val, list):
                            if key not in master_data[sec_id]:
                                master_data[sec_id][key] = []
                            if isinstance(master_data[sec_id][key], list):
                                for item in val:
                                    if item and item not in master_data[sec_id][key]:
                                        master_data[sec_id][key].append(item)
                        elif isinstance(val, dict):
                            if key not in master_data[sec_id] or not isinstance(master_data[sec_id][key], dict):
                                master_data[sec_id][key] = {}
                            for k, v in val.items():
                                if v is not None:
                                    master_data[sec_id][key][k] = v
                        else:
                            # Scalar: later non-null wins
                            if str(val).strip().lower() not in ("", "null", "none", "n/a", "na", "—"):
                                master_data[sec_id][key] = val
                                if sec_id in ("chief_complaint_hpi", "diagnoses_problems", "procedures_interventions", "discharge_plan"):
                                    chunk_summary_parts.append(f"{key}: {val}")
            if chunk_summary_parts:
                page_summaries.append("; ".join(chunk_summary_parts[:4]))
        
        master_data["page_summaries"] = page_summaries
        return master_data

    def generate_overall_summary(self, page_summaries: list) -> str:
        """Generates a cohesive overall clinical narrative from individual page summaries."""
        if not page_summaries:
            return "No clinical narrative could be generated due to lack of extracted page summaries."
            
        combined = "\n".join([f"Page {i+1} Summary: {s}" for i, s in enumerate(page_summaries)])
        prompt = (
            "You are an expert clinical summarizer. Read the following page-by-page summaries "
            "of a patient's medical case file, and write a cohesive, comprehensive 'Overall Clinical Summary' "
            "in 5-8 sentences. This should read as a single continuous clinical narrative, summarizing the "
            "entire hospital admission, diagnosis, procedures, and outcome without explicitly referencing 'Page X'.\n"
            "STRICT RULES:\n"
            "1. Only restate facts present in the provided summaries. Do NOT add textbook medical definitions, "
            "background explanations (e.g. 'a condition characterized by...'), or unwritten diagnoses.\n"
            "2. Copy clinical terms and dates exactly.\n\n"
            f"{combined}"
        )
        try:
            resp = self.client.chat.completions.create(
                model=self.model_name,
                messages=[{"role": "user", "content": prompt}],
                temperature=0.2,
                max_tokens=1024
            )
            return resp.choices[0].message.content.strip()
        except Exception as e:
            logger.error(f"Overall summary failed: {e}")
            return "Error generating overall clinical summary."
