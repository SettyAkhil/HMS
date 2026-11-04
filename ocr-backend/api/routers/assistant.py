import json
import uuid

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import StreamingResponse

from pydantic import BaseModel

from core.rate_limit import limiter
from core.schemas import ChatRequest, ChatResponse, IngestTextRequest, IngestVaultDocRequest, KBDocumentOut
from core.security import get_current_user, CurrentUser
from database.db_utils import add_session_doc, get_chat_history, get_document_full, get_session_docs, \
    log_audit_event, remove_session_doc, save_chat_message
from database.models import ExtractionJob, SessionLocal
from modules.rag_engine import HISTORY_TURNS, delete_document, list_documents, query as rag_query, \
    stream_query, suggest_questions
from workers.celery_app import run_ingest_job

router = APIRouter(prefix="/api/v1/assistant", tags=["assistant"])

DEFAULT_SESSION = "default"
CHAT_APP_TYPE = "LightRAG"  # kept as-is (not "RAG"/"Qdrant") so existing chat_history rows stay in one thread


def _dispatch_ingest_job(user_id: int, checkpoint: dict) -> str:
    """Creates an ExtractionJob(job_type="rag_ingest") and queues run_ingest_job
    against it. Ingestion runs off the request path (Celery), consistent with
    how OCR/summarization already work — embedding a large document inline in
    the request would block the event loop. document_id is left null: RAG
    ingestion works off VaultDocument/pasted text, not the `documents` table
    OCR/summarizer jobs use."""
    job_id = str(uuid.uuid4())
    db = SessionLocal()
    try:
        job = ExtractionJob(
            job_id=job_id,
            user_id=user_id,
            job_type="rag_ingest",
            status="PENDING",
            progress_checkpoint=checkpoint,
        )
        db.add(job)
        db.commit()
    finally:
        db.close()
    run_ingest_job.delay(job_id)
    return job_id


@router.post("/ingest/text")
async def ingest_text(payload: IngestTextRequest, current_user: CurrentUser = Depends(get_current_user)):
    if not payload.documents:
        raise HTTPException(status_code=400, detail="No documents provided.")
    job_id = _dispatch_ingest_job(current_user.user_id, {"kind": "text", "documents": payload.documents})
    return {"job_id": job_id, "message": f"Queued {len(payload.documents)} document(s) for ingestion."}


@router.post("/ingest/vault")
async def ingest_vault_docs(payload: IngestVaultDocRequest, current_user: CurrentUser = Depends(get_current_user)):
    """Load previously-OCR'd vault documents straight into the RAG index, without re-upload —
    mirrors the Document Vault's 'Load into RAG' action. Ingests at page granularity when the
    stored metadata has it (OCR's "pages" / the summarizer's "page_texts"), so citations can
    point at a specific page instead of just the whole document. Runs as a Celery job
    (workers/celery_app.py: run_ingest_job) — poll GET /ingest/job/{job_id} for status."""
    if not payload.doc_ids:
        raise HTTPException(status_code=400, detail="No document IDs provided.")
    job_id = _dispatch_ingest_job(current_user.user_id, {"kind": "vault", "doc_ids": payload.doc_ids})
    return {"job_id": job_id, "message": f"Queued {len(payload.doc_ids)} vault document(s) for ingestion."}


@router.get("/ingest/job/{job_id}")
async def ingest_job_status(job_id: str, current_user: CurrentUser = Depends(get_current_user)):
    db = SessionLocal()
    try:
        job = (
            db.query(ExtractionJob)
            .filter(ExtractionJob.job_id == job_id, ExtractionJob.user_id == current_user.user_id,
                    ExtractionJob.job_type == "rag_ingest")
            .first()
        )
        if not job:
            raise HTTPException(status_code=404, detail="Ingest job not found.")
        return {
            "job_id": job.job_id,
            "status": job.status,
            "progress": job.progress,
            "error_message": job.error_message,
            "ingested_chunks": (job.progress_checkpoint or {}).get("ingested_chunks"),
        }
    finally:
        db.close()


@router.get("/kb", response_model=list[KBDocumentOut])
async def kb_list(current_user: CurrentUser = Depends(get_current_user)):
    return list_documents(current_user.user_id)


@router.delete("/kb/{doc_id}")
async def kb_delete(doc_id: int, request: Request, current_user: CurrentUser = Depends(get_current_user)):
    removed = delete_document(current_user.user_id, doc_id)
    if not removed:
        raise HTTPException(status_code=404, detail="Document not found in your knowledge base.")
    log_audit_event(current_user.user_id, "assistant.kb_delete", "document", str(doc_id), request.client.host)
    return {"message": "Removed from the knowledge base."}


