"""
Celery worker layer — replaces FastAPI BackgroundTasks for OCR/summarization
jobs so they survive process restarts, retry on transient failure, and (for
OCR) fan out per-page across multiple worker processes instead of running
sequentially in one long task.

Job lifecycle for OCR (see api/routers/ocr.py):
  run_ocr_job(job_id)                — dispatcher: figures out how many pages,
                                        skips pages already in progress_checkpoint
                                        (resume-after-crash), fans the rest out as
                                        a Celery chord.
    -> ocr_page_task(job_id, i, n)   — one page each, independently retryable.
                                        Writes its result into
                                        ExtractionJob.progress_checkpoint[str(i)]
                                        atomically (Postgres jsonb_set) so
                                        concurrent page tasks don't clobber
                                        each other, and so a killed/restarted
                                        worker only re-does the pages that
                                        hadn't checkpointed yet.
    -> finalize_ocr_job(...)         — chord callback: reads the *complete*
                                        checkpoint (old + new pages), merges,
                                        archives to the vault, marks COMPLETED.

Job lifecycle for summarization: run_summary_job(job_id) — a single retryable
task wrapping the existing modules.pdf_summarizer pipeline. Not checkpointed
per-chunk in this phase (see plan) — a retry restarts the document from
scratch, unlike the OCR path.

Known limitation: if a page task exhausts its retries, the job row is marked
FAILED directly (see _mark_job_failed) rather than relying on Celery chord
error-callback propagation, which has known rough edges around partial-failure
semantics. The frontend's polling loop sees FAILED either way.
"""
import io
import json
import logging
from datetime import datetime

from celery import Celery, chord
from celery.exceptions import MaxRetriesExceededError
from PIL import Image
from sqlalchemy import text

from core.config import settings
from core.encryption import read_encrypted_upload
from database.db_utils import archive_document, get_document_full
from database.models import Document, ExtractionJob, SessionLocal
from modules.grounding import normalize_predictions
from modules.precision_ocr import (
    is_blank_page,
    load_pdf_page,
    load_pdf_page_count,
    load_pdf_page_thumbnail,
    page_phash,
    process_single_page,
)
from modules.pdf_summarizer import run_summary_pipeline

logger = logging.getLogger(__name__)

celery_app = Celery(
    "keppler_workers",
    broker=settings.CELERY_BROKER_URL,
    backend=settings.CELERY_RESULT_BACKEND,
)

celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="UTC",
    enable_utc=True,
    task_track_started=True,
    # One task at a time per worker process — these are GPU-bound (vLLM) calls,
    # prefetching more just means other workers starve while this one queues up.
    worker_prefetch_multiplier=1,
    task_acks_late=True,
)


def _mark_job_failed(job_id: str, message: str):
    db = SessionLocal()
    try:
        job = db.query(ExtractionJob).filter(ExtractionJob.job_id == job_id).first()
        if job and job.status != "COMPLETED":
            job.status = "FAILED"
            job.error_message = message
            db.commit()
    finally:
        db.close()


def _write_checkpoint_entry(db, job_id: str, page_idx: int, value: dict):
    """Atomic per-key write (Postgres jsonb_set) so concurrent page tasks never
    clobber each other's checkpoint entries with a naive read-modify-write.
    progress_checkpoint is a `json` column so we cast to jsonb and back."""
    db.execute(
        text(
            "UPDATE extraction_jobs SET progress_checkpoint = (jsonb_set("
            "COALESCE(progress_checkpoint::jsonb, '{}'::jsonb), ARRAY[:key]::text[], "
            "CAST(:val AS jsonb), true))::json WHERE job_id = :job_id"
        ),
        {"key": str(page_idx), "val": json.dumps(value), "job_id": job_id},
    )
    db.commit()


