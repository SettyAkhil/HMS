"""
User/vault/chat data access — backed by the unified Postgres schema in
database/models.py (User, VaultDocument, ChatMessage). Function signatures are
kept identical to the old raw-sqlite3 version so callers (api/routers/auth.py,
vault.py, assistant.py, dashboard.py) don't need to change.
"""
import bcrypt

from database.models import AuditLog, ChatMessage, ChatSessionDoc, SessionLocal, User, VaultDocument


def initialize_extended_schema():
    """No-op: schema is created/updated via `alembic upgrade head` (see alembic/)."""
    pass


def register_user(username, plain_password):
    hashed = bcrypt.hashpw(plain_password.encode("utf-8"), bcrypt.gensalt())
    db = SessionLocal()
    try:
        if db.query(User).filter(User.username == username).first():
            return False, "Username already exists."
        db.add(User(username=username, password_hash=hashed.decode("utf-8")))
        db.commit()
        return True, "Registration successful. Please log in."
    finally:
        db.close()


def verify_login(username, plain_password):
    """Returns (ok, user_id, role). role is None when ok is False."""
    db = SessionLocal()
    try:
        user = db.query(User).filter(User.username == username).first()
        if user and bcrypt.checkpw(plain_password.encode("utf-8"), user.password_hash.encode("utf-8")):
            return True, user.id, user.role
        return False, None, None
    finally:
        db.close()


def log_audit_event(user_id, action, resource_type=None, resource_id=None, ip_address=None, detail=None):
    """Append-only audit trail (Phase 6) — who did what, when. Never raises:
    a logging failure must not break the request it's auditing."""
    db = SessionLocal()
    try:
        db.add(AuditLog(
            user_id=user_id,
            action=action,
            resource_type=resource_type,
            resource_id=str(resource_id) if resource_id is not None else None,
            ip_address=ip_address,
            detail=detail,
        ))
        db.commit()
    except Exception:
        db.rollback()
    finally:
        db.close()


def list_users():
    """Admin-only read path (api/routers/admin.py)."""
    db = SessionLocal()
    try:
        rows = db.query(User).order_by(User.id.asc()).all()
        return [
            {"id": u.id, "username": u.username, "role": u.role, "created_at": str(u.created_at)}
            for u in rows
        ]
    finally:
        db.close()


def set_user_role(user_id, role):
    """Admin-only write path (api/routers/admin.py). Returns True if the user existed."""
    db = SessionLocal()
    try:
        user = db.query(User).filter(User.id == user_id).first()
        if not user:
            return False
        user.role = role
        db.commit()
        return True
    finally:
        db.close()


def get_audit_log(limit=200, user_id=None, action=None):
    """Admin-only read path (api/routers/admin.py)."""
    db = SessionLocal()
    try:
        query = db.query(AuditLog)
        if user_id is not None:
            query = query.filter(AuditLog.user_id == user_id)
        if action is not None:
            query = query.filter(AuditLog.action == action)
        rows = query.order_by(AuditLog.created_at.desc()).limit(limit).all()
        return [
            {
                "id": r.id,
                "user_id": r.user_id,
                "action": r.action,
                "resource_type": r.resource_type,
                "resource_id": r.resource_id,
                "ip_address": r.ip_address,
                "detail": r.detail,
                "created_at": str(r.created_at),
            }
            for r in rows
        ]
    finally:
        db.close()


def archive_document(user_id, filename, category, markdown, confidence, metadata={}):
    """Saves OCR/RAG results permanently to the Vault. Returns the new row id."""
    db = SessionLocal()
    try:
        doc = VaultDocument(
            user_id=user_id,
            filename=filename,
            doc_category=category,
            raw_markdown=markdown,
            confidence_score=confidence,
            json_metadata=metadata,
        )
        db.add(doc)
        db.commit()
        db.refresh(doc)
        return doc.id
    finally:
        db.close()