@router.post("/suggestions")
async def suggestions(payload: IngestVaultDocRequest, current_user: CurrentUser = Depends(get_current_user)):
    """Document-aware starting questions generated from a real sample of the
    given doc_ids' ingested content. Reuses IngestVaultDocRequest's shape
    (just a doc_ids list) rather than adding a near-identical schema.
    Always returns something usable (falls back to generic defaults) so the
    frontend never has to special-case an empty/error response."""
    result = await suggest_questions(current_user.user_id, payload.doc_ids)
    return {"suggestions": result}


@router.get("/history")
async def history(session_id: str = DEFAULT_SESSION, current_user: CurrentUser = Depends(get_current_user)):
    return get_chat_history(current_user.user_id, CHAT_APP_TYPE, session_id)


class SessionDocIn(BaseModel):
    doc_id: int
    filename: str


@router.get("/session/{session_id}/attachments")
async def session_attachments(session_id: str, current_user: CurrentUser = Depends(get_current_user)):
    return get_session_docs(current_user.user_id, session_id)


@router.post("/session/{session_id}/attachments")
async def add_session_attachment(session_id: str, payload: SessionDocIn,
                                  current_user: CurrentUser = Depends(get_current_user)):
    """Records that a document is attached/scoped to this conversation —
    server-side, so /chat and /chat/stream can fall back to it below even if
    a specific request doesn't carry doc_ids explicitly (e.g. after a page
    reload, before the frontend has re-synced its own attachment state)."""
    add_session_doc(current_user.user_id, session_id, payload.doc_id, payload.filename)
    return {"message": "Attached to this conversation."}


@router.delete("/session/{session_id}/attachments/{doc_id}")
async def remove_session_attachment(session_id: str, doc_id: int,
                                     current_user: CurrentUser = Depends(get_current_user)):
    remove_session_doc(current_user.user_id, session_id, doc_id)
    return {"message": "Detached from this conversation."}


def _resolve_doc_ids(user_id: int, session_id: str, requested: list) -> list:
    """If the request explicitly scoped to specific docs, honor that as-is
    (including an intentionally empty list, e.g. a dismissed attachment).
    Otherwise fall back to whatever's persisted server-side for this
    session — the fix for scoping silently disappearing between messages in
    the same conversation if client-side state ever gets out of sync."""
    if requested:
        return requested
    return [d["doc_id"] for d in get_session_docs(user_id, session_id)]


@router.post("/chat", response_model=ChatResponse)
@limiter.limit("30/minute")
async def chat(request: Request, payload: ChatRequest, current_user: CurrentUser = Depends(get_current_user)):
    # Fetched before save_chat_message so it doesn't include the current turn.
    history = get_chat_history(current_user.user_id, CHAT_APP_TYPE, payload.session_id)[-HISTORY_TURNS:]
    save_chat_message(current_user.user_id, CHAT_APP_TYPE, payload.session_id, "user", payload.message)
    doc_ids = _resolve_doc_ids(current_user.user_id, payload.session_id, payload.doc_ids)
    try:
        result = await rag_query(current_user.user_id, payload.message, payload.target_language,
                                  history=history, doc_ids=doc_ids)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Error querying knowledge base: {e}")

    save_chat_message(current_user.user_id, CHAT_APP_TYPE, payload.session_id, "assistant", result["answer"])
    log_audit_event(current_user.user_id, "assistant.chat", "session", payload.session_id,
                     detail={"citations": len(result["citations"])})
    return ChatResponse(content=result["answer"], citations=result["citations"])


@router.post("/chat/stream")
@limiter.limit("30/minute")
async def chat_stream(request: Request, payload: ChatRequest, current_user: CurrentUser = Depends(get_current_user)):
    """Server-Sent Events: one `data:` line per event — {"type":"citations",...}
    once, then {"type":"token","text":...} per generated token, then
    {"type":"done"}. EventSource doesn't support POST+auth headers, so the
    frontend consumes this via fetch + ReadableStream (see lib/api.ts)."""
    history = get_chat_history(current_user.user_id, CHAT_APP_TYPE, payload.session_id)[-HISTORY_TURNS:]
    save_chat_message(current_user.user_id, CHAT_APP_TYPE, payload.session_id, "user", payload.message)
    log_audit_event(current_user.user_id, "assistant.chat_stream", "session", payload.session_id)
    doc_ids = _resolve_doc_ids(current_user.user_id, payload.session_id, payload.doc_ids)

    async def event_generator():
        full_answer = ""
        try:
            async for event in stream_query(current_user.user_id, payload.message, payload.target_language,
                                             history=history, doc_ids=doc_ids):
                if event["type"] == "token":
                    full_answer += event["text"]
                yield f"data: {json.dumps(event)}\n\n"
        except Exception as e:
            yield f"data: {json.dumps({'type': 'error', 'message': str(e)})}\n\n"
        if full_answer:
            save_chat_message(current_user.user_id, CHAT_APP_TYPE, payload.session_id, "assistant", full_answer)

    return StreamingResponse(event_generator(), media_type="text/event-stream")
