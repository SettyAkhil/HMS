"""Public AI service API. Business routes (app.py) import from here only -- never from
utils/ocr.py directly, and never instantiate a provider themselves.

Swapping providers (e.g. a future self-hosted PaddleOCR stack) means changing the two
module-level singletons below; nothing else in the codebase needs to change.
"""

import json
import re

from utils.ocr import _detect_mime_type
from utils.database import search_similar_documents

from .vllm_provider import VLLMLLMProvider, VLLMOCRProvider, page_images
from .whisper_provider import WhisperTranscriptionProvider

ocr_provider = VLLMOCRProvider()
llm_provider = VLLMLLMProvider()
transcription_provider = WhisperTranscriptionProvider()


def _try_generate(prompt: str, context: str = "", **kwargs):
    try:
        return llm_provider.generate(prompt, context=context, **kwargs)
    except Exception:
        return None


def extract_text_from_image(
    file_bytes, language="en", doc_type="document", filename=None
):
    """OCR pipeline entry point. The provider prepares the image itself (orientation,
    size, contrast -- see ai/preprocessing.py), so it gets the original bytes.

    Returns the text, or a string starting "OCR Error:" on failure (see is_ocr_error)."""
    return ocr_provider.extract_text(
        file_bytes, language=language, doc_type=doc_type, filename=filename
    )


def is_ocr_error(text: str) -> bool:
    """extract_text_from_image reports failure in-band; this is how callers tell."""
    return (text or "").lstrip().startswith("OCR Error:")


def transcribe_audio(file_bytes, filename=None, language=None):
    """Speech-to-text entry point for a doctor/nurse's recorded clinical
    note -- raises straight through on failure (same as extract_text_from_image
    above) rather than swallowing to None, since the transcript IS the
    primary output the caller asked for, not best-effort enrichment."""
    return transcription_provider.transcribe(file_bytes, filename=filename, language=language)


_ENTITY_EXTRACTION_PROMPT = """You are extracting structured data from a medical document's OCR text.

Document type hint: {doc_type}

Return ONLY valid JSON (no code fences, no commentary) with this exact shape:
{{
  "document_category": "prescription|lab_report|imaging_report|discharge_summary|other",
  "medications": ["<medication name + dosage as written, if any>"],
  "diagnoses": ["<diagnosis or condition mentioned, if any>"],
  "dates_mentioned": ["<any dates found, as written>"],
  "key_values": [{{"label": "<test/measurement name>", "value": "<value>"}}]
}}

If a field has no data, return an empty list for it. Do not invent data not present in the text.

OCR text:
\"\"\"
{text}
\"\"\"
"""


def classify_and_extract_entities(ocr_text: str, doc_type: str = "document"):
    """Second-pass structured extraction over already-OCR'd text. Returns a dict (possibly
    with empty lists) or None if the LLM provider is unavailable or the response wasn't
    parseable JSON -- callers should treat this as optional enrichment, not a hard
    dependency, since document upload/OCR must keep working without it."""
    text = (ocr_text or "").strip()
    if not text or not llm_provider.is_configured():
        return None
    prompt = _ENTITY_EXTRACTION_PROMPT.format(doc_type=doc_type, text=text[:8000])
    raw_response = _try_generate(prompt, json_mode=True)
    if not raw_response:
        return None
    return _parse_json_response(raw_response)


def _parse_json_response(raw_text: str):
    text = (raw_text or "").strip()
    try:
        return json.loads(text)
    except (TypeError, ValueError):
        pass
    fenced = re.search(r"```(?:json)?\s*([\s\S]*?)\s*```", text, re.IGNORECASE)
    if fenced:
        try:
            return json.loads(fenced.group(1).strip())
        except (TypeError, ValueError):
            return None
    return None


_HISTORY_SEARCH_PROMPT = """You are a clinical documentation assistant helping a clinician quickly
review a patient's history. Answer the question using ONLY the provided excerpts below. If the
excerpts don't contain enough information to answer, say so plainly -- do not guess or invent
clinical details.

Question: {query}

Relevant excerpts from this patient's records:
{excerpts}
"""


_PATIENT_FILTER_PROMPT = """You are translating a hospital staff member's free-text search into a
structured filter over a patient list.

Available fields (only these may be used): {fields}

Return ONLY valid JSON (no code fences, no commentary) with this exact shape:
{{
  "conditions": [{{"field": "<one of the available fields>", "op": "eq|contains|gt|lt|gte|lte|in", "value": <string, number, or list of strings for "in">}}],
  "logic": "AND" or "OR"
}}

If the prompt doesn't map to any available field, return {{"conditions": [], "logic": "AND"}}.

Prompt: {prompt}
"""


def translate_patient_filter_prompt(prompt: str, available_fields):
    """Convert a free-text search prompt into a structured filter (field/op/value
    conditions) via a single LLM call. Returns None if the LLM provider isn't
    configured or the response wasn't parseable JSON -- callers must treat that as
    "no filter could be derived", never fall back to interpreting the raw prompt
    as SQL themselves."""
    if not prompt or not llm_provider.is_configured():
        return None
    rendered = _PATIENT_FILTER_PROMPT.format(
        fields=", ".join(available_fields), prompt=prompt
    )
    raw_response = _try_generate(rendered, json_mode=True)
    if not raw_response:
        return None
    return _parse_json_response(raw_response)