# ---------------------------------------------------------------------------
# OCR pipeline
# ---------------------------------------------------------------------------
@celery_app.task(bind=True, max_retries=3, acks_late=True)
def ocr_page_task(self, job_id: str, page_idx: int, total_pages: int):
    """Process exactly one page and atomically checkpoint its result."""
    db = SessionLocal()
    try:
        job = db.query(ExtractionJob).filter(ExtractionJob.job_id == job_id).first()
        document = db.query(Document).filter(Document.id == job.document_id).first()
        blueprint = job.blueprint or "Universal OCR (Any Text)"
        filename = document.filename
        file_path = document.upload_path

        label = f"Page {page_idx + 1}"
        if filename.lower().endswith(".pdf"):
            file_bytes = read_encrypted_upload(file_path)
            img = load_pdf_page(file_bytes, page_idx)
        else:
            img = Image.open(io.BytesIO(read_encrypted_upload(file_path)))

        if is_blank_page(img):
            logger.info(f"Job {job_id}: {label} is blank — skipping full OCR pipeline")
            result = {"label": label, "text": f"*[{label}: blank page]*", "predictions": []}
        else:
            result = process_single_page(img, label, page_idx, total_pages, blueprint)

        _write_checkpoint_entry(db, job_id, page_idx, result)

        db.refresh(job)
        done_count = len(job.progress_checkpoint or {})
        job.progress = round(done_count / total_pages * 100, 1)
        db.commit()
        return {"page_idx": page_idx}
    except Exception as exc:
        db.rollback()
        try:
            raise self.retry(exc=exc, countdown=min(2 ** self.request.retries, 60))
        except MaxRetriesExceededError:
            _mark_job_failed(job_id, f"Page {page_idx + 1} failed after retries: {exc}")
            raise
    finally:
        db.close()


@celery_app.task(bind=True)
def finalize_ocr_job(self, _page_task_results, job_id: str):
    """Chord callback — merges the FULL checkpoint (pages from this run and any
    already-completed pages from a prior crashed attempt), archives, completes."""
    db = SessionLocal()
    try:
        job = db.query(ExtractionJob).filter(ExtractionJob.job_id == job_id).first()
        if not job:
            logger.error(f"finalize_ocr_job: job {job_id} not found")
            return

        document = db.query(Document).filter(Document.id == job.document_id).first()
        checkpoint = job.progress_checkpoint or {}
        ordered = sorted(checkpoint.items(), key=lambda kv: int(kv[0]))

        def _resolve(key: str, value: dict) -> dict:
            """Duplicate-page markers (see run_ocr_job) reference an earlier
            page's real result by index — substitute it in here, keeping this
            page's own label."""
            if "duplicate_of" not in value:
                return value
            canonical = checkpoint.get(str(value["duplicate_of"]), {})
            label = f"Page {int(key) + 1} (duplicate of Page {value['duplicate_of'] + 1})"
            return {
                "label": label,
                "text": canonical.get("text", ""),
                "predictions": canonical.get("predictions", []),
            }

        resolved = [(k, _resolve(k, v)) for k, v in ordered]
        all_pages_text = [(v["label"], v["text"]) for _, v in resolved]
        all_preds = []
        for _, v in resolved:
            all_preds.extend(v.get("predictions", []))
        # Phase 5: normalize onto RegionPrediction before persisting, so every
        # field the API returns carries page/bbox/confidence/OCR-model-used
        # consistently, regardless of which internal stage produced it.
        all_preds = normalize_predictions(all_preds)

        if len(all_pages_text) == 1:
            combined = all_pages_text[0][1]
        else:
            parts = [f"---\n### {lbl}\n\n{txt}" for lbl, txt in all_pages_text]
            combined = "\n\n".join(parts)

        vault_id = archive_document(
            user_id=job.user_id,
            filename=document.filename,
            category=job.blueprint or "Universal OCR (Any Text)",
            markdown=combined,
            confidence=99.0,
            metadata={
                "predictions": all_preds,
                "pages": [{"label": lbl, "text": txt} for lbl, txt in all_pages_text],
            },
        )

        job.result_doc_id = vault_id
        job.status = "COMPLETED"
        job.progress = 100.0
        job.completed_at = datetime.utcnow()
        db.commit()
        logger.info(f"OCR job {job_id} completed ({len(all_pages_text)} pages)")
    except Exception as e:
        db.rollback()
        _mark_job_failed(job_id, str(e))
        raise
    finally:
        db.close()


