"""Local replacement for the separate ocr_portal/ microservice (Docker + Postgres +
Qdrant + a GPU vLLM model) that modules/ocr_portal/routes.py used to proxy to. That
service isn't available in this deployment (no Docker, no GPU) -- upload/OCR, the
document vault, the knowledge base, and RAG chat are all served locally instead,
using the same vLLM pipeline as the rest of the app (ai/service.py) and this app's
own Postgres DB for storage.

Business routes (modules/ocr_portal/routes.py) import from here only.
"""

import io
import json

from utils.database import (
    create_ocr_portal_document,
    list_ocr_portal_documents,
    get_ocr_portal_document,
    delete_ocr_portal_document,
    set_ocr_portal_document_kb_flag,
    list_ocr_portal_kb_documents,
    save_ocr_portal_chat_message,
    list_ocr_portal_chat_history,
    delete_ocr_portal_chat_history,
    search_ocr_portal_chunks,
    delete_ocr_portal_chunks,
    store_document_embedding,
)

from .document_extraction import extract_document_text
from .service import llm_provider

BLUEPRINTS = [
    "Universal OCR (Any Text)",
    "Prescription",
    "Lab Report",
    "Discharge Summary",
    "Insurance / ID Document",
]

_CHUNK_SIZE = 1000
_CHUNK_OVERLAP = 150


class OcrPortalError(Exception):
    def __init__(self, status_code: int, message: str):
        super().__init__(message)
        self.status_code = status_code
        self.message = message


def list_ocr_blueprints(hospital_id, username):
    return BLUEPRINTS


# ---- OCR: upload / job status / result / export ----------------------------


def upload_ocr_document(
    hospital_id, username, filename, file_bytes, mimetype, blueprint
):
    """Runs synchronously -- OCR of a single document takes seconds, well within a
    normal request timeout, so there's no need for a job queue here."""
    try:
        text = extract_document_text(file_bytes, filename)
        status, error_message = "COMPLETED", None
    except Exception as exc:
        text, status, error_message = "", "FAILED", str(exc)

    document_id = create_ocr_portal_document(
        hospital_id,
        username,
        filename,
        blueprint,
        mimetype,
        text,
        confidence_score=None,
        status=status,
        error_message=error_message,
    )
    return {"job_id": str(document_id)}


def get_ocr_job(hospital_id, username, job_id):
    document = _require_document(hospital_id, username, job_id)
    return {
        "status": document["status"],
        "progress": 100 if document["status"] in ("COMPLETED", "FAILED") else 50,
        "error_message": document["error_message"],
    }


def get_ocr_job_result(hospital_id, username, job_id):
    document = _require_document(hospital_id, username, job_id)
    return {
        "filename": document["filename"],
        "combined_markdown": document["ocr_text"] or "",
        "entities": [],
        "confidence_score": document["confidence_score"],
    }


def export_ocr_job(hospital_id, username, job_id, fmt):
    document = _require_document(hospital_id, username, job_id)
    return _export_document(document, fmt)


def _require_document(hospital_id, username, doc_id):
    try:
        doc_id = int(doc_id)
    except (TypeError, ValueError):
        raise OcrPortalError(404, "Job not found")
    document = get_ocr_portal_document(doc_id, hospital_id, username)
    if not document:
        raise OcrPortalError(404, "Job not found")
    return document


# ---- Vault -------------------------------------------------------------------


def list_vault_documents(hospital_id, username):
    rows = list_ocr_portal_documents(hospital_id, username)
    return [
        {
            "id": row["id"],
            "filename": row["filename"],
            "doc_category": row["doc_category"],
            "confidence_score": row["confidence_score"],
            "extraction_date": row["created_at"],
        }
        for row in rows
    ]


def get_vault_document(hospital_id, username, doc_id):
    document = _require_document(hospital_id, username, doc_id)
    return {"id": document["id"], "markdown": document["ocr_text"] or ""}


def delete_vault_document(hospital_id, username, doc_id):
    document = _require_document(hospital_id, username, doc_id)
    delete_ocr_portal_chunks(hospital_id, document["id"])
    delete_ocr_portal_document(document["id"], hospital_id, username)


def export_vault_document(hospital_id, username, doc_id, fmt):
    document = _require_document(hospital_id, username, doc_id)
    return _export_document(document, fmt)