_DOCUMENT_PROMPT_TEMPLATE = """You are extracting information from an uploaded hospital document (a PDF or
Word file, already OCR'd/converted to plain text below) based on a staff member's request.

Return ONLY valid JSON (no code fences, no commentary) with this exact shape:
{{
  "entries": [{{"name": "<full name, or empty if unknown>", "phone": "<phone number, or empty if none in the document>", "area": "<area/city, or empty>", "medical_condition": "<condition/diagnosis, or empty>", "age": <number or null>, "gender": "<or empty>"}}],
  "answer": "<a short natural-language summary of what you found, or a direct answer if the request isn't about a list of people>"
}}

Only include an entry in "entries" if the document actually names a specific person -- never invent
people or details that aren't in the text. If the request doesn't relate to a list of people, return
an empty "entries" array and just answer in "answer".

Staff request: {prompt}

Document text:
\"\"\"
{document_text}
\"\"\"
"""


def answer_bulk_document_prompt(prompt: str, document_text: str):
    """Answer a free-text question against an uploaded PDF/DOCX's extracted text, optionally
    pulling out a list of named people (for the AI Mode bulk-upload document flow). Returns
    None if the LLM provider isn't configured or the response wasn't parseable JSON -- callers
    must treat that as "couldn't answer that", never fall back to interpreting the document
    themselves."""
    if not prompt or not document_text or not llm_provider.is_configured():
        return None
    rendered = _DOCUMENT_PROMPT_TEMPLATE.format(
        prompt=prompt, document_text=document_text
    )
    raw_response = _try_generate(rendered, json_mode=True)
    if not raw_response:
        return None
    return _parse_json_response(raw_response)


def patient_history_search(query: str, hospital_id, patient_id=None, k: int = 5):
    """Retrieval-augmented answer over a patient's (or hospital's) stored clinical documents.

    Returns {"answer": str|None, "sources": [...]}. `answer` is None when the LLM provider
    isn't configured or no relevant documents were found -- `sources` is still populated in
    that case so callers can show raw matches even without a synthesized answer.
    """
    matches = search_similar_documents(
        query, hospital_id=hospital_id, patient_id=patient_id, k=k
    )
    if not matches:
        return {"answer": None, "sources": []}

    excerpts = "\n\n".join(
        f"[{i + 1}] ({m['source_table']}#{m['source_id']}): {m['content_text'][:1000]}"
        for i, m in enumerate(matches)
    )
    answer = None
    if llm_provider.is_configured():
        prompt = _HISTORY_SEARCH_PROMPT.format(query=query, excerpts=excerpts)
        answer = _try_generate(prompt)

    return {
        "answer": answer,
        "sources": [
            {
                "source_table": m["source_table"],
                "source_id": m["source_id"],
                "similarity": round(m["similarity"], 4),
                "excerpt": m["content_text"][:500],
            }
            for m in matches
        ],
    }


_PATIENT_SUMMARY_PROMPT = """You are a hospital clinical documentation assistant. Write a {kind} for the
patient below, using ONLY the information given -- never invent a diagnosis, medication,
finding, or instruction that isn't present in the data provided.

Patient: {patient_name}, {age} yrs, {gender}
{admission_line}

Encounters:
{encounters_block}

Diagnoses:
{diagnoses_block}

Medications:
{medications_block}

Lab / diagnostic tests ordered:
{labs_block}

Clinical notes:
{notes_block}

Write the {kind} in exactly this structure, with each heading on its own line:
**Chief Complaint / Reason for Visit**
**Hospital Course / Summary**
**Diagnosis**
**Medications{discharge_meds_hint}**
**Follow-up Instructions**
**Condition at {condition_label}**

Keep it concise and clinically accurate to only what's given above. If a section has
nothing to go on, write "Not documented" for that section instead of guessing.
"""


def _summary_block(items, formatter, empty="None documented."):
    if not items:
        return empty
    lines = []
    for item in items[:20]:
        try:
            text = formatter(item)
        except Exception:
            continue
        if text:
            lines.append(f"- {text}")
    return "\n".join(lines) if lines else empty