def get_document_full(doc_id, user_id):
    """Retrieves the full archived record (markdown + parsed metadata) for the API's job-result endpoints."""
    db = SessionLocal()
    try:
        doc = (
            db.query(VaultDocument)
            .filter(VaultDocument.id == doc_id, VaultDocument.user_id == user_id)
            .first()
        )
        if not doc:
            return None
        return {
            "filename": doc.filename,
            "doc_category": doc.doc_category,
            "markdown": doc.raw_markdown,
            "metadata": doc.json_metadata or {},
            "confidence_score": doc.confidence_score,
            "extraction_date": doc.extraction_date,
        }
    finally:
        db.close()


def get_user_vault(user_id):
    db = SessionLocal()
    try:
        rows = (
            db.query(VaultDocument)
            .filter(VaultDocument.user_id == user_id)
            .order_by(VaultDocument.extraction_date.desc())
            .all()
        )
        return [
            (r.id, r.filename, r.doc_category, r.confidence_score, r.extraction_date)
            for r in rows
        ]
    finally:
        db.close()


def get_document_markdown(doc_id, user_id):
    """Retrieves raw text for the Vault viewer."""
    db = SessionLocal()
    try:
        doc = (
            db.query(VaultDocument)
            .filter(VaultDocument.id == doc_id, VaultDocument.user_id == user_id)
            .first()
        )
        return doc.raw_markdown if doc else None
    finally:
        db.close()


def get_document_for_export(doc_id, user_id):
    """Retrieves markdown, client name, and filename for PDF/DOCX exporters."""
    db = SessionLocal()
    try:
        doc = (
            db.query(VaultDocument)
            .filter(VaultDocument.id == doc_id, VaultDocument.user_id == user_id)
            .first()
        )
        if doc:
            return {
                "markdown": doc.raw_markdown,
                "client": doc.doc_category or "Universal OCR (Any Text)",
                "filename": doc.filename
            }
        return None
    finally:
        db.close()


def save_chat_message(user_id, app_type, session_id, role, content):
    db = SessionLocal()
    try:
        db.add(ChatMessage(user_id=user_id, app_type=app_type, session_id=session_id, role=role, content=content))
        db.commit()
    finally:
        db.close()


def get_chat_history(user_id, app_type, session_id=None):
    db = SessionLocal()
    try:
        query = db.query(ChatMessage).filter(
            ChatMessage.user_id == user_id, ChatMessage.app_type == app_type
        )
        if session_id:
            query = query.filter(ChatMessage.session_id == session_id)
        rows = query.order_by(ChatMessage.timestamp.asc()).all()
        return [{"role": r.role, "content": r.content} for r in rows]
    finally:
        db.close()


def add_session_doc(user_id, session_id, doc_id, filename):
    """Records that doc_id is attached/scoped to this chat session — server
    side, so it survives a page reload even if client state doesn't."""
    db = SessionLocal()
    try:
        exists = db.query(ChatSessionDoc).filter(
            ChatSessionDoc.user_id == user_id, ChatSessionDoc.session_id == session_id,
            ChatSessionDoc.doc_id == doc_id,
        ).first()
        if not exists:
            db.add(ChatSessionDoc(user_id=user_id, session_id=session_id, doc_id=doc_id, filename=filename))
            db.commit()
    finally:
        db.close()


def get_session_docs(user_id, session_id):
    db = SessionLocal()
    try:
        rows = db.query(ChatSessionDoc).filter(
            ChatSessionDoc.user_id == user_id, ChatSessionDoc.session_id == session_id,
        ).order_by(ChatSessionDoc.created_at.asc()).all()
        return [{"doc_id": r.doc_id, "filename": r.filename} for r in rows]
    finally:
        db.close()


def remove_session_doc(user_id, session_id, doc_id):
    db = SessionLocal()
    try:
        deleted = db.query(ChatSessionDoc).filter(
            ChatSessionDoc.user_id == user_id, ChatSessionDoc.session_id == session_id,
            ChatSessionDoc.doc_id == doc_id,
        ).delete(synchronize_session=False)
        db.commit()
        return deleted
    finally:
        db.close()
