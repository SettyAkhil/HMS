from fastapi import APIRouter, Depends

from core.schemas import ActiveJobSummary, DashboardSummary, VaultDocSummary
from core.security import CurrentUser, get_current_user
from database.db_utils import get_user_vault
from database.models import Document, ExtractionJob, SessionLocal

router = APIRouter(prefix="/api/v1/dashboard", tags=["dashboard"])


@router.get("/summary", response_model=DashboardSummary)
async def summary(current_user: CurrentUser = Depends(get_current_user)):
    vault_rows = get_user_vault(current_user.user_id)

    recent_documents = [
        VaultDocSummary(
            id=row[0],
            filename=row[1],
            doc_category=row[2],
            confidence_score=row[3],
            extraction_date=str(row[4]) if row[4] else None,
        )
        for row in vault_rows[:5]
    ]

    db = SessionLocal()
    try:
        jobs = (
            db.query(ExtractionJob)
            .filter(
                ExtractionJob.user_id == current_user.user_id,
                ExtractionJob.status.in_(["PENDING", "PROCESSING"]),
            )
            .order_by(ExtractionJob.created_at.desc())
            .limit(10)
            .all()
        )
        active_jobs = []
        for job in jobs:
            document = db.query(Document).filter(Document.id == job.document_id).first()
            active_jobs.append(
                ActiveJobSummary(
                    job_id=job.job_id,
                    job_type=job.job_type,
                    status=job.status,
                    progress=job.progress,
                    filename=document.filename if document else None,
                )
            )
    finally:
        db.close()

    return DashboardSummary(
        vault_document_count=len(vault_rows),
        active_jobs=active_jobs,
        recent_documents=recent_documents,
    )