def generate_patient_summary(
    patient, admissions, encounters, diagnoses, prescriptions, labs, notes, is_discharge=False
):
    """Generates a discharge summary (is_discharge=True) or a mid-stay clinical
    progress summary (is_discharge=False) from a patient's aggregated EMR
    data, following the same _try_generate -> None-on-failure pattern as
    every other generator in this module. Callers must treat None as "AI
    isn't available right now", not a real summary."""
    if not llm_provider.is_configured():
        return None

    patient_name = (
        f"{patient.get('name') or ''} {patient.get('last_name') or ''}".strip()
        or "Unknown"
    )

    admission_line = "No admission on record."
    if admissions:
        latest = admissions[0]
        parts = [f"Admitted: {latest.get('admission_date') or '—'}"]
        if latest.get("discharge_date"):
            parts.append(f"Discharged: {latest['discharge_date']}")
        if latest.get("notes"):
            parts.append(f"Admission notes: {latest['notes']}")
        admission_line = " | ".join(parts)

    prompt = _PATIENT_SUMMARY_PROMPT.format(
        kind="discharge summary" if is_discharge else "clinical progress summary",
        patient_name=patient_name,
        age=patient.get("age") or "—",
        gender=patient.get("gender") or "—",
        admission_line=admission_line,
        encounters_block=_summary_block(
            encounters,
            lambda e: f"{e.get('encounter_type') or 'Encounter'} on {e.get('arrival_at') or e.get('created_at') or '—'} (status: {e.get('status') or '—'})",
        ),
        diagnoses_block=_summary_block(
            diagnoses, lambda d: d.get("diagnosis_name") or "—"
        ),
        medications_block=_summary_block(
            prescriptions,
            lambda p: f"{p.get('medicine_name')}"
            + (f" {p['dosage']}" if p.get("dosage") else "")
            + (f" (qty {p['quantity']})" if p.get("quantity") else ""),
        ),
        labs_block=_summary_block(
            labs, lambda l: f"{l.get('test_name')} (status: {l.get('status') or '—'})"
        ),
        notes_block=_summary_block(
            notes,
            lambda n: n.get("notes") or n.get("note") or n.get("chief_complaint") or "",
        ),
        discharge_meds_hint=" to Take Home" if is_discharge else "",
        condition_label="Discharge" if is_discharge else "Today",
    )
    return _try_generate(prompt)


# ── Prescription splitting (Doctor Portal) ────────────────────────────────────
# A doctor writes medicines AND investigations on one sheet. The two halves are
# owned by different departments (pharmacy vs. lab-via-billing), so the sheet has
# to be split before either half can be routed. The LLM does the split when vLLM
# is reachable; the keyword fallback below covers the case where it isn't, because
# a consultation must never be blocked on an inference backend being up.

_PRESCRIPTION_SPLIT_PROMPT = """You are a hospital clerk digitising a doctor's handwritten or typed
prescription sheet. The sheet mixes MEDICINES (to be dispensed by the pharmacy) with LABORATORY /
IMAGING INVESTIGATIONS (to be billed at reception and then performed by the lab).

Split it into those two groups.

Return ONLY valid JSON (no code fences, no commentary) with this exact shape:
{{
  "diagnosis": "<clinical diagnosis if stated, else empty string>",
  "advice": "<general advice / follow-up instructions if stated, else empty string>",
  "medications": [
    {{"name": "<drug name only, without the strength>", "strength": "<e.g. 500mg, or empty>",
      "dosage": "<e.g. 1 tab, 5ml, or empty>", "frequency": "<e.g. OD, BD, TDS, HS, PRN, or empty>",
      "route": "<Oral|IV|IM|Topical|Inhalation|Sublingual, or empty>",
      "duration": "<e.g. 5 days, or empty>", "instructions": "<e.g. after food, or empty>",
      "quantity": <integer total units to dispense, best estimate, else 1>}}
  ],
  "lab_tests": [
    {{"name": "<test or scan name as written>",
      "category": "Pathology|Radiology|Cardiology|Other",
      "urgency": "Routine|STAT"}}
  ],
  "summary": "<one or two sentences a pharmacist can read at a glance>"
}}

Rules:
- Never put an investigation in "medications" and never put a drug in "lab_tests".
- Do not invent items that are not on the sheet. Empty lists are correct answers.
- Keep names as the doctor wrote them; only normalise obvious OCR noise.

Prescription sheet text:
\"\"\"
{text}
\"\"\"
"""

# Investigation vocabulary for the no-LLM fallback. Matched case-insensitively as
# substrings, so "Serum Troponin I" hits on "troponin" and "X-Ray Chest PA" on "x-ray".
_LAB_TEST_KEYWORDS = (
    "cbc", "complete blood count", "hemogram", "haemogram", "esr", "crp", "c-reactive",
    "lft", "liver function", "kft", "rft", "renal function", "urea", "creatinine",
    "electrolyte", "sodium", "potassium", "lipid", "cholesterol", "triglyceride",
    "troponin", "ck-mb", "bnp", "d-dimer", "coagulation", "pt/inr", "inr", "aptt",
    "fbs", "ppbs", "rbs", "hba1c", "glycosylated", "blood sugar", "blood glucose",
    "tsh", "t3", "t4", "thyroid", "ferritin", "serum",
    "urine", "stool", "culture", "sensitivity", "biopsy", "cytology", "histopath",
    "swab", "serology", "widal", "dengue", "malaria", "hiv", "hbsag", "hcv",
    "blood group", "x-match", "cross match", "peripheral smear",
    "x-ray", "xray", "ct ", "ct-", "mri", "ultrasound", "usg", "sonography", "doppler",
    "mammogram", "pet scan", "scan", "angiogram", "ecg", "e.c.g", "echo", "eeg", "emg",
    "spirometry", "pft", "pulmonary function", "holter", "tmt", "treadmill",
    "profile", "panel", "screening", "assay", "titre", "titer", "level", "count",
)

