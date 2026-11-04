import hashlib
import os
import uuid

from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, UploadFile
from fastapi.responses import Response

from core.config import settings
from core.encryption import read_encrypted_upload, write_encrypted_upload
from core.rate_limit import limiter
from core.security import CurrentUser, get_current_user
from database.db_utils import get_document_full, log_audit_event
from database.models import Document, ExtractionJob, SessionLocal
from modules.precision_ocr import (
    BLUEPRINTS,
    generate_docx,
    generate_excel,
    generate_json,
    generate_pro_pdf,
)
from workers.celery_app import run_ocr_job

router = APIRouter(prefix="/api/v1/ocr", tags=["ocr"])


@router.get("/blueprints")
async def blueprints():
    return {"blueprints": list(BLUEPRINTS.keys())}


@router.post("/upload")
@limiter.limit("20/minute")
async def upload(
    request: Request,
    file: UploadFile = File(...),
    client_blueprint: str = Form("Universal OCR (Any Text)"),
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
            job_type="ocr",
            status="PENDING",
            blueprint=client_blueprint,
        )
        db.add(job)
        db.commit()
    finally:
        db.close()

    run_ocr_job.delay(job_id)
    log_audit_event(current_user.user_id, "ocr.upload", "document", doc_hash, request.client.host,
                     {"filename": file.filename, "job_id": job_id})

    return {
        "document_hash": doc_hash,
        "job_id": job_id,
        "message": "Document accepted and queued for extraction.",
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
            "result_doc_id": job.result_doc_id,
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
        extraction_time = None
        if job.completed_at and job.created_at:
            extraction_time = round((job.completed_at - job.created_at).total_seconds(), 2)
    finally:
        db.close()

    doc = get_document_full(result_doc_id, current_user.user_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Result document not found.")

    return {
        "filename": doc["filename"],
        "combined_markdown": doc["markdown"],
        "pages": doc["metadata"].get("pages", []),
        "entities": doc["metadata"].get("predictions", []),
        "confidence_score": doc["confidence_score"],
        "extraction_time": extraction_time,
    }


@router.get("/job/{job_id}/original")
async def job_original(job_id: str, current_user: CurrentUser = Depends(get_current_user)):
    db = SessionLocal()
    try:
        job = _get_owned_job(db, job_id, current_user.user_id)
        doc = db.query(Document).filter(Document.id == job.document_id).first()
        if not doc or not doc.upload_path:
            raise HTTPException(status_code=404, detail="Original document not found.")
        
        resolved_path = doc.upload_path
        if not os.path.exists(resolved_path):
            resolved_path = os.path.join(settings.UPLOAD_DIR, os.path.basename(resolved_path))
            
        if not os.path.exists(resolved_path):
            raise HTTPException(status_code=404, detail="Original document not found.")

        ext = os.path.splitext(doc.filename)[1].lower()
        media_type = "application/pdf" if ext == ".pdf" else "image/jpeg"
        if ext == ".png": media_type = "image/png"

        # Encrypted at rest (core/encryption.py) — decrypt before serving;
        # can't use FileResponse (streams the raw, still-encrypted file).
        return Response(content=read_encrypted_upload(doc.upload_path), media_type=media_type)
    finally:
        db.close()



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

    log_audit_event(current_user.user_id, "ocr.export", "job", job_id, detail={"format": format})

    combined = doc["markdown"]
    client_name = doc["doc_category"] or "Universal OCR"

    if format == "md":
        return Response(content=combined, media_type="text/markdown")
    if format == "json":
        return Response(content=generate_json(combined), media_type="application/json")
    if format == "pdf":
        data = generate_pro_pdf(combined, client_name)
        if isinstance(data, str):
            raise HTTPException(status_code=500, detail=data)
        return Response(content=data, media_type="application/pdf")
    if format == "docx":
        data = generate_docx(combined, client_name)
        if isinstance(data, str):
            raise HTTPException(status_code=500, detail=data)
        return Response(
            content=data,
            media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        )
    if format == "xlsx":
        data = generate_excel(combined)
        if not data:
            raise HTTPException(status_code=404, detail="No tabular data found to export.")
        return Response(
            content=data,
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        )

    raise HTTPException(status_code=400, detail="Unsupported format. Use md|json|pdf|docx|xlsx.")
