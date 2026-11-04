"""Cross-cutting helpers every domain service uses: audit, outbox, codes,
pagination and post-commit live notifications."""

import contextvars
import json
import logging
import uuid
from datetime import date, datetime, time
from decimal import Decimal
from typing import Any, Generic, TypeVar

from pydantic import BaseModel
from sqlalchemy import event, func, select, text
from sqlalchemy.orm import Session

from app.models import AuditLog, OutboxEvent

log = logging.getLogger("hr.common")
correlation_id: contextvars.ContextVar[str | None] = contextvars.ContextVar("correlation_id", default=None)


def _jsonable(value: Any) -> Any:
    if isinstance(value, (uuid.UUID, Decimal)):
        return str(value)
    if isinstance(value, (date, datetime, time)):
        return value.isoformat()
    if isinstance(value, dict):
        return {k: _jsonable(v) for k, v in value.items()}
    if isinstance(value, (list, tuple, set)):
        return [_jsonable(v) for v in value]
    return value


def tenant_of(db: Session) -> uuid.UUID:
    return db.info["tenant_id"]


def actor_of(db: Session) -> str:
    return db.info.get("actor") or "system"


def audit(db: Session, entity_type: str, entity_id, action: str, changes: dict | None = None) -> None:
    db.add(AuditLog(
        tenant_id=tenant_of(db), actor=actor_of(db), action=action, entity_type=entity_type,
        entity_id=str(entity_id), changes=_jsonable(changes) if changes else None,
        correlation_id=correlation_id.get(), created_by=actor_of(db),
    ))


def emit(db: Session, event_type: str, aggregate_id, payload: dict) -> None:
    """Queue a domain event in the caller's transaction (transactional outbox)."""
    db.add(OutboxEvent(
        tenant_id=tenant_of(db), event_type=event_type, aggregate_id=str(aggregate_id),
        payload=_jsonable(payload), correlation_id=correlation_id.get(), created_by=actor_of(db),
    ))


def diff(obj, updates: dict) -> dict:
    """Apply `updates` to `obj` and return {field: [old, new]} for what changed."""
    changed = {}
    for key, new in updates.items():
        old = getattr(obj, key)
        if old != new:
            changed[key] = [old, new]
            setattr(obj, key, new)
    return changed


def next_code(db: Session, name: str, prefix: str, width: int = 6) -> str:
    # Single atomic upsert: two concurrent hires can never draw the same number.
    value = db.execute(
        text(
            "INSERT INTO code_sequences (id, tenant_id, name, value) "
            "VALUES (gen_random_uuid(), :t, :n, 1) "
            "ON CONFLICT (tenant_id, name) DO UPDATE SET value = code_sequences.value + 1 "
            "RETURNING value"
        ),
        {"t": tenant_of(db), "n": name},
    ).scalar_one()
    return f"{prefix}{value:0{width}d}"


T = TypeVar("T")


class Page(BaseModel, Generic[T]):
    items: list[T]
    total: int
    page: int
    page_size: int


def paginate(db: Session, stmt, page: int, page_size: int, mapper):
    page = max(page, 1)
    page_size = min(max(page_size, 1), 200)
    total = db.scalar(select(func.count()).select_from(stmt.order_by(None).subquery())) or 0
    rows = db.execute(stmt.limit(page_size).offset((page - 1) * page_size)).all()
    return {"items": [mapper(r) for r in rows], "total": total, "page": page, "page_size": page_size}


# --- live notifications ------------------------------------------------------
# Queued on the session and published only after a successful commit, so the
# live board never shows a punch that was rolled back.


def notify_live(db: Session, kind: str, payload: dict) -> None:
    db.info.setdefault("live", []).append({"kind": kind, **_jsonable(payload)})


@event.listens_for(Session, "after_commit")
def _publish_live(session: Session) -> None:
    messages = session.info.pop("live", None)
    tenant_id = session.info.get("tenant_id")
    if not messages or not tenant_id:
        return
    from app.live import publish  # local import: live.py imports redis lazily

    for message in messages:
        try:
            publish(tenant_id, message)
        except Exception:  # live view is best-effort; the record is already safe
            log.warning("live publish failed", exc_info=True)


@event.listens_for(Session, "after_rollback")
def _drop_live(session: Session) -> None:
    session.info.pop("live", None)


def dumps(value: Any) -> str:
    return json.dumps(_jsonable(value))
