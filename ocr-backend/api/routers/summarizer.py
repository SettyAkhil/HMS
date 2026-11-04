import hashlib
import os
import uuid

from fastapi import APIRouter, Depends, File, HTTPException, Request, UploadFile
from fastapi.responses import Response

from core.config import settings
from core.encryption import write_encrypted_upload
from core.rate_limit import limiter
from core.security import CurrentUser, get_current_user
from database.db_utils import get_document_full, log_audit_event
from database.models import Document, ExtractionJob, SessionLocal
from modules.pdf_summarizer import generate_summary_docx, generate_summary_pdf
from workers.celery_app import run_summary_job

router = APIRouter(prefix="/api/v1/summarizer", tags=["summarizer"])


@router.post("/upload")
@limiter.limit("20/minute")
async def upload(
    request: Request,
    file: UploadFile = File(...),
    current_user: CurrentUser = Depends(get_current_user),
):
    contents = await file.read()
    doc_hash = hashlib.md5(contents).hexdigest()
    file_path = os.path.join(settings.UPLOAD_DIR, f"{doc_hash}_{file.filename}")
    if not os.path.exists(file_path):
        write_encrypted_upload(file_path, contents)

    db = SessionLocal()
    try:
        doc = db.query(Document).filter(Document.id == doc_hash).first()
        if not doc:
            doc = Document(id=doc_hash, filename=file.filename, upload_path=file_path)
            db.add(doc)
            db.commit()

        job_id = str(uuid.uuid4())
        job = ExtractionJob(
            job_id=job_id,
            document_id=doc.id,
            user_id=current_user.user_id,
            job_type="summarizer",
            status="PENDING",
        )
        db.add(job)
        db.commit()
    finally:
        db.close()

    run_summary_job.delay(job_id)
    log_audit_event(current_user.user_id, "summarizer.upload", "document", doc_hash, request.client.host,
                     {"filename": file.filename, "job_id": job_id})

    return {
        "document_hash": doc_hash,
        "job_id": job_id,
        "message": "Document accepted and queued for summarization.",
    }


def _get_owned_job(db, job_id: str, user_id: int) -> ExtractionJob:
    job = (
        db.query(ExtractionJob)
        .filter(ExtractionJob.job_id == job_id, ExtractionJob.user_id == user_id)
        .first()
    )
    if not job:
        raise HTTPException(status_code=404, detail="Job not found.")
    return job


@router.get("/job/{job_id}")
async def job_status(job_id: str, current_user: CurrentUser = Depends(get_current_user)):
    db = SessionLocal()
    try:
        job = _get_owned_job(db, job_id, current_user.user_id)
        return {
            "job_id": job.job_id,
            "document_hash": job.document_id,
            "status": job.status,
            "progress": job.progress,
            "error_message": job.error_message,
        }
    finally:
        db.close()


@router.get("/job/{job_id}/result")
async def job_result(job_id: str, current_user: CurrentUser = Depends(get_current_user)):
    db = SessionLocal()
    try:
        job = _get_owned_job(db, job_id, current_user.user_id)
        if job.status != "COMPLETED":
            raise HTTPException(status_code=409, detail=f"Job is {job.status}, not completed yet.")
        result_doc_id = job.result_doc_id
    finally:
        db.close()

    doc = get_document_full(result_doc_id, current_user.user_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Result document not found.")

    return {
        "filename": doc["filename"],
        "summary_md": doc["markdown"],
        "page_texts": doc["metadata"].get("page_texts", {}),
        "patient_meta": doc["metadata"].get("patient_meta", {}),
    }


@router.get("/job/{job_id}/export")
async def export(
    job_id: str, format: str = "md", current_user: CurrentUser = Depends(get_current_user)
):
    db = SessionLocal()
    try:
        job = _get_owned_job(db, job_id, current_user.user_id)
        if job.status != "COMPLETED":
            raise HTTPException(status_code=409, detail=f"Job is {job.status}, not completed yet.")
        result_doc_id = job.result_doc_id
    finally:
        db.close()

    doc = get_document_full(result_doc_id, current_user.user_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Result document not found.")

    log_audit_event(current_user.user_id, "summarizer.export", "job", job_id, detail={"format": format})

    summary_md = doc["markdown"]
    meta = doc["metadata"].get("patient_meta", {})
    name = meta.get("name", "Patient")
    ip_no = meta.get("ip_no", "—")
    doctor = meta.get("doctor", "—")
    nurse = meta.get("nurse", "—")

    import urllib.parse
    raw_filename = doc.get("filename", "summary")
    base_filename = os.path.splitext(raw_filename)[0]
    filename = urllib.parse.quote(base_filename)

    if format == "md":
        return Response(
            content=summary_md,
            media_type="text/markdown",
            headers={"Content-Disposition": f'attachment; filename="{filename}.md"'}
        )
    if format == "pdf":
        data = generate_summary_pdf(summary_md, name, ip_no, doctor, nurse)
        if isinstance(data, str):
            raise HTTPException(status_code=500, detail=data)
        return Response(
            content=data,
            media_type="application/pdf",
            headers={"Content-Disposition": f'attachment; filename="{filename}.pdf"'}
        )
    if format == "docx":
        data = generate_summary_docx(summary_md, name, ip_no, doctor, nurse)
        if isinstance(data, str):
            raise HTTPException(status_code=500, detail=data)
        return Response(
            content=data,
            media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            headers={"Content-Disposition": f'attachment; filename="{filename}.docx"'}
        )

    raise HTTPException(status_code=400, detail="Unsupported format. Use md|pdf|docx.")
