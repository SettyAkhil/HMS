"""Text extraction for the Symptom AI document-chat upload flow.

Reuses dependencies already present in the main backend (pypdf, python-docx, the
vLLM vision OCR pipeline) rather than adding PyMuPDF/fitz -- pypdf's text extraction
already covers standard PDFs, and any scanned/image-only PDF or photo still goes through
the same vLLM OCR path used elsewhere in the app.
"""

import io

from docx import Document as DocxDocument

from utils.ocr import _extract_text_from_pdf_bytes
from .service import extract_text_from_image

SUPPORTED_EXTENSIONS = {
    ".pdf",
    ".docx",
    ".txt",
    ".md",
    ".png",
    ".jpg",
    ".jpeg",
    ".webp",
}


def _extract_docx_text(file_bytes: bytes) -> str:
    document = DocxDocument(io.BytesIO(file_bytes))
    return "\n".join(
        paragraph.text for paragraph in document.paragraphs if paragraph.text.strip()
    )


def extract_document_text(file_bytes: bytes, filename: str) -> str:
    """Best-effort text extraction across PDF/DOCX/TXT/MD/image inputs.

    Raises ValueError for unsupported file types (callers should turn this into a 400,
    not a 500) and RuntimeError if extraction produced no usable text.
    """
    name = (filename or "").lower()
    extension = "." + name.rsplit(".", 1)[-1] if "." in name else ""

    if extension not in SUPPORTED_EXTENSIONS:
        raise ValueError(f"Unsupported file type: {extension or 'unknown'}")

    if extension == ".pdf":
        text = _extract_text_from_pdf_bytes(file_bytes)
        if not text.strip():
            # Scanned/image-only PDF: fall back to vLLM vision OCR on the raw bytes.
            text = extract_text_from_image(
                file_bytes, doc_type="document", filename=filename
            )
    elif extension == ".docx":
        text = _extract_docx_text(file_bytes)
    elif extension in (".txt", ".md"):
        text = file_bytes.decode("utf-8", errors="replace")
    else:
        text = extract_text_from_image(
            file_bytes, doc_type="document", filename=filename
        )

    text = (text or "").strip()
    if isinstance(text, str) and text.startswith("OCR Error:"):
        raise RuntimeError(text)
    if not text:
        raise RuntimeError("Could not extract any text from this document.")
    return text
