"""OpenAI-compatible vLLM provider for local text and vision models."""

import base64
import io
import json
import logging
import os
import threading

import requests

from utils.ocr import (
    SUPPORTED_IMAGE_MIME_TYPES,
    _detect_mime_type,
    _extract_markdown_from_llm_response,
    _extract_text_from_pdf_bytes,
    _pdf_formatting_prompt,
    _vision_prompt,
)

from .preprocessing import prepare_image

log = logging.getLogger(__name__)

VLLM_BASE_URL = os.getenv(
    "VLLM_BASE_URL", "http://host.docker.internal:8700/v1"
).rstrip("/")
# A preference, not a requirement: the served model is asked from the server
# (see _model()). A hardcoded name 404'd every OCR call the moment the vLLM
# container was swapped (qwen2.5-vl-7b -> qwen3-vl-8b) -- vLLM answers an unknown
# "model" with 404 Not Found, which read as the endpoint itself being missing.
VLLM_MODEL = os.getenv("VLLM_MODEL", "")
VLLM_API_KEY = os.getenv("VLLM_API_KEY", "local")
VLLM_TIMEOUT_SECONDS = int(os.getenv("VLLM_TIMEOUT_SECONDS", "240"))

# Scanned PDFs are OCR'd page by page as images; a prescription is one or two
# pages, and each page costs ~4k image tokens of the model's context.
MAX_PDF_PAGES = 4

_model_lock = threading.Lock()
_resolved_model = None


def _headers():
    headers = {"Content-Type": "application/json"}
    if VLLM_API_KEY:
        headers["Authorization"] = f"Bearer {VLLM_API_KEY}"
    return headers


def _served_models():
    response = requests.get(f"{VLLM_BASE_URL}/models", headers=_headers(), timeout=5)
    response.raise_for_status()
    return [m.get("id") for m in response.json().get("data") or [] if m.get("id")]


def _model(refresh=False):
    """VLLM_MODEL if the server serves it, else whatever the server does serve."""
    global _resolved_model
    with _model_lock:
        if _resolved_model and not refresh:
            return _resolved_model
        served = _served_models()
        if not served:
            raise RuntimeError(f"vLLM at {VLLM_BASE_URL} is serving no model")
        if VLLM_MODEL and VLLM_MODEL in served:
            _resolved_model = VLLM_MODEL
        else:
            if VLLM_MODEL:
                log.warning(
                    "VLLM_MODEL=%r is not served by %s (serving %s); using %r",
                    VLLM_MODEL, VLLM_BASE_URL, served, served[0],
                )
            _resolved_model = served[0]
        return _resolved_model


def _chat_completion(messages, temperature=0.1, max_tokens=2048, json_mode=False):
    payload = {
        "messages": messages,
        "temperature": temperature,
        "max_tokens": max_tokens,
    }
    if json_mode:
        payload["response_format"] = {"type": "json_object"}
    for attempt in (0, 1):
        payload["model"] = _model(refresh=attempt == 1)
        response = requests.post(
            f"{VLLM_BASE_URL}/chat/completions",
            json=payload,
            headers=_headers(),
            timeout=VLLM_TIMEOUT_SECONDS,
        )
        # 404 = the model was swapped out since we resolved it; re-ask once.
        if response.status_code == 404 and attempt == 0:
            continue
        response.raise_for_status()
        data = response.json()
        return (data["choices"][0]["message"]["content"] or "").strip()


def _image_part(jpeg_bytes):
    encoded = base64.b64encode(jpeg_bytes).decode("ascii")
    return {"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{encoded}"}}


def _pdf_page_images(pdf_bytes):
    """The scanned image on each page of an image-only PDF (largest image per page)."""
    from pypdf import PdfReader

    pages = []
    for page in PdfReader(io.BytesIO(pdf_bytes)).pages[:MAX_PDF_PAGES]:
        images = list(page.images)
        if not images:
            continue
        largest = max(images, key=lambda img: len(img.data))
        try:
            pages.append(prepare_image(largest.data))
        except Exception:
            # An encoding Pillow cannot decode (e.g. JBIG2); go via pypdf's own decode.
            out = io.BytesIO()
            largest.image.convert("RGB").save(out, format="PNG")
            pages.append(prepare_image(out.getvalue()))
    return pages


def page_images(file_bytes, filename=None):
    """(images, text_layer): the page(s) as model-ready JPEGs, or a PDF's own text.

    A PDF with a real text layer is returned as text -- re-reading rendered type
    through a vision model can only lose accuracy. Anything else becomes images.
    """
    mime_type = _detect_mime_type(file_bytes, filename)
    if mime_type == "application/pdf":
        text = _extract_text_from_pdf_bytes(file_bytes)
        if text and len(text.strip()) > 20:
            return [], text
        images = _pdf_page_images(file_bytes)
        if not images:
            raise ValueError("The PDF has neither a text layer nor a scanned page image.")
        return images, ""
    if mime_type and mime_type not in SUPPORTED_IMAGE_MIME_TYPES:
        raise ValueError(
            f"Unsupported file type ({mime_type}). Upload an image "
            "(JPG, PNG, WEBP, TIFF, BMP, GIF) or a PDF."
        )
    return [prepare_image(file_bytes)], ""