# Dosage-form / sig vocabulary that marks a line as a drug rather than a test.
_MEDICINE_KEYWORDS = (
    "tab", "tabs", "tablet", "tablets", "cap", "caps", "capsule", "capsules",
    "syrup", "syp", "susp", "suspension", "inj", "injection", "inhaler", "puff",
    "puffs", "nebulizer", "nebuliser", "drops", "ointment", "cream", "gel",
    "lotion", "spray", "patch", "sachet", "suppository", "suppositories",
    "od", "bd", "tds", "tid", "qid", "qds", "hs", "sos", "prn",
    "once daily", "twice daily", "thrice daily", "at bedtime",
    "before food", "after food", "before meals", "after meals",
    "mg", "mcg", "gm", "ml", "iu",
    "paracetamol", "dolo", "calpol", "crocin", "amoxicillin", "augmentin",
    "azithromycin", "azithral", "cefixime", "ciprofloxacin", "pantoprazole",
    "pan", "pantocid", "omeprazole", "cetirizine", "montelukast", "montair",
    "metformin", "glycomet", "telmisartan", "amlodipine", "atorvastatin",
    "ecosprin", "aspirin", "vitamin", "calcium", "ultracet", "tramadol",
    "ibuprofen", "combiflam", "budesonide", "salbutamol", "asthalin",
)

_FREQUENCY_PATTERN = re.compile(
    r"\b(OD|BD|TDS|TID|QID|QDS|HS|SOS|PRN|STAT|1-0-1|1-1-1|0-0-1|1-0-0|0-1-0|1-1-0|0-1-1|1-0-1-0|1-1-1-1)\b",
    re.IGNORECASE,
)
_STRENGTH_PATTERN = re.compile(
    r"\b(\d+(?:\.\d+)?\s*(?:mg|mcg|g|gm|ml|iu|units|%))\b", re.IGNORECASE
)
_BARE_STRENGTH_PATTERN = re.compile(
    r"\b(\d+(?:\.\d+)?)\s*(?:$|[x×*]|[-–—]|for\b)", re.IGNORECASE
)
_DURATION_PATTERN = re.compile(
    r"\b(?:(?:for|x|-|\*)\s*)?(\d+)\s*(days?|weeks?|months?|d|w|wk|wks|m|mo|mos)\b", re.IGNORECASE
)
_SHORTHAND_PATTERN = re.compile(r"\b(\d+)\s*/\s*(7|52|12)\b")
_DOSAGE_PATTERN = re.compile(
    r"\b(\d+(?:/\d+)?\s*(?:tab|tabs|tablet|tablets|cap|caps|capsule|capsules|puff|puffs|drop|drops|ml|tsp)\b)",
    re.IGNORECASE,
)
_FORM_PREFIX_PATTERN = re.compile(
    r"^\s*(?:tab(?:let)?s?\.?|cap(?:sule)?s?\.?|syp\.?|syrup|susp(?:ension)?\.?|inj(?:ection)?\.?|drops?|spray|ointment|oint\.?|cream|gel|lotion|patch|sachet|powder)\s+",
    re.IGNORECASE,
)
_INSTRUCTION_PHRASES = (
    "after food", "before food", "after meals", "before meals", "after breakfast", "before breakfast",
    "after dinner", "after lunch", "at bedtime", "empty stomach", "with water",
    "with milk", "rinse mouth", "as needed", "if required", "at night", "in morning",
    "for fever", "for pain", "for severe pain",
)
_BULLET_PATTERN = re.compile(r"^\s*(?:[-*•–—]|\d+[.)]|\([0-9a-zA-Z]\)|#[0-9]+)\s*")
_DIAGNOSIS_LABEL = re.compile(
    r"^(diagnosis|provisional diagnosis|impression|dx|clinical diagnosis|assessment)\s*[:\-]\s*(.*)$",
    re.IGNORECASE,
)
_ADVICE_LABEL = re.compile(
    r"^(advice|advise|patient notes?|general advice|instructions?|patient instructions?|follow[\s-]?up|plan|home care|diet|precautions)\s*[:\-]\s*(.*)$",
    re.IGNORECASE,
)
_ADVICE_PATTERN = re.compile(
    r"\b(follow[\s-]?up|review\s+(?:after|in|with|on)|next\s+visit|sos\s+visit|steam\s+inhalation|saline\s+gargl|warm\s+water|gargl|bed\s+rest|take\s+rest|rest\s+for|avoid\s+|diet|dietary|drink\s+(?:plenty|water|\d+)|water\s+intake|plenty\s+of|oral\s+fluids|hydration|fluid\s+intake|exercise|physiotherapy|walk\s+\d+|walking|refer\s+to|consult\s+doctor|hot\s+(?:fermentation|fomentation)|ice\s+pack|dressing|wound\s+care|keep\s+(?:clean|dry|warm)|no\s+heavy\s+lifting|salt\s+restricted|low\s+salt|sugar\s+control|monitor\s+(?:bp|sugar|vitals|temp)|check\s+(?:bp|sugar|glucose|temperature))\b",
    re.IGNORECASE,
)

