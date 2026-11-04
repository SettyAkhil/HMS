from sqlalchemy import (
    JSON,
    Column,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
    create_engine,
)
from sqlalchemy.orm import declarative_base, relationship, sessionmaker
from core.config import settings
from datetime import datetime

Base = declarative_base()


class Document(Base):
    """Stores unique document metadata and physical storage locations."""
    __tablename__ = "documents"

    # We use the document's MD5 hash as the primary key to enable instant deduplication
    id = Column(String, primary_key=True, index=True)
    filename = Column(String, index=True)
    upload_path = Column(String)
    uploaded_at = Column(DateTime, default=datetime.utcnow)

    jobs = relationship("ExtractionJob", back_populates="document")


class ExtractionJob(Base):
    """Tracks asynchronous Celery extraction jobs."""
    __tablename__ = "extraction_jobs"

    job_id = Column(String, primary_key=True, index=True)  # our UUID, also the Celery chord id
    document_id = Column(String, ForeignKey("documents.id"))
    user_id = Column(Integer, ForeignKey("users.id"), index=True, nullable=True)

    # Which pipeline this job runs: "ocr" or "summarizer"
    job_type = Column(String, default="ocr")

    # Status can be PENDING, PROCESSING, COMPLETED, FAILED
    status = Column(String, default="PENDING")
    progress = Column(Float, default=0.0)
    error_message = Column(String, nullable=True)

    # Per-unit-of-work checkpoint (e.g. {"0": {...page 0 result...}, "3": {...}}).
    # Written atomically per key by ocr_page_task so a killed/retried worker can
    # resume from here instead of reprocessing already-completed pages.
    progress_checkpoint = Column(JSON, nullable=True)

    # client_blueprint (OCR jobs only) — needed to resume a chord after a crash
    # without the router re-supplying it.
    blueprint = Column(String, nullable=True)
    total_units = Column(Integer, nullable=True)

    # Links to the vault_documents row holding the actual markdown/entities once
    # archive_document() runs on completion.
    result_doc_id = Column(Integer, ForeignKey("vault_documents.id"), nullable=True)

    created_at = Column(DateTime, default=datetime.utcnow)
    completed_at = Column(DateTime, nullable=True)

    document = relationship("Document", back_populates="jobs")


class User(Base):
    """Registered platform users (moved here from the old standalone ai_portal.db)."""
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, autoincrement=True)
    username = Column(String, unique=True, nullable=False, index=True)
    password_hash = Column(String, nullable=False)
    role = Column(String, nullable=False, default="user")  # "user" | "admin" — see core/security.py
    created_at = Column(DateTime, default=datetime.utcnow)


class VaultDocument(Base):
    """Archived OCR/summarizer results a user has extracted (the 'Document Vault')."""
    __tablename__ = "vault_documents"

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey("users.id"), index=True)
    filename = Column(String)
    doc_category = Column(String)
    raw_markdown = Column(Text)
    json_metadata = Column(JSON)
    confidence_score = Column(Float)
    extraction_date = Column(DateTime, default=datetime.utcnow)


class ChatMessage(Base):
    """AI Assistant (RAG chat) message history."""
    __tablename__ = "chat_history"

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey("users.id"), index=True)
    app_type = Column(String)
    session_id = Column(String)
    role = Column(String)
    content = Column(Text)
    timestamp = Column(DateTime, default=datetime.utcnow)


class ChatSessionDoc(Base):
    """Which documents are attached/scoped to a given AI Assistant chat
    session (Phase 10 follow-up) — server-side source of truth, not just
    client-side React state, so a page reload or any client-side state loss
    can't silently drop a conversation's document scoping. /chat and
    /chat/stream fall back to this when the request doesn't explicitly pass
    doc_ids."""
    __tablename__ = "chat_session_docs"

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey("users.id"), index=True)
    session_id = Column(String, index=True)
    doc_id = Column(Integer)
    filename = Column(String)
    created_at = Column(DateTime, default=datetime.utcnow)


class AuditLog(Base):
    """Who did what, when — every extraction/export/chat/auth event (Phase 6).
    Append-only; read via the admin-only GET /api/v1/admin/audit-log endpoint."""
    __tablename__ = "audit_log"

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey("users.id"), index=True, nullable=True)
    action = Column(String, nullable=False, index=True)  # e.g. "ocr.upload", "auth.login", "assistant.chat"
    resource_type = Column(String, nullable=True)         # e.g. "document", "job", "vault_document"
    resource_id = Column(String, nullable=True)
    ip_address = Column(String, nullable=True)
    detail = Column(JSON, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, index=True)


# `check_same_thread` is a SQLite-only pymysql/sqlite3 connect() kwarg; passing it
# to psycopg (Postgres) raises TypeError, so only apply it for sqlite:// URLs.
_connect_args = {"check_same_thread": False} if settings.DATABASE_URL.startswith("sqlite") else {}
engine = create_engine(settings.DATABASE_URL, connect_args=_connect_args, pool_pre_ping=True)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# Schema is managed by Alembic (see alembic/) — run `alembic upgrade head` before
# starting the app/workers. No import-time create_all: mixing that with migrations
# leads to drift between environments.