@celery_app.task(bind=True, max_retries=2, acks_late=True)
def run_ocr_job(self, job_id: str):
    """Dispatcher: sizes the document, skips pages already checkpointed (resume
    after a crash/kill), and fans the remainder out as a chord."""
    db = SessionLocal()
    try:
        job = db.query(ExtractionJob).filter(ExtractionJob.job_id == job_id).first()
        if not job:
            logger.error(f"run_ocr_job: job {job_id} not found")
            return
        document = db.query(Document).filter(Document.id == job.document_id).first()

        job.status = "PROCESSING"
        db.commit()

        if document.filename.lower().endswith(".pdf"):
            total_pages = load_pdf_page_count(read_encrypted_upload(document.upload_path))
        else:
            total_pages = 1

        if job.total_units != total_pages:
            job.total_units = total_pages
            db.commit()

        done_pages = set((job.progress_checkpoint or {}).keys())
        missing = [i for i in range(total_pages) if str(i) not in done_pages]

        # Duplicate-page detection: perceptual-hash every not-yet-done page
        # (cheap low-DPI thumbnail render, not the full 300 DPI OCR render) and
        # short-circuit exact re-scans/duplicates to reuse an earlier page's
        # result instead of paying for a second real OCR pass. Common in real
        # hospital scan batches (see uploads/ — several repeated WhatsApp
        # re-uploads of the same shot). Only meaningful for multi-page PDFs.
        to_dispatch = list(missing)
        if document.filename.lower().endswith(".pdf") and len(missing) > 1:
            file_bytes = read_encrypted_upload(document.upload_path)
            seen_hashes: dict[str, int] = {}
            to_dispatch = []
            for i in missing:
                try:
                    phash = page_phash(load_pdf_page_thumbnail(file_bytes, i))
                except Exception as e:
                    logger.warning(f"Job {job_id}: hashing page {i} failed, will OCR normally: {e}")
                    to_dispatch.append(i)
                    continue
                canonical_idx = seen_hashes.get(phash)
                if canonical_idx is not None:
                    logger.info(f"Job {job_id}: page {i} is a duplicate of page {canonical_idx} — skipping OCR")
                    _write_checkpoint_entry(db, job_id, i, {"duplicate_of": canonical_idx})
                else:
                    seen_hashes[phash] = i
                    to_dispatch.append(i)
        missing = to_dispatch
    except Exception as exc:
        try:
            raise self.retry(exc=exc, countdown=10)
        except MaxRetriesExceededError:
            _mark_job_failed(job_id, f"Failed to start job: {exc}")
            raise
    finally:
        db.close()

    if not missing:
        finalize_ocr_job.delay([], job_id)
        return

    chord(ocr_page_task.s(job_id, i, total_pages) for i in missing)(finalize_ocr_job.s(job_id))