_HEADER_DIAGNOSIS = re.compile(
    r"\b(diagnos\w*|diag\b|dx\b|impression|findings?|assessment|complaint|condition)\b",
    re.IGNORECASE,
)
_HEADER_ADVICE = re.compile(
    r"\b(advice|advise|instruction|instructions|follow[\s-]?up|plan|home\s*care|diet|precaution|precautions|lifestyle)\b",
    re.IGNORECASE,
)
_HEADER_LAB = re.compile(
    r"\b(investigation|investigations|lab|labs|test|tests|diagnostics?|imaging|radiology|pathology|scans?)\b",
    re.IGNORECASE,
)
_HEADER_RX = re.compile(
    r"\b(rx|r\/x|med|meds|medicine|medicines|medication|medications|drugs?|treatment|prescription)\b",
    re.IGNORECASE,
)
_STANDALONE_HEADERS = re.compile(
    r"^\s*(?:[-*•–—]|\d+[.)]|\([0-9a-zA-Z]\)|#[0-9]+)?\s*"
    r"(?:rx|r\/x|medicines?|medications?|treatment|drugs?|prescriptions?|investigations?|labs?|lab\s+tests?|tests\s+advised|tests?|diagnostics?|imaging|radiology|pathology|scans?|advice|advise|instructions?|patient\s+instructions?|follow[\s-]?up|plan|home\s*care|diet|precautions?|lifestyle|diagnosis|clinical\s+dx|provisional\s+diagnosis|dx|impression|findings?|assessment)"
    r"(?:\s*[&/+\-]\s*(?:rx|medicines?|instructions?|advice|diet|precautions?|follow[\s-]?up|medications?|labs?|scans?|imaging|investigations?))*\s*$",
    re.IGNORECASE,
)

def _classify_header(header_text: str):
    norm = re.sub(r"^[^a-zA-Z]+|[^a-zA-Z]+$", "", header_text).lower()
    norm = re.sub(r"[&/+\-_]", " ", norm).strip()
    if _HEADER_DIAGNOSIS.search(norm):
        return "diagnosis"
    if _HEADER_ADVICE.search(norm):
        return "advice"
    if _HEADER_LAB.search(norm):
        return "lab"
    if _HEADER_RX.search(norm):
        return "rx"
    return None

_ROUTINE_FREQ_PATTERN = re.compile(
    r"\b(OD|BD|TDS|TID|QID|QDS|HS|1-0-1|1-1-1|0-0-1|1-0-0|0-1-0|1-1-0|0-1-1|1-0-1-0|1-1-1-1|1\/2-0-1\/2|½-0-½|once\s+daily|twice\s+daily|thrice\s+daily)\b",
    re.IGNORECASE,
)

_DOSES_PER_DAY = {
    "OD": 1, "HS": 1, "BD": 2, "TDS": 3, "TID": 3, "QID": 4, "QDS": 4,
    "1-0-1": 2, "1-1-1": 3, "0-0-1": 1, "1-0-0": 1, "0-1-0": 1, "1-1-0": 2,
}


def _looks_like_lab_test(line: str) -> bool:
    lowered = line.lower()
    return any(keyword in lowered for keyword in _LAB_TEST_KEYWORDS) or bool(re.search(r"\btests?\b", lowered))


def _looks_like_medicine(line: str) -> bool:
    lowered = line.lower()
    if _FORM_PREFIX_PATTERN.search(line):
        return True
    if any(
        re.search(r"(?<![a-z])" + re.escape(keyword) + r"(?![a-z])", lowered)
        for keyword in _MEDICINE_KEYWORDS
    ):
        return True
    if (_STRENGTH_PATTERN.search(line) or _BARE_STRENGTH_PATTERN.search(line)) and _ROUTINE_FREQ_PATTERN.search(line):
        return True
    return False


def _estimate_quantity(frequency: str, duration_days: int) -> int:
    per_day = _DOSES_PER_DAY.get((frequency or "").upper())
    if not per_day or not duration_days:
        return 1
    return max(1, per_day * duration_days)


