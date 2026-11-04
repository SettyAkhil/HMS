"""Tenants, audit trail, transactional outbox and per-tenant code counters."""

from datetime import datetime

from sqlalchemy import BigInteger, DateTime, Integer, String, Text, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TenantMixin, UUIDPk


class Tenant(Base, UUIDPk):
    """One row per hospital tenant, keyed by the auth-service `hospital_code`.

    Provisioned on the first authenticated request from that hospital, so no
    tenant id is ever hardcoded. Not under RLS: it is how the tenant is found."""

    __tablename__ = "tenants"
    code: Mapped[str] = mapped_column(String(80), unique=True, nullable=False)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="active")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class AuditLog(Base, TenantMixin):
    __tablename__ = "audit_logs"
    actor: Mapped[str] = mapped_column(String(120), nullable=False)
    action: Mapped[str] = mapped_column(String(80), nullable=False)
    entity_type: Mapped[str] = mapped_column(String(60), nullable=False)
    entity_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    changes: Mapped[dict | None] = mapped_column(JSONB)
    correlation_id: Mapped[str | None] = mapped_column(String(64))


class OutboxEvent(Base, TenantMixin):
    """Written in the same transaction as the change it announces; the worker
    publishes it afterwards, so an event is never sent for a rolled-back change
    and never lost for a committed one."""

    __tablename__ = "outbox_events"
    event_type: Mapped[str] = mapped_column(String(80), nullable=False, index=True)
    aggregate_id: Mapped[str] = mapped_column(String(64), nullable=False)
    payload: Mapped[dict] = mapped_column(JSONB, nullable=False)
    correlation_id: Mapped[str | None] = mapped_column(String(64))
    published_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), index=True)
    attempts: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    last_error: Mapped[str | None] = mapped_column(Text)


class CodeSequence(Base, TenantMixin):
    """Per-tenant counters for human-facing codes (EMP-000123)."""

    __tablename__ = "code_sequences"
    __table_args__ = (UniqueConstraint("tenant_id", "name"),)
    name: Mapped[str] = mapped_column(String(40), nullable=False)
    value: Mapped[int] = mapped_column(BigInteger, nullable=False, default=0)
