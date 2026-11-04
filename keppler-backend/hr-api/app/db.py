"""Engine, sessions and the per-transaction tenant context RLS reads.

Every tenant-owned table has a policy comparing `tenant_id` against
`current_setting('app.tenant_id')`. `tenant_session()` sets that with
SET LOCAL at the start of each transaction, so a query that forgot its
WHERE clause still cannot read another hospital's rows."""

import uuid
from contextlib import contextmanager
from typing import Iterator

from sqlalchemy import create_engine, event, text
from sqlalchemy.orm import Session, sessionmaker

from app.config import settings

engine = create_engine(
    settings.database_url or "postgresql+psycopg://invalid/invalid",
    pool_pre_ping=True,
    pool_size=10,
    max_overflow=20,
    future=True,
)
SessionLocal = sessionmaker(bind=engine, expire_on_commit=False, future=True)


@event.listens_for(Session, "after_begin")
def _apply_tenant(session: Session, transaction, connection) -> None:
    tenant_id = session.info.get("tenant_id")
    if tenant_id is not None:
        # set_config(..., true) is SET LOCAL: it dies with the transaction, so
        # a pooled connection never carries one hospital's id into the next.
        connection.execute(
            text("SELECT set_config('app.tenant_id', :t, true)"), {"t": str(tenant_id)}
        )


@contextmanager
def tenant_session(tenant_id: uuid.UUID) -> Iterator[Session]:
    session = SessionLocal()
    session.info["tenant_id"] = tenant_id
    try:
        yield session
        session.commit()
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()


@contextmanager
def system_session() -> Iterator[Session]:
    """No tenant context: only tables without RLS (tenants) are visible."""
    session = SessionLocal()
    try:
        yield session
        session.commit()
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()
