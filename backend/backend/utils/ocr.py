import io
import mimetypes
import json
import re

try:
    from pypdf import PdfReader
except Exception:  # pragma: no cover - dependency guard
    PdfReader = None


LANGUAGE_NAMES = {"en": "English", "es": "Spanish", "fr": "French", "de": "German"}

SUPPORTED_IMAGE_MIME_TYPES = {
    "image/bmp",
    "image/gif",
    "image/heic",
    "image/heif",
    "image/jpeg",
    "image/png",
    "image/tiff",
    "image/webp",
}


def _detect_mime_type(file_bytes, filename=None):
    if filename:
        guessed, _ = mimetypes.guess_type(filename)
        if guessed:
            return guessed.lower()

    header = file_bytes[:32]
    if header.startswith(b"%PDF-"):
        return "application/pdf"
    if header.startswith(b"\x89PNG\r\n\x1a\n"):
        return "image/png"
    if header.startswith(b"\xff\xd8\xff"):
        return "image/jpeg"
    if header.startswith((b"II*\x00", b"MM\x00*")):
        return "image/tiff"
    if header.startswith(b"GIF87a") or header.startswith(b"GIF89a"):
        return "image/gif"
    if header.startswith(b"BM"):
        return "image/bmp"
    if header.startswith(b"RIFF") and b"WEBP" in header:
        return "image/webp"
    if len(header) >= 12 and header[4:8] == b"ftyp":
        brand = header[8:12].lower()
        if brand in {b"heic", b"heix", b"hevc", b"hevx"}:
            return "image/heic"
        if brand in {b"mif1", b"msf1"}:
            return "image/heif"
    return None


def _extract_text_from_pdf_bytes(pdf_bytes):
    if PdfReader is None:
        raise RuntimeError(
            "PDF support requires pypdf. Install dependencies and retry."
        )
    reader = PdfReader(io.BytesIO(pdf_bytes))
    chunks = []
    for page in reader.pages:
        page_text = page.extract_text() or ""
        if page_text.strip():
            chunks.append(page_text.strip())
    return "\n\n".join(chunks).strip()


def _document_hint(doc_type):
    type_hints = {
        "prescription": "This is a medical prescription. Focus on medication names, dosages, frequencies, and instructions.",
        "xray_mri": "This is a medical imaging report (X-Ray/MRI). Extract findings, impressions, and any measurements.",
        "test_docs": "This is a medical test report. Extract test names, values, reference ranges, and any abnormal findings.",
    }
    return type_hints.get(doc_type, "")


def _vision_prompt(target_language, doc_type):
    return f"""Extract ALL text from this medical document.

{_document_hint(doc_type)}

Output language: {target_language}
Critical accuracy rules:
1. Extract only text that is visibly present in the uploaded image/document
2. Do not invent patient names, medications, diagnoses, dates, values, or instructions
3. If no readable text is visible, return exactly {{"markdown":"No readable text found in this document."}}

Return format (STRICT):
1. Return only valid JSON
2. Use exactly one top-level key: "markdown"
3. Value of "markdown" must be markdown text only
4. Do not include code fences, explanations, or extra keys

**Formatting Requirements:**
1. Preserve document structure with clear sections
2. Use markdown headers (##) for main sections like Patient Information, Medications, Diagnosis, Instructions, Test Results
3. Use **bold** for medication names, dosages, frequencies, and critical findings
4. Use bullet points (•) for multiple items
5. Format tables using markdown table syntax with aligned columns
6. Separate different sections with blank lines

JSON example:
{{"markdown":"## Section\\n- item"}}"""


def _pdf_formatting_prompt(text, target_language, doc_type):
    return f"""You are given raw text extracted from a PDF medical document.

{_document_hint(doc_type)}

Task:
1. Rewrite and normalize the content in {target_language}
2. Preserve all medical details and numbers accurately
3. Remove OCR noise and obvious extraction artifacts
4. Use markdown structure with clear sections and bullets
5. Use markdown tables when rows/columns are present
6. Return only valid JSON with exactly one key: "markdown"
7. Do not include code fences or commentary

Input text:
\"\"\"
{text}
\"\"\"
"""


def _extract_markdown_from_llm_response(raw_text):
    text = (raw_text or "").strip()
    if not text:
        return ""

    try:
        parsed = json.loads(text)
        if isinstance(parsed, dict) and isinstance(parsed.get("markdown"), str):
            return parsed["markdown"].strip()
    except Exception:
        pass

    fenced_json = re.search(r"```(?:json)?\s*([\s\S]*?)\s*```", text, re.IGNORECASE)
    if fenced_json:
        candidate = fenced_json.group(1).strip()
        try:
            parsed = json.loads(candidate)
            if isinstance(parsed, dict) and isinstance(parsed.get("markdown"), str):
                return parsed["markdown"].strip()
        except Exception:
            pass

    fenced_md = re.search(r"```(?:markdown|md)\s*([\s\S]*?)\s*```", text, re.IGNORECASE)
    if fenced_md:
        return fenced_md.group(1).strip()

    for marker in ("## ", "# "):
        pos = text.find(marker)
        if pos >= 0:
            return text[pos:].strip()
    return text
