"""Data retention, run nightly by the worker. Periods are environment
settings so each hospital can match its own policy and the law it follows:

- audit logs older than HR_AUDIT_RETENTION_DAYS are deleted;
- relayed outbox events older than 30 days are deleted;
- scheduled report files older than HR_REPORT_RETENTION_DAYS are deleted;
- candidates rejected or withdrawn more than HR_CANDIDATE_RETENTION_DAYS ago
  are anonymised and their uploaded files removed.

Employee records, payroll and raw punches are kept: they are statutory
records, and the raw punch ledger is append-only by design."""

import os
from datetime import datetime, timedelta, timezone
from pathlib import Path

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.config import settings
from app.models import AuditLog, OutboxEvent
from app.models.engagement import ReportRun
from app.models.talent import Application, Candidate, EmployeeDocument
from app.services.common import audit


def _days(name: str, default: int) -> int:
    return int(os.getenv(name, str(default)))


def purge(db: Session) -> dict:
    now = datetime.now(timezone.utc)
    audit_cut = now - timedelta(days=_days("HR_AUDIT_RETENTION_DAYS", 2920))
    report_cut = now - timedelta(days=_days("HR_REPORT_RETENTION_DAYS", 90))
    cand_cut = now - timedelta(days=_days("HR_CANDIDATE_RETENTION_DAYS", 365))
    out = {
        "audit_logs": db.execute(delete(AuditLog).where(AuditLog.created_at < audit_cut)).rowcount,
        "outbox": db.execute(delete(OutboxEvent).where(OutboxEvent.published_at.is_not(None),
                                                       OutboxEvent.published_at < now - timedelta(days=30))).rowcount,
        "report_files": 0, "candidates": 0,
    }
    for r in db.scalars(select(ReportRun).where(ReportRun.created_at < report_cut, ReportRun.storage_key.is_not(None))):
        (Path(settings.document_root) / str(r.tenant_id) / r.storage_key).unlink(missing_ok=True)
        r.storage_key = None
        out["report_files"] += 1
    stale = select(Application.candidate_id).where(Application.stage.in_(("rejected", "withdrawn")),
                                                   Application.updated_at < cand_cut)
    active = select(Application.candidate_id).where(Application.stage.notin_(("rejected", "withdrawn")))
    for c in db.scalars(select(Candidate).where(Candidate.id.in_(stale), Candidate.id.notin_(active),
                                                Candidate.deleted_at.is_(None))):
        for d in db.scalars(select(EmployeeDocument).where(EmployeeDocument.candidate_id == c.id,
                                                           EmployeeDocument.employee_id.is_(None))):
            (Path(settings.document_root) / str(d.tenant_id) / d.storage_key).unlink(missing_ok=True)
            d.archived_at = now
        c.first_name, c.last_name, c.email, c.phone = "Removed", None, None, None
        c.current_employer, c.notes, c.resume_document_id = None, None, None
        c.deleted_at = now
        out["candidates"] += 1
    if any(out.values()):
        audit(db, "retention", now.date(), "purged", out)
    db.flush()
    return out