def _parse_medicine_line(line: str):
    """Best-effort sig parse of one prescription line into the shape the pharmacy queue wants."""
    cleaned = _FORM_PREFIX_PATTERN.sub("", line).strip()

    strength = _STRENGTH_PATTERN.search(cleaned)
    frequency = _FREQUENCY_PATTERN.search(cleaned)
    duration = _DURATION_PATTERN.search(cleaned)
    dosage = _DOSAGE_PATTERN.search(cleaned)

    lowered = cleaned.lower()
    instructions = next((p for p in _INSTRUCTION_PHRASES if p in lowered), "")

    name = cleaned
    for match in (strength, frequency, duration, dosage):
        if match:
            name = name.replace(match.group(0), " ")
    if instructions:
        name = re.sub(re.escape(instructions), " ", name, flags=re.IGNORECASE)

    duration_str = ""
    duration_days = 0
    if duration:
        duration_str = f"{duration.group(1)} {duration.group(2)}"
        unit = duration.group(2).lower()
        multiplier = 7 if (unit.startswith("w") or unit in ("w", "wk")) else 30 if (unit.startswith("m") or unit in ("m", "mo")) else 1
        duration_days = int(duration.group(1)) * multiplier
    else:
        shorthand = _SHORTHAND_PATTERN.search(name)
        if shorthand:
            unit_name = "days" if shorthand.group(2) == "7" else "weeks" if shorthand.group(2) == "52" else "months"
            duration_str = f"{shorthand.group(1)} {unit_name}"
            multiplier = 1 if shorthand.group(2) == "7" else 7 if shorthand.group(2) == "52" else 30
            duration_days = int(shorthand.group(1)) * multiplier
            name = name.replace(shorthand.group(0), " ")

    strength_val = strength.group(1).strip() if strength else ""
    if not strength_val:
        bare = _BARE_STRENGTH_PATTERN.search(name)
        if bare:
            strength_val = bare.group(1).strip() + "mg"
            name = _BARE_STRENGTH_PATTERN.sub(" ", name)

    name = re.sub(r"\s+[x×*]\s*$", " ", name, flags=re.IGNORECASE)
    name = re.sub(r"[\s,;|]+", " ", name).strip(" -–—,;:.xX×#()")

    route = "Oral"
    if re.search(r"\b(inhaler|puff|nebuli)", lowered):
        route = "Inhalation"
    elif re.search(r"\bim\b", lowered):
        route = "IM"
    elif re.search(r"\biv\b", lowered):
        route = "IV"
    elif re.search(r"\bsc\b", lowered):
        route = "SC"
    elif re.search(r"\b(inj|injection)\b", lowered):
        route = "Injectable"
    elif re.search(r"\b(ointment|cream|gel|lotion|patch)\b", lowered):
        route = "Topical"
    elif "sublingual" in lowered:
        route = "Sublingual"

    name = re.sub(r"\b(iv|im|sc|po|oral|sublingual|topical|inj|injection)\b", " ", name, flags=re.IGNORECASE)
    name = re.sub(r"[\s,;|]+", " ", name).strip(" -–—,;:.xX×#()")

    freq_text = frequency.group(1).upper() if frequency else ""
    return {
        "name": name or line.strip(),
        "strength": strength_val,
        "dosage": dosage.group(1).strip() if dosage else "",
        "frequency": freq_text,
        "route": route,
        "duration": f"{duration.group(1)} {duration.group(2)}" if duration else "",
        "instructions": instructions,
        "quantity": _estimate_quantity(freq_text, duration_days),
    }


def _build_lab_test(line: str):
    lowered = line.lower()
    radiology = any(
        k in lowered
        for k in ("x-ray", "xray", "cxr", "mri", "ct ", "ct-", "scan", "ultrasound", "usg",
                  "doppler", "sonography", "mammogram", "angiogram")
    )
    cardiology = any(k in lowered for k in ("ecg", "echo", "tmt", "holter", "treadmill"))
    name = re.sub(r"\s*[-–—]?\s*\b(stat|urgent)\b\s*$", "", line, flags=re.IGNORECASE).strip(" -–—,;:.")
    return {
        "name": name or line.strip(),
        "category": "Radiology" if radiology else "Cardiology" if cardiology else "Pathology",
        "urgency": "STAT" if re.search(r"\b(stat|urgent)\b", lowered) else "Routine",
    }


def _heuristic_split(text: str):
    """Keyword split used when the LLM provider is unavailable or returned garbage.

    Deliberately conservative: a line it cannot classify goes into neither list and is
    reported under "unclassified", so the doctor places it by hand rather than having it
    silently dispensed or silently billed.
    """
    diagnosis_parts, advice_parts = [], []
    medications, lab_tests, unclassified = [], [], []
    section = None

    for raw_line in (text or "").splitlines():
        line = _BULLET_PATTERN.sub("", raw_line).strip()
        if not line:
            continue

        colon_index = line.find(":")
        if colon_index >= 0:
            head = line[:colon_index].strip()
            inline = line[colon_index + 1:].strip()
            head_type = _classify_header(head)
            if head_type:
                section = head_type
                if inline:
                    if head_type == "diagnosis":
                        diagnosis_parts.append(inline)
                    elif head_type == "advice":
                        advice_parts.append(inline)
                    elif head_type == "lab":
                        items = [part.strip() for part in re.split(r"[,;]", inline) if part.strip()]
                        lab_tests.extend(_build_lab_test(it) for it in items)
                    elif head_type == "rx":
                        items = [part.strip() for part in re.split(r"[,;]", inline) if part.strip()]
                        medications.extend(_parse_medicine_line(it) for it in items)
                continue
        elif _STANDALONE_HEADERS.match(line):
            head_type = _classify_header(line)
            if head_type:
                section = head_type
                continue

        is_adv = bool(_ADVICE_PATTERN.search(line))
        is_med = _looks_like_medicine(line)
        is_lab = _looks_like_lab_test(line)

        if is_adv:
            advice_parts.append(line)
        elif is_med:
            medications.append(_parse_medicine_line(line))
        elif is_lab:
            pieces = [p.strip() for p in re.split(r"[,;]", line) if p.strip()]
            if len(pieces) > 1 and any(_looks_like_lab_test(p) for p in pieces):
                lab_tests.extend(_build_lab_test(p) for p in pieces)
            else:
                lab_tests.append(_build_lab_test(line))
        elif section == "advice":
            advice_parts.append(line)
        elif section == "rx":
            medications.append(_parse_medicine_line(line))
        elif section == "lab":
            lab_tests.append(_build_lab_test(line))
        elif section == "diagnosis":
            diagnosis_parts.append(line)
        else:
            unclassified.append(line)

    return {
        "diagnosis": ", ".join(diagnosis_parts),
        "advice": "\n".join(advice_parts),
        "medications": medications,
        "lab_tests": lab_tests,
        "unclassified": unclassified,
        "summary": (
            "{} medicine(s) and {} investigation(s) separated accurately."
        ).format(len(medications), len(lab_tests)),
        "engine": "heuristic",
    }