_PRESCRIPTION_VISION_PROMPT = """You are digitising a doctor's prescription sheet (handwritten, typed, \
or drawn on a tablet) for a hospital in India. Read the WHOLE page{pages} carefully, top to bottom, \
including the margins and anything written sideways.

STEP 1 -- transcript: copy every line of writing exactly as written, in reading order, one array \
entry per line. Do not translate, expand, correct or reformat. Keep abbreviations (Tab., Cap., \
Syp., Inj., Oint., OD, BD, TDS, QID, HS, SOS, 1-0-1, x5d, Ix, Adv, c/o, Dx, Imp, Rx). If a word \
is illegible write [?] in its place -- never guess a drug name. Include letterhead, patient \
details, vitals, dates and signature lines too.

STEP 2 -- split the ORDERS on the page:
- "medications": every medicine to be dispensed. Usually starts with Tab./Cap./Syp./Inj./Drops/ \
Oint./Gel/Cream/Inhaler or a drug name, often followed by a strength and a dosing pattern.
  name = drug name only (no form, no strength), e.g. "Paracetamol";
  strength = e.g. "650mg", "5mg/ml";
  dosage = units per dose, e.g. "1 tab", "5 ml", "2 puffs";
  frequency = as written, e.g. "1-0-1", "BD", "TDS", "HS", "SOS";
  route = Oral|IV|IM|SC|Topical|Inhalation|Sublingual|Nasal|Ophthalmic|Otic|Rectal|Vaginal;
  duration = e.g. "5 days", "1 month";
  instructions = e.g. "after food", "before breakfast";
  quantity = total units to dispense = doses per day x days (1-0-1 = 2/day, TDS = 3/day, \
OD/HS = 1/day); 1 if it cannot be worked out or for syrups/creams/inhalers.
- "lab_tests": every laboratory test, scan or procedure ordered (blood/urine tests, X-ray, USG, \
CT, MRI, ECG, ECHO, cultures...). Often listed under Ix / Investigations / Adv / Tests. A line \
listing several tests ("CBC, LFT, RFT") is several entries. category = Pathology|Radiology|\
Cardiology|Other; urgency = STAT if marked urgent/stat/today, else Routine.
- "diagnosis": the diagnosis / impression / provisional diagnosis, if written.
- "advice": non-drug advice and follow-up ("plenty of fluids", "review after 5 days").
- "unclassified": ONLY lines that are clearly an order (a medicine or a test) but that you \
cannot tell which, or that are too illegible to fill in. Letterhead, patient details, vitals, \
complaints, dates and signatures are NOT unclassified -- they belong only in the transcript.

Never put a test in medications or a drug in lab_tests. Do not invent anything that is not on the \
page; empty lists are correct answers.

Return ONLY this JSON object:
{{"transcript": ["<line>", ...], "diagnosis": "", "advice": "", \
"medications": [{{"name": "", "strength": "", "dosage": "", "frequency": "", "route": "", \
"duration": "", "instructions": "", "quantity": 1}}], \
"lab_tests": [{{"name": "", "category": "", "urgency": ""}}], "unclassified": [], \
"summary": "<one sentence a pharmacist can read at a glance>"}}"""


class VLLMLLMProvider:
    def is_configured(self) -> bool:
        try:
            return bool(_served_models())
        except Exception:
            return False

    def generate(
        self, prompt: str, context: str = "", json_mode: bool = False, max_tokens: int = 2048
    ):
        full_prompt = f"{context}\n\n{prompt}" if context else prompt
        return _chat_completion(
            [{"role": "user", "content": full_prompt}],
            temperature=0.1,
            max_tokens=max_tokens,
            json_mode=json_mode,
        )


class VLLMOCRProvider:
    def read_prescription(self, images):
        """Transcribe and split a prescription in ONE vision pass.

        Reading and classifying together beats OCR-then-split: the model sees that
        "Ix:" heads a block of tests, that a line is crossed out, or that a dose
        pattern sits under the drug above it -- layout a flat transcript has lost.
        Returns the parsed dict; raises on transport or parse failure.
        """
        pages = f" ({len(images)} pages, in order)" if len(images) > 1 else ""
        content = [{"type": "text", "text": _PRESCRIPTION_VISION_PROMPT.format(pages=pages)}]
        content.extend(_image_part(image) for image in images)
        raw = _chat_completion(
            [{"role": "user", "content": content}],
            temperature=0.0,
            max_tokens=6144,
            json_mode=True,
        )
        parsed = json.loads(raw)
        if not isinstance(parsed, dict):
            raise ValueError("model did not return a JSON object")
        return parsed

    def extract_text(
        self, file_bytes, language="en", doc_type="document", filename=None
    ):
        target_language = {
            "en": "English",
            "es": "Spanish",
            "fr": "French",
            "de": "German",
        }.get(language, "English")

        try:
            images, text_layer = page_images(file_bytes, filename)
            if text_layer:
                response = _chat_completion(
                    [
                        {
                            "role": "user",
                            "content": _pdf_formatting_prompt(
                                text_layer, target_language, doc_type
                            ),
                        }
                    ],
                    temperature=0.1,
                    max_tokens=4096,
                    json_mode=True,
                )
                return _extract_markdown_from_llm_response(response) or text_layer

            pages = []
            for image in images:
                response = _chat_completion(
                    [
                        {
                            "role": "user",
                            "content": [
                                {"type": "text", "text": _vision_prompt(target_language, doc_type)},
                                _image_part(image),
                            ],
                        }
                    ],
                    temperature=0.0,
                    max_tokens=4096,
                    json_mode=True,
                )
                pages.append(_extract_markdown_from_llm_response(response))
            return "\n\n".join(p for p in pages if p)
        except Exception as exc:
            return f"OCR Error: Local vLLM OCR failed: {exc}"
