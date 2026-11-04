"""Phase 5: announcements and scheduled reports."""

import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TenantMixin


class Announcement(Base, TenantMixin):
    __tablename__ = "hr_announcements"
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    body: Mapped[str] = mapped_column(Text, nullable=False)
    # {"all": true} | {"departments": [...], "categories": [...]}
    audience: Mapped[dict] = mapped_column(JSONB, nullable=False)
    priority: Mapped[str] = mapped_column(String(10), nullable=False, default="normal")  # normal|important
    published_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class ReportSchedule(Base, TenantMixin):
    __tablename__ = "report_schedules"
    report: Mapped[str] = mapped_column(String(40), nullable=False)
    filters: Mapped[dict] = mapped_column(JSONB, nullable=False, server_default="{}")
    frequency: Mapped[str] = mapped_column(String(10), nullable=False)  # daily|weekly|monthly
    recipients: Mapped[list] = mapped_column(JSONB, nullable=False)  # HMS usernames
    next_run_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    active: Mapped[bool] = mapped_column(nullable=False, default=True)


class ReportRun(Base, TenantMixin):
    __tablename__ = "report_runs"
    schedule_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("report_schedules.id",
                                                                                          ondelete="SET NULL"))
    report: Mapped[str] = mapped_column(String(40), nullable=False)
    filters: Mapped[dict] = mapped_column(JSONB, nullable=False, server_default="{}")
    recipients: Mapped[list] = mapped_column(JSONB, nullable=False, server_default="[]")
    rows: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    storage_key: Mapped[str | None] = mapped_column(String(200))
    status: Mapped[str] = mapped_column(String(10), nullable=False, default="ok")
    error: Mapped[str | None] = mapped_column(Text)
