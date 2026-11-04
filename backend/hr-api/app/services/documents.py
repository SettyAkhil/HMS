"""Employee documents in private storage.

Files are written under HR_DOCUMENT_ROOT/<tenant>/<random key>, a volume that
nothing serves directly; every download goes through `can_read` and an
audited endpoint. Uploading a file under an existing document creates a new
version and keeps the old one. Type is checked by content (magic bytes), not
by the name the browser sent."""

import hashlib
import os
import uuid
from datetime import date, datetime, timezone
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import settings
from app.errors import AppError, Forbidden, NotFound
from app.models import Employee
from app.models.talent import EmployeeDocument
from app.security import DOCUMENTS_WRITE, EMPLOYEES_WRITE, GRIEVANCES_MANAGE, RECRUITMENT_WRITE, Principal
from app.services.common import actor_of, audit, tenant_of

MAX_BYTES = 10 * 1024 * 1024
SIGNATURES = [
    (b"%PDF-", "application/pdf", ".pdf"),
    (b"\x89PNG\r\n\x1a\n", "image/png", ".png"),
    (b"\xff\xd8\xff", "image/jpeg", ".jpg"),
    (b"PK\x03\x04", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", ".docx"),
]
CATEGORIES = ("identity", "address_proof", "education", "registration", "experience", "medical", "contract",
              "offer_letter", "resume", "training_certificate", "leave_support", "evidence", "other")


def sniff(data: bytes) -> tuple[str, str]:
    for magic, ctype, ext in SIGNATURES:
        if data.startswith(magic):
            return ctype, ext
    raise AppError("Only PDF, PNG, JPEG or DOCX files are accepted")


def _path(tenant_id: uuid.UUID, key: str) -> Path:
    return Path(settings.document_root) / str(tenant_id) / key


def can_read(db: Session, doc: EmployeeDocument, principal: Principal) -> bool:
    if doc.access_level == "confidential":
        return principal.can(GRIEVANCES_MANAGE)
    if doc.candidate_id and not doc.employee_id:
        return principal.can(RECRUITMENT_WRITE)
    if principal.can(DOCUMENTS_WRITE) or principal.can(EMPLOYEES_WRITE):
        return True
    if doc.access_level == "employee" and doc.employee_id:
        emp = db.get(Employee, doc.employee_id)
        return bool(emp and emp.hms_username and emp.hms_username == principal.username)
    return False


def upload(db: Session, *, data: bytes, filename: str, category: str, title: str, employee_id=None,
           candidate_id=None, issue_date: date | None = None, expiry_date: date | None = None,
           access_level: str = "employee", replaces: uuid.UUID | None = None) -> EmployeeDocument:
    if not data:
        raise AppError("The file is empty")
    if len(data) > MAX_BYTES:
        raise AppError("Files are limited to 10 MB")
    if category not in CATEGORIES:
        raise AppError("Unknown document category", {"allowed": list(CATEGORIES)})
    if not (employee_id or candidate_id):
        raise AppError("A document belongs to an employee or a candidate")
    if issue_date and expiry_date and expiry_date <= issue_date:
        raise AppError("Expiry date must be after the issue date")
    ctype, ext = sniff(data)
    version, previous = 1, None
    if replaces:
        previous = db.get(EmployeeDocument, replaces)
        if previous is None or previous.employee_id != employee_id:
            raise NotFound("Document to replace not found")
        previous.is_current = False
        version = previous.version + 1
    key = f"{uuid.uuid4().hex}{ext}"
    path = _path(tenant_of(db), key)
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(".part")
    with open(tmp, "wb") as fh:
        fh.write(data)
    os.replace(tmp, path)
    safe_name = "".join(ch for ch in os.path.basename(filename or "document") if ch.isalnum() or ch in "._- ")[:200]
    doc = EmployeeDocument(
        tenant_id=tenant_of(db), employee_id=employee_id, candidate_id=candidate_id, category=category,
        title=title, version=version, previous_version_id=previous.id if previous else None, storage_key=key,
        filename=safe_name or f"document{ext}", content_type=ctype, size_bytes=len(data),
        sha256=hashlib.sha256(data).hexdigest(), issue_date=issue_date, expiry_date=expiry_date,
        access_level=access_level, created_by=actor_of(db))
    db.add(doc)
    db.flush()
    audit(db, "employee_document", doc.id, "uploaded", {"employee_id": employee_id, "category": category,
                                                        "version": version, "sha256": doc.sha256})
    return doc


def get(db: Session, doc_id: uuid.UUID, principal: Principal) -> EmployeeDocument:
    doc = db.get(EmployeeDocument, doc_id)
    if doc is None or not can_read(db, doc, principal):
        raise NotFound("Document not found")  # not 403: do not confirm it exists
    return doc


def read_bytes(db: Session, doc: EmployeeDocument) -> bytes:
    path = _path(doc.tenant_id, doc.storage_key)
    if not path.is_file():
        raise NotFound("The stored file is missing")
    data = path.read_bytes()
    if hashlib.sha256(data).hexdigest() != doc.sha256:
        raise AppError("Stored file failed its integrity check; contact the administrator")
    audit(db, "employee_document", doc.id, "downloaded")
    return data


def list_for(db: Session, principal: Principal, employee_id=None, candidate_id=None, include_history=False):
    stmt = select(EmployeeDocument).where(EmployeeDocument.archived_at.is_(None)).order_by(
        EmployeeDocument.category, EmployeeDocument.created_at.desc())
    if employee_id:
        stmt = stmt.where(EmployeeDocument.employee_id == employee_id)
    if candidate_id:
        stmt = stmt.where(EmployeeDocument.candidate_id == candidate_id)
    if not include_history:
        stmt = stmt.where(EmployeeDocument.is_current)
    return [d for d in db.scalars(stmt.limit(500)) if can_read(db, d, principal)]


def verify(db: Session, doc_id: uuid.UUID, verdict: str, principal: Principal) -> EmployeeDocument:
    doc = get(db, doc_id, principal)
    if not principal.can(DOCUMENTS_WRITE):
        raise Forbidden("Verifying documents needs document management rights")
    doc.verification_status, doc.verified_by, doc.verified_at = verdict, actor_of(db), datetime.now(timezone.utc)
    audit(db, "employee_document", doc.id, verdict)
    return doc


def archive(db: Session, doc_id: uuid.UUID, principal: Principal) -> None:
    doc = get(db, doc_id, principal)
    if not principal.can(DOCUMENTS_WRITE):
        raise Forbidden("Archiving documents needs document management rights")
    doc.archived_at = datetime.now(timezone.utc)
    audit(db, "employee_document", doc.id, "archived")


def doc_out(d: EmployeeDocument) -> dict:
    today = date.today()
    return {c: getattr(d, c) for c in ("id", "employee_id", "candidate_id", "category", "title", "version",
                                       "previous_version_id", "is_current", "filename", "content_type", "size_bytes",
                                       "issue_date", "expiry_date", "access_level", "verification_status",
                                       "verified_by", "verified_at", "created_at", "created_by")} | {
        "days_to_expiry": (d.expiry_date - today).days if d.expiry_date else None}
