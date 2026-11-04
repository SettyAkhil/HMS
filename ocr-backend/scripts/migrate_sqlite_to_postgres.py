"""
One-off migration: copies data from the legacy split SQLite databases
(database/ai_portal.db: users/chat_history/universal_docs, and the repo-root
keppler_platform.db: documents/extraction_jobs) into the unified Postgres
schema in database/models.py.

Run once, after `alembic upgrade head` has created the Postgres schema and
before the app/workers start writing to Postgres:

    python scripts/migrate_sqlite_to_postgres.py

Safe to re-run: skips rows whose primary key already exists in Postgres.
Primary keys are preserved as-is (not renumbered) so extraction_jobs.result_doc_id
and chat_history/vault_documents.user_id foreign keys stay valid; Postgres
sequences are reset to MAX(id)+1 afterward so new rows don't collide.
"""
import json
import os
import sqlite3
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import text

from database.models import ChatMessage, Document, ExtractionJob, SessionLocal, User, VaultDocument

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
AI_PORTAL_DB = os.path.join(BASE_DIR, "database", "ai_portal.db")
JOB_TRACKING_DB = os.path.join(BASE_DIR, "keppler_platform.db")


def _int_or_none(value):
    """Some legacy rows have garbage (e.g. user_id='abc') from ad-hoc test data."""
    try:
        return int(value) if value is not None else None
    except (TypeError, ValueError):
        return None


def _rows(db_path: str, query: str):
    if not os.path.exists(db_path):
        print(f"  (skip — {db_path} not found)")
        return []
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    rows = conn.execute(query).fetchall()
    conn.close()
    return rows


def migrate_users(session):
    rows = _rows(AI_PORTAL_DB, "SELECT id, username, password_hash, created_at FROM users")
    existing = {u.id for u in session.query(User.id).all()}
    added = 0
    for r in rows:
        if r["id"] in existing:
            continue
        session.add(User(id=r["id"], username=r["username"], password_hash=r["password_hash"],
                          created_at=r["created_at"]))
        added += 1
    session.commit()
    print(f"users: {added} migrated ({len(rows)} found)")


def migrate_documents(session):
    rows = _rows(JOB_TRACKING_DB, "SELECT id, filename, upload_path, uploaded_at FROM documents")
    existing = {d.id for d in session.query(Document.id).all()}
    added = 0
    for r in rows:
        if r["id"] in existing:
            continue
        session.add(Document(id=r["id"], filename=r["filename"], upload_path=r["upload_path"],
                              uploaded_at=r["uploaded_at"]))
        added += 1
    session.commit()
    print(f"documents: {added} migrated ({len(rows)} found)")


def migrate_vault_documents(session):
    rows = _rows(
        AI_PORTAL_DB,
        "SELECT id, user_id, filename, doc_category, raw_markdown, json_metadata, "
        "confidence_score, extraction_date FROM universal_docs",
    )
    existing = {v.id for v in session.query(VaultDocument.id).all()}
    added = 0
    for r in rows:
        if r["id"] in existing:
            continue
        try:
            metadata = json.loads(r["json_metadata"]) if r["json_metadata"] else {}
        except (TypeError, ValueError):
            metadata = {}
        session.add(VaultDocument(
            id=r["id"], user_id=_int_or_none(r["user_id"]), filename=r["filename"],
            doc_category=r["doc_category"], raw_markdown=r["raw_markdown"],
            json_metadata=metadata, confidence_score=r["confidence_score"],
            extraction_date=r["extraction_date"],
        ))
        added += 1
    session.commit()
    print(f"vault_documents: {added} migrated ({len(rows)} found)")


def migrate_extraction_jobs(session):
    rows = _rows(
        JOB_TRACKING_DB,
        "SELECT job_id, document_id, user_id, job_type, status, progress, error_message, "
        "result_doc_id, created_at, completed_at FROM extraction_jobs",
    )
    existing = {j.job_id for j in session.query(ExtractionJob.job_id).all()}
    added = 0
    for r in rows:
        if r["job_id"] in existing:
            continue
        session.add(ExtractionJob(
            job_id=r["job_id"], document_id=r["document_id"], user_id=_int_or_none(r["user_id"]),
            job_type=r["job_type"], status=r["status"], progress=r["progress"],
            error_message=r["error_message"], result_doc_id=r["result_doc_id"],
            created_at=r["created_at"], completed_at=r["completed_at"],
        ))
        added += 1
    session.commit()
    print(f"extraction_jobs: {added} migrated ({len(rows)} found)")


def migrate_chat_history(session):
    rows = _rows(
        AI_PORTAL_DB,
        "SELECT id, user_id, app_type, session_id, role, content, timestamp FROM chat_history",
    )
    existing = {c.id for c in session.query(ChatMessage.id).all()}
    added = 0
    for r in rows:
        if r["id"] in existing:
            continue
        session.add(ChatMessage(
            id=r["id"], user_id=_int_or_none(r["user_id"]), app_type=r["app_type"],
            session_id=r["session_id"], role=r["role"], content=r["content"],
            timestamp=r["timestamp"],
        ))
        added += 1
    session.commit()
    print(f"chat_history: {added} migrated ({len(rows)} found)")


def reset_sequences(session):
    """Postgres autoincrement sequences don't know about explicitly-inserted IDs."""
    for table, id_col in [("users", "id"), ("vault_documents", "id"), ("chat_history", "id")]:
        session.execute(text(
            f"SELECT setval(pg_get_serial_sequence('{table}', '{id_col}'), "
            f"COALESCE((SELECT MAX({id_col}) FROM {table}), 1))"
        ))
    session.commit()
    print("sequences reset to MAX(id)")


if __name__ == "__main__":
    session = SessionLocal()
    try:
        # FK-respecting order: users -> documents -> vault_documents -> extraction_jobs -> chat_history
        migrate_users(session)
        migrate_documents(session)
        migrate_vault_documents(session)
        migrate_extraction_jobs(session)
        migrate_chat_history(session)
        reset_sequences(session)
    finally:
        session.close()
    print("Done.")