def _export_document(document, fmt):
    from core.export import generate_pdf, generate_word

    text = document["ocr_text"] or ""
    filename = document["filename"] or "document"
    doc_type = document["doc_category"] or "document"

    if fmt == "md":
        return text.encode("utf-8"), "text/markdown"
    if fmt == "pdf":
        return generate_pdf(filename, doc_type, text), "application/pdf"
    if fmt == "docx":
        return (
            generate_word(filename, doc_type, text),
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        )
    if fmt == "xlsx":
        return (
            _generate_xlsx(text),
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        )
    raise OcrPortalError(400, f"Unsupported export format: {fmt}")


def _generate_xlsx(text):
    from openpyxl import Workbook

    wb = Workbook()
    ws = wb.active
    ws.title = "Extracted Text"
    for line in text.split("\n"):
        ws.append([line])
    buffer = io.BytesIO()
    wb.save(buffer)
    return buffer.getvalue()


# ---- Assistant (RAG chat) -----------------------------------------------------


def _chunk_text(text, size=_CHUNK_SIZE, overlap=_CHUNK_OVERLAP):
    text = text.strip()
    if not text:
        return []
    chunks = []
    start = 0
    while start < len(text):
        end = start + size
        chunks.append(text[start:end])
        if end >= len(text):
            break
        start = end - overlap
    return chunks


def ingest_vault_docs(hospital_id, username, doc_ids):
    ingested = []
    for doc_id in doc_ids:
        document = get_ocr_portal_document(doc_id, hospital_id, username)
        if not document or not document["ocr_text"]:
            continue
        delete_ocr_portal_chunks(
            hospital_id, doc_id
        )  # avoid duplicate chunks on re-ingest
        for chunk in _chunk_text(document["ocr_text"]):
            store_document_embedding(
                "ocr_portal_documents", doc_id, chunk, hospital_id=hospital_id
            )
        set_ocr_portal_document_kb_flag(doc_id, hospital_id, username, True)
        ingested.append(doc_id)
    return {"ingested": ingested}


def list_kb_documents(hospital_id, username):
    rows = list_ocr_portal_kb_documents(hospital_id, username)
    return [
        {
            "doc_id": row["id"],
            "filename": row["filename"],
            "category": row["doc_category"],
            "chunk_count": None,
        }
        for row in rows
    ]


def remove_kb_document(hospital_id, username, doc_id):
    delete_ocr_portal_chunks(hospital_id, doc_id)
    set_ocr_portal_document_kb_flag(doc_id, hospital_id, username, False)


_CHAT_PROMPT = """You are a helpful assistant answering questions about the user's uploaded documents.
Use ONLY the excerpts below to answer -- if they don't contain enough information, say so plainly,
don't guess or invent details.

Question: {question}

Relevant excerpts:
{excerpts}
"""


def send_chat_message(
    hospital_id, username, message, session_id="default", doc_ids=None
):
    save_ocr_portal_chat_message(hospital_id, username, session_id, "user", message)

    kb_docs = list_ocr_portal_kb_documents(hospital_id, username)
    scope_ids = doc_ids if doc_ids else [row["id"] for row in kb_docs]
    matches = search_ocr_portal_chunks(hospital_id, scope_ids, message, k=5)

    if not matches:
        answer = (
            "I couldn't find anything relevant in your knowledge base. Add a document first from "
            'My Documents ("Add to KB").'
        )
        citations = []
    else:
        excerpts = "\n\n".join(
            f"[{i + 1}] {m['content_text'][:800]}" for i, m in enumerate(matches)
        )
        prompt = _CHAT_PROMPT.format(question=message, excerpts=excerpts)
        answer = (
            llm_provider.generate(prompt)
            or "The local AI model is unavailable right now."
        )
        doc_lookup = {row["id"]: row["filename"] for row in kb_docs}
        citations = [
            {
                "doc_id": m["source_id"],
                "filename": doc_lookup.get(m["source_id"], "document"),
                "snippet": m["content_text"][:200],
            }
            for m in matches
        ]

    save_ocr_portal_chat_message(
        hospital_id,
        username,
        session_id,
        "assistant",
        answer,
        citations=json.dumps(citations),
    )
    return {"role": "assistant", "content": answer, "citations": citations}


def get_chat_history(hospital_id, username, session_id="default"):
    rows = list_ocr_portal_chat_history(hospital_id, username, session_id)
    history = []
    for row in rows:
        citations = []
        if row["citations"]:
            try:
                citations = json.loads(row["citations"])
            except (TypeError, ValueError):
                pass
        history.append(
            {"role": row["role"], "content": row["content"], "citations": citations}
        )
    return history


def clear_chat_history(hospital_id, username, session_id="default"):
    delete_ocr_portal_chat_history(hospital_id, username, session_id)
