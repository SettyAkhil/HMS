"""Biometric integration and the raw punch ledger.

Raw punches are immutable: a database trigger (migration 0001) rejects any
UPDATE to their source columns, and DELETE outright. Only the derived
`employee_id` resolution may change, so a mapping added later can claim
punches that arrived unmapped. Calculated attendance (Phase 2) is built from
this ledger and never written back into it.

No fingerprint or face template is stored anywhere here, only the device's
user PIN and the event it reported."""

import uuid
from datetime import date, datetime

from sqlalchemy import Boolean, Date, DateTime, ForeignKey, Index, Integer, String, Text, text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, SoftDelete, TenantMixin

PROVIDERS = ("etimetracklite", "ebioserver", "simulator")


class AttendanceIntegration(Base, TenantMixin, SoftDelete):
    __tablename__ = "attendance_integrations"
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    provider: Mapped[str] = mapped_column(String(30), nullable=False)
    base_url: Mapped[str] = mapped_column(String(300), nullable=False)
    username: Mapped[str | None] = mapped_column(String(120))
    # Fernet ciphertext; the API only ever reports whether one is set.
    password_encrypted: Mapped[str | None] = mapped_column(Text)
    branch_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("branches.id"))
    enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    poll_interval_seconds: Mapped[int] = mapped_column(Integer, nullable=False, default=300)
    # Device clocks report local wall time with no offset.
    device_timezone: Mapped[str] = mapped_column(String(60), nullable=False, default="Asia/Kolkata")
    # Operations the server's WSDL actually declares, from the last connection test.
    capabilities: Mapped[dict] = mapped_column(JSONB, nullable=False, server_default="{}")
    # Incremental-sync watermark: every punch up to here has been fetched.
    synced_until: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    last_success_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    last_attempt_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    last_error: Mapped[str | None] = mapped_column(Text)
    consecutive_failures: Mapped[int] = mapped_column(Integer, nullable=False, default=0)


class BiometricDevice(Base, TenantMixin, SoftDelete):
    __tablename__ = "biometric_devices"
    __table_args__ = (
        Index("uq_biometric_devices_serial", "tenant_id", "serial_number", unique=True,
              postgresql_where=text("deleted_at IS NULL")),
    )
    integration_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("attendance_integrations.id"), nullable=False, index=True
    )
    serial_number: Mapped[str] = mapped_column(String(80), nullable=False)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    location: Mapped[str | None] = mapped_column(String(200))
    branch_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("branches.id"))
    department_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("departments.id"))
    direction_mode: Mapped[str] = mapped_column(String(10), nullable=False, default="auto")  # auto|in|out
    enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="unknown")  # online|offline|unknown
    last_seen_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    last_punch_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class BiometricMapping(Base, TenantMixin):
    """Device user PIN -> employee, effective-dated so a PIN reissued to a new
    joiner never re-attributes the previous holder's old punches."""

    __tablename__ = "biometric_mappings"
    __table_args__ = (
        Index("uq_biometric_mapping_pin", "tenant_id", "integration_id", "device_user_id", unique=True,
              postgresql_where=text("effective_to IS NULL")),
        Index("uq_biometric_mapping_employee", "tenant_id", "integration_id", "employee_id", unique=True,
              postgresql_where=text("effective_to IS NULL")),
    )
    integration_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("attendance_integrations.id"), nullable=False
    )
    employee_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("employees.id"), nullable=False, index=True
    )
    device_user_id: Mapped[str] = mapped_column(String(40), nullable=False)
    effective_from: Mapped[date] = mapped_column(Date, nullable=False)
    effective_to: Mapped[date | None] = mapped_column(Date)
    # pending -> provisioned on the device, when the provider supports AddEmployee.
    provisioning_status: Mapped[str] = mapped_column(String(20), nullable=False, default="manual")


class AttendanceSyncLog(Base, TenantMixin):
    __tablename__ = "attendance_sync_logs"
    __table_args__ = (Index("ix_sync_logs_integration", "integration_id", "started_at"),)
    integration_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("attendance_integrations.id"), nullable=False
    )
    trigger: Mapped[str] = mapped_column(String(20), nullable=False)  # poll|manual|retry
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="running")
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    window_from: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    window_to: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    fetched: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    inserted: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    duplicates: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    unmapped: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    rejected: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    error: Mapped[str | None] = mapped_column(Text)
    details: Mapped[dict | None] = mapped_column(JSONB)


class RawPunchLog(Base, TenantMixin):
    __tablename__ = "raw_punch_logs"
    __table_args__ = (
        Index("uq_raw_punch_dedupe", "tenant_id", "dedupe_key", unique=True),
        Index("ix_raw_punch_employee_time", "tenant_id", "employee_id", "punch_time"),
        Index("ix_raw_punch_unmapped", "tenant_id", "integration_id", "device_user_id",
              postgresql_where=text("employee_id IS NULL")),
    )
    integration_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("attendance_integrations.id"), nullable=False
    )
    device_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("biometric_devices.id"))
    device_serial: Mapped[str | None] = mapped_column(String(80))
    device_user_id: Mapped[str] = mapped_column(String(40), nullable=False)
    punch_time: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    direction: Mapped[str | None] = mapped_column(String(10))  # in|out|None (device did not say)
    verify_mode: Mapped[str | None] = mapped_column(String(30))
    source: Mapped[str] = mapped_column(String(20), nullable=False, default="device")  # device|manual
    raw_payload: Mapped[str] = mapped_column(Text, nullable=False)
    dedupe_key: Mapped[str] = mapped_column(String(64), nullable=False)
    sync_log_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("attendance_sync_logs.id"))
    received_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=text("now()"))
    # Derived; the only column allowed to change after insert.
    employee_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("employees.id"))