_DOSE_PATTERN_SIG = re.compile(r"^\s*(1/2|½|\d+(?:\.\d+)?)(?:\s*-\s*(1/2|½|\d+(?:\.\d+)?)){2,3}\s*$")
_DURATION_DAYS = re.compile(r"(\d+(?:\.\d+)?)\s*(d|day|days|w|wk|wks|week|weeks|m|mo|month|months)\b", re.I)
_PACK_UNIT = re.compile(r"(?<![a-z])(ml|syp|syrup|susp|suspension|drop|drops|cream|oint|ointment|gel|lotion|inhaler|puffs?|spray|sachet)(?![a-z])", re.I)
_PACK_ROUTES = {"topical", "inhalation", "nasal", "ophthalmic", "otic", "rectal", "vaginal"}


def _dose_value(token):
    return 0.5 if token in ("1/2", "½") else float(token)


def _dispense_quantity(med, model_quantity):
    """Units to dispense, computed from the sig rather than the model's arithmetic.

    The model reliably reads "1-0-1 x 7d" but often multiplies it wrong (it gave
    7 for that), and counted syrup doses as units. Liquids, creams, drops and
    inhalers are one pack; tablets/capsules are doses-per-day x days x units-per-
    dose. Falls back to the model's figure only when the sig cannot be computed
    (SOS / PRN, or no duration).
    """
    sig_text = " ".join((med["strength"], med["dosage"], med["name"], med["instructions"]))
    if _PACK_UNIT.search(sig_text) or med["route"].lower() in _PACK_ROUTES:
        return 1
    frequency = med["frequency"].strip()
    match = _DOSE_PATTERN_SIG.match(frequency)
    if match:
        per_day = sum(_dose_value(t) for t in re.split(r"\s*-\s*", frequency))
    else:
        per_day = _DOSES_PER_DAY.get(re.sub(r"[^A-Z]", "", frequency.upper()))
    duration = _DURATION_DAYS.search(med["duration"])
    if not per_day or not duration:
        return model_quantity
    unit = duration.group(2).lower()
    days = float(duration.group(1)) * (7 if unit.startswith("w") else 30 if unit.startswith("m") else 1)
    # "1/2" before \d+, or "1/2 tab" reads as one tablet.
    per_dose = re.match(r"\s*(1/2|½|\d+(?:\.\d+)?)", med["dosage"])
    units = _dose_value(per_dose.group(1)) if per_dose else 1
    return max(1, int(round(per_day * days * units + 0.49)))


def _normalise_split(parsed):
    """Coerce whatever the model returned into the exact contract the frontend relies on."""
    medications = []
    for item in parsed.get("medications") or []:
        if isinstance(item, str):
            if item.strip():
                medications.append(_parse_medicine_line(item))
            continue
        if not isinstance(item, dict):
            continue
        name = (item.get("name") or item.get("medicine") or "").strip()
        if not name:
            continue
        try:
            quantity = max(1, int(item.get("quantity") or 1))
        except (TypeError, ValueError):
            quantity = 1
        med = {
            "name": name,
            "strength": str(item.get("strength") or "").strip(),
            "dosage": str(item.get("dosage") or "").strip(),
            "frequency": str(item.get("frequency") or "").strip(),
            "route": str(item.get("route") or "").strip() or "Oral",
            "duration": str(item.get("duration") or "").strip(),
            "instructions": str(item.get("instructions") or "").strip(),
        }
        med["quantity"] = _dispense_quantity(med, quantity)
        medications.append(med)

    lab_tests = []
    for item in parsed.get("lab_tests") or parsed.get("investigations") or []:
        if isinstance(item, str):
            name, category, urgency = item.strip(), "Pathology", "Routine"
        elif isinstance(item, dict):
            name = (item.get("name") or item.get("test") or "").strip()
            category = (item.get("category") or "").strip() or "Pathology"
            urgency = (item.get("urgency") or "").strip() or "Routine"
        else:
            continue
        if not name:
            continue
        lab_tests.append({"name": name, "category": category, "urgency": urgency})

    return {
        "diagnosis": (parsed.get("diagnosis") or "").strip(),
        "advice": (parsed.get("advice") or "").strip(),
        "medications": medications,
        "lab_tests": lab_tests,
        "unclassified": [str(x) for x in (parsed.get("unclassified") or [])],
        "summary": (parsed.get("summary") or "").strip(),
        "engine": "llm",
    }