# ---------------------------------------------------------------------------
# Summarizer pipeline (single retryable task — not per-chunk checkpointed yet)
# ---------------------------------------------------------------------------
@celery_app.task(bind=True, max_retries=2, acks_late=True)
def run_summary_job(self, job_id: str):
    db = SessionLocal()
    try:
        job = db.query(ExtractionJob).filter(ExtractionJob.job_id == job_id).first()
        if not job:
            logger.error(f"run_summary_job: job {job_id} not found")
            return
        document = db.query(Document).filter(Document.id == job.document_id).first()

        job.status = "PROCESSING"
        db.commit()

        def progress_cb(pct: float):
            db2 = SessionLocal()
            try:
                j = db2.query(ExtractionJob).filter(ExtractionJob.job_id == job_id).first()
                j.progress = round(pct * 100, 1)
                db2.commit()
            finally:
                db2.close()

        pdf_bytes = read_encrypted_upload(document.upload_path)

        result = run_summary_pipeline(pdf_bytes, filename=document.filename, progress_cb=progress_cb)

        name, ip_no, doctor, nurse = result["patient_meta"]
        vault_id = archive_document(
            user_id=job.user_id,
            filename=document.filename,
            category="PDF Summary",
            markdown=result["summary_md"],
            confidence=99.0,
            metadata={
                "page_texts": {str(k): v for k, v in result["page_texts"].items()},
                "patient_meta": {"name": name, "ip_no": ip_no, "doctor": doctor, "nurse": nurse},
            },
        )

        job.result_doc_id = vault_id
        job.status = "COMPLETED"
        job.progress = 100.0
        job.completed_at = datetime.utcnow()
        db.commit()
    except Exception as exc:
        db.rollback()
        try:
            raise self.retry(exc=exc, countdown=10)
        except MaxRetriesExceededError:
            _mark_job_failed(job_id, str(exc))
            raise
    finally:
        db.close()


# ---------------------------------------------------------------------------
# RAG ingestion (Phase 9) — moved off the request path so a large vault
# document doesn't block the FastAPI event loop during embedding, consistent
# with how OCR/summarization already run as Celery tasks. The router stores
# what to ingest in ExtractionJob.progress_checkpoint (an existing JSON
# column) rather than serializing potentially-large page text through task
# args; the task re-derives content from the DB, same pattern run_summary_job
# uses for its Document row.
# ---------------------------------------------------------------------------
@celery_app.task(bind=True, max_retries=2, acks_late=True)
def run_ingest_job(self, job_id: str):
    from modules.rag_engine import ingest_document

    db = SessionLocal()
    try:
        job = db.query(ExtractionJob).filter(ExtractionJob.job_id == job_id).first()
        if not job:
            logger.error(f"run_ingest_job: job {job_id} not found")
            return

        job.status = "PROCESSING"
        db.commit()

        payload = job.progress_checkpoint or {}
        kind = payload.get("kind")
        user_id = job.user_id
        total_chunks = 0

        if kind == "vault":
            doc_ids = payload.get("doc_ids", [])
            for i, doc_id in enumerate(doc_ids):
                doc = get_document_full(doc_id, user_id)
                if not doc:
                    continue
                metadata = doc.get("metadata") or {}
                if metadata.get("pages"):
                    page_chunks = [(p["label"], p["text"]) for p in metadata["pages"]]
                elif metadata.get("page_texts"):
                    page_chunks = [(f"Page {k}", v) for k, v in metadata["page_texts"].items()]
                else:
                    page_chunks = [("Document", doc["markdown"])]
                total_chunks += ingest_document(user_id, doc_id, doc["filename"], doc["doc_category"], page_chunks)
                job.progress = round((i + 1) / max(len(doc_ids), 1) * 100, 1)
                db.commit()
        elif kind == "text":
            documents = payload.get("documents", [])
            for i, text in enumerate(documents):
                doc_id = abs(hash(f"{user_id}:{text[:100]}")) % 1_000_000_000
                total_chunks += ingest_document(user_id, doc_id, f"Pasted Text {i + 1}", "manual", [("Text", text)])
                job.progress = round((i + 1) / max(len(documents), 1) * 100, 1)
                db.commit()
        else:
            raise ValueError(f"Unknown ingest kind: {kind!r}")

        job.status = "COMPLETED"
        job.progress = 100.0
        job.progress_checkpoint = {**payload, "ingested_chunks": total_chunks}
        job.completed_at = datetime.utcnow()
        db.commit()
    except Exception as exc:
        db.rollback()
        try:
            raise self.retry(exc=exc, countdown=10)
        except MaxRetriesExceededError:
            _mark_job_failed(job_id, str(exc))
            raise
    finally:
        db.close()