def split_prescription(text: str):
    """Split one prescription sheet's text into pharmacy orders and lab orders.

    Always returns a dict in the shape above -- it degrades to keyword matching rather
    than failing, and names the engine that produced the answer in "engine" so the UI
    can tell the doctor when the split deserves a closer look before dispatch.
    """
    text = (text or "").strip()
    if not text:
        return {
            "diagnosis": "", "advice": "", "medications": [], "lab_tests": [],
            "unclassified": [], "summary": "", "engine": "empty",
        }

    if llm_provider.is_configured():
        raw_response = _try_generate(
            _PRESCRIPTION_SPLIT_PROMPT.format(text=text[:8000]), json_mode=True
        )
        parsed = _parse_json_response(raw_response) if raw_response else None
        if isinstance(parsed, dict):
            normalised = _normalise_split(parsed)
            if normalised["medications"] or normalised["lab_tests"]:
                return normalised

    return _heuristic_split(text)


class PrescriptionReadError(Exception):
    """The sheet could not be read at all -- distinct from "read, and nothing on it"."""


def _mentions(line: str, name: str) -> bool:
    """Whether an extracted item's name is visibly the subject of a transcript line."""
    words = [w for w in re.findall(r"[a-z0-9]+", (name or "").lower()) if len(w) >= 3]
    lowered = line.lower()
    return bool(words) and words[0] in lowered


def _place_uncovered_orders(result, transcript_lines):
    """Surface any order line the model transcribed but did not file.

    A model reading a dense sheet occasionally transcribes a line and then leaves
    it out of both lists. Silently dropping a prescribed drug or test is the worst
    outcome here, so any transcript line that reads like an order and is not
    represented by an extracted item goes to "unclassified" -- the doctor's "file
    these by hand" list -- rather than vanishing.
    """
    names = [m["name"] for m in result["medications"]] + [t["name"] for t in result["lab_tests"]]
    unclassified = list(result["unclassified"])
    for line in transcript_lines:
        clean = _BULLET_PATTERN.sub("", line).strip()
        if len(clean) < 3 or clean in unclassified:
            continue
        if _DIAGNOSIS_LABEL.match(clean) or _ADVICE_LABEL.match(clean):
            continue
        if not (_looks_like_medicine(clean) or _looks_like_lab_test(clean)):
            continue
        if any(_mentions(clean, name) for name in names):
            continue
        # A header such as "Investigations:" or "Rx" introduces items; it is not one.
        header = clean.partition(":")[0].strip().lower()
        if clean.endswith(":") or header in _SECTION_LAB_HEADERS or header in _SECTION_RX_HEADERS:
            if not clean.partition(":")[2].strip():
                continue
        unclassified.append(clean)
    result["unclassified"] = unclassified
    return result


def split_prescription_file(file_bytes, filename=None):
    """Read a photographed / scanned / drawn prescription and split it.

    Images (and image-only PDFs) are read and split by the vision model in one
    pass; a PDF with a real text layer is split from that text. If the one-pass
    read fails, falls back to plain OCR + split_prescription(). Raises
    PrescriptionReadError when nothing could read the sheet at all, so the route
    can report a failure instead of a split of the error message itself.
    """
    try:
        images, text_layer = page_images(file_bytes, filename)
    except ValueError as exc:
        raise PrescriptionReadError(str(exc)) from exc
    except Exception:
        images, text_layer = [], ""

    if text_layer:
        result = split_prescription(text_layer)
        result["ocr_text"] = text_layer
        return result

    if images and not llm_provider.is_configured():
        # Said plainly: the doctor reads this, not a developer.
        raise PrescriptionReadError(
            "the local AI model (vLLM) is not reachable -- check that its container is running"
        )

    if images:
        try:
            parsed = ocr_provider.read_prescription(images)
            transcript = [str(line).strip() for line in parsed.get("transcript") or [] if str(line).strip()]
            result = _normalise_split(parsed)
            result["engine"] = "vision"
            result["ocr_text"] = "\n".join(transcript)
            if transcript:
                return _place_uncovered_orders(result, transcript)
        except Exception:
            pass

    text = extract_text_from_image(file_bytes, "en", "prescription", filename=filename)
    if is_ocr_error(text):
        raise PrescriptionReadError(text.split(":", 1)[1].strip())
    result = split_prescription(text)
    result["ocr_text"] = text
    return result
