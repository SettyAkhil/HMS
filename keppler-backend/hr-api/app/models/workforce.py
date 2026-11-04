"""Phase 2: approval workflows, shifts & rosters, calculated attendance, leave,
staffing. Calculated attendance is derived from raw_punch_logs and rebuilt on
demand; it never writes back into the raw ledger. A correction adds a manual
punch (source='manual') instead of editing a device punch."""

import uuid
from datetime import date, datetime, time
from decimal import Decimal

from sqlalchemy import (
    Boolean, Date, DateTime, ForeignKey, Index, Integer, Numeric, String, Text, Time, UniqueConstraint, text,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, SoftDelete, TenantMixin


def _fk(table: str, nullable: bool = True, ondelete: str | None = None):
    return mapped_column(UUID(as_uuid=True), ForeignKey(f"{table}.id", ondelete=ondelete), nullable=nullable)


# ── approval workflow engine ───────────────────────────────────────────────


class ApprovalWorkflow(Base, TenantMixin):
    __tablename__ = "approval_workflows"
    __table_args__ = (UniqueConstraint("tenant_id", "code"),)
    code: Mapped[str] = mapped_column(String(40), nullable=False)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    # Requesters may never approve their own request unless this is set.
    allow_self_approval: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)


class ApprovalStep(Base, TenantMixin):
    __tablename__ = "approval_steps"
    __table_args__ = (UniqueConstraint("workflow_id", "sequence"),)
    workflow_id: Mapped[uuid.UUID] = _fk("approval_workflows", False, "CASCADE")
    sequence: Mapped[int] = mapped_column(Integer, nullable=False)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    # reporting_manager | department_head | permission
    approver_type: Mapped[str] = mapped_column(String(30), nullable=False)
    permission: Mapped[str | None] = mapped_column(String(60))
    # e.g. {"field": "days", "op": "gte", "value": 3} -- step applies only when true.
    condition: Mapped[dict | None] = mapped_column(JSONB)
    escalate_after_hours: Mapped[int | None] = mapped_column(Integer)


class ApprovalInstance(Base, TenantMixin):
    __tablename__ = "approval_instances"
    __table_args__ = (Index("ix_approval_instances_open", "tenant_id", "status", "workflow_code"),
                      Index("ix_approval_instances_entity", "entity_type", "entity_id"))
    workflow_code: Mapped[str] = mapped_column(String(40), nullable=False)
    entity_type: Mapped[str] = mapped_column(String(40), nullable=False)
    entity_id: Mapped[str] = mapped_column(String(64), nullable=False)
    title: Mapped[str] = mapped_column(String(300), nullable=False)
    requester_employee_id: Mapped[uuid.UUID | None] = _fk("employees")
    requester_username: Mapped[str] = mapped_column(String(120), nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="pending")
    # Snapshot of the steps that applied when the request was raised.
    steps: Mapped[list] = mapped_column(JSONB, nullable=False, server_default="[]")
    current_index: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    current_since: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    delegated_to: Mapped[str | None] = mapped_column(String(120))
    escalated: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    context: Mapped[dict] = mapped_column(JSONB, nullable=False, server_default="{}")
    decided_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class ApprovalAction(Base, TenantMixin):
    __tablename__ = "approval_actions"
    instance_id: Mapped[uuid.UUID] = _fk("approval_instances", False, "CASCADE")
    step_index: Mapped[int] = mapped_column(Integer, nullable=False)
    actor: Mapped[str] = mapped_column(String(120), nullable=False)
    action: Mapped[str] = mapped_column(String(20), nullable=False)
    comment: Mapped[str | None] = mapped_column(Text)
    delegated_to: Mapped[str | None] = mapped_column(String(120))


# ── shifts & rosters ────────────────────────────────────────────────────────


class ShiftTemplate(Base, TenantMixin, SoftDelete):
    __tablename__ = "shift_templates"
    __table_args__ = (Index("uq_shift_templates_code", "tenant_id", "code", unique=True,
                            postgresql_where=text("deleted_at IS NULL")),)
    code: Mapped[str] = mapped_column(String(20), nullable=False)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    kind: Mapped[str] = mapped_column(String(20), nullable=False, default="general")  # general|morning|evening|night|rotational
    start_time: Mapped[time] = mapped_column(Time, nullable=False)
    end_time: Mapped[time] = mapped_column(Time, nullable=False)
    break_minutes: Mapped[int] = mapped_column(Integer, nullable=False, default=30)
    grace_in_minutes: Mapped[int] = mapped_column(Integer, nullable=False, default=10)
    grace_out_minutes: Mapped[int] = mapped_column(Integer, nullable=False, default=10)
    full_day_minutes: Mapped[int] = mapped_column(Integer, nullable=False, default=420)
    half_day_minutes: Mapped[int] = mapped_column(Integer, nullable=False, default=240)
    overtime_after_minutes: Mapped[int] = mapped_column(Integer, nullable=False, default=30)
    min_rest_minutes: Mapped[int] = mapped_column(Integer, nullable=False, default=480)
    is_night: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    department_id: Mapped[uuid.UUID | None] = _fk("departments")
    color: Mapped[str | None] = mapped_column(String(9))


class Holiday(Base, TenantMixin):
    __tablename__ = "holidays"
    __table_args__ = (UniqueConstraint("tenant_id", "holiday_date", "branch_id"),)
    holiday_date: Mapped[date] = mapped_column(Date, nullable=False)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    branch_id: Mapped[uuid.UUID | None] = _fk("branches")
    optional: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)


class DutyRoster(Base, TenantMixin):
    __tablename__ = "duty_rosters"
    department_id: Mapped[uuid.UUID] = _fk("departments", False)
    period_start: Mapped[date] = mapped_column(Date, nullable=False)
    period_end: Mapped[date] = mapped_column(Date, nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="draft")  # draft|published
    published_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    published_by: Mapped[str | None] = mapped_column(String(120))
    notes: Mapped[str | None] = mapped_column(Text)


class ShiftAssignment(Base, TenantMixin):
    """One row per employee per date: a shift, or a weekly off."""

    __tablename__ = "shift_assignments"
    __table_args__ = (UniqueConstraint("tenant_id", "employee_id", "work_date"),
                      Index("ix_shift_assignments_dept_date", "tenant_id", "department_id", "work_date"))
    employee_id: Mapped[uuid.UUID] = _fk("employees", False)
    work_date: Mapped[date] = mapped_column(Date, nullable=False)
    shift_template_id: Mapped[uuid.UUID | None] = _fk("shift_templates")
    is_weekly_off: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    department_id: Mapped[uuid.UUID | None] = _fk("departments")
    unit_id: Mapped[uuid.UUID | None] = _fk("organization_units")
    roster_id: Mapped[uuid.UUID | None] = _fk("duty_rosters", ondelete="SET NULL")
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="draft")  # draft|published
    notes: Mapped[str | None] = mapped_column(Text)


class ShiftSwapRequest(Base, TenantMixin):
    __tablename__ = "shift_swap_requests"
    kind: Mapped[str] = mapped_column(String(20), nullable=False)  # swap|replacement
    requester_employee_id: Mapped[uuid.UUID] = _fk("employees", False)
    requester_assignment_id: Mapped[uuid.UUID] = _fk("shift_assignments", False)
    counterpart_employee_id: Mapped[uuid.UUID] = _fk("employees", False)
    counterpart_assignment_id: Mapped[uuid.UUID | None] = _fk("shift_assignments")
    reason: Mapped[str] = mapped_column(Text, nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="pending")
    approval_instance_id: Mapped[uuid.UUID | None] = _fk("approval_instances")


class ShiftHandover(Base, TenantMixin):
    __tablename__ = "shift_handovers"
    department_id: Mapped[uuid.UUID] = _fk("departments", False)
    work_date: Mapped[date] = mapped_column(Date, nullable=False)
    shift_template_id: Mapped[uuid.UUID | None] = _fk("shift_templates")
    from_employee_id: Mapped[uuid.UUID] = _fk("employees", False)
    to_employee_id: Mapped[uuid.UUID | None] = _fk("employees")
    notes: Mapped[str] = mapped_column(Text, nullable=False)
    acknowledged_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


# ── calculated attendance ───────────────────────────────────────────────────


class AttendanceRecord(Base, TenantMixin):
    __tablename__ = "attendance_records"
    __table_args__ = (UniqueConstraint("tenant_id", "employee_id", "work_date"),
                      Index("ix_attendance_records_date", "tenant_id", "work_date", "status"))
    employee_id: Mapped[uuid.UUID] = _fk("employees", False)
    work_date: Mapped[date] = mapped_column(Date, nullable=False)
    shift_template_id: Mapped[uuid.UUID | None] = _fk("shift_templates")
    scheduled_start: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    scheduled_end: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    # present|half_day|absent|on_leave|half_day_leave|holiday|weekly_off|missing_punch|in_progress|not_scheduled
    status: Mapped[str] = mapped_column(String(20), nullable=False)
    first_in: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    last_out: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    worked_minutes: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    break_deducted_minutes: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    late_minutes: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    early_minutes: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    overtime_minutes: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    punch_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    leave_request_id: Mapped[uuid.UUID | None] = _fk("leave_requests", ondelete="SET NULL")
    is_night: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    # Set when a finalized payroll consumed this day; the engine leaves it alone.
    locked: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    calculated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=text("now()"))


class AttendanceSession(Base, TenantMixin):
    __tablename__ = "attendance_sessions"
    record_id: Mapped[uuid.UUID] = _fk("attendance_records", False, "CASCADE")
    check_in: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    check_out: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    minutes: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    in_punch_id: Mapped[uuid.UUID | None] = _fk("raw_punch_logs")
    out_punch_id: Mapped[uuid.UUID | None] = _fk("raw_punch_logs")


class AttendanceException(Base, TenantMixin):
    __tablename__ = "attendance_exceptions"
    __table_args__ = (Index("ix_attendance_exceptions_open", "tenant_id", "status", "work_date"),)
    record_id: Mapped[uuid.UUID] = _fk("attendance_records", False, "CASCADE")
    employee_id: Mapped[uuid.UUID] = _fk("employees", False)
    work_date: Mapped[date] = mapped_column(Date, nullable=False)
    # missing_out|missing_in|late|early|absent|unscheduled_work|insufficient_rest
    kind: Mapped[str] = mapped_column(String(30), nullable=False)
    detail: Mapped[str | None] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="open")


class AttendanceCorrection(Base, TenantMixin):
    __tablename__ = "attendance_corrections"
    employee_id: Mapped[uuid.UUID] = _fk("employees", False)
    work_date: Mapped[date] = mapped_column(Date, nullable=False)
    punch_times: Mapped[list] = mapped_column(JSONB, nullable=False)  # ISO datetimes to add
    reason: Mapped[str] = mapped_column(Text, nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="pending")
    approval_instance_id: Mapped[uuid.UUID | None] = _fk("approval_instances")
    applied_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class OvertimeRecord(Base, TenantMixin):
    __tablename__ = "overtime_records"
    __table_args__ = (UniqueConstraint("tenant_id", "employee_id", "work_date"),)
    employee_id: Mapped[uuid.UUID] = _fk("employees", False)
    work_date: Mapped[date] = mapped_column(Date, nullable=False)
    minutes: Mapped[int] = mapped_column(Integer, nullable=False)
    approved_minutes: Mapped[int | None] = mapped_column(Integer)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="pending")
    approval_instance_id: Mapped[uuid.UUID | None] = _fk("approval_instances")


# ── staffing ────────────────────────────────────────────────────────────────


class StaffingRequirement(Base, TenantMixin):
    __tablename__ = "staffing_requirements"
    department_id: Mapped[uuid.UUID] = _fk("departments", False)
    unit_id: Mapped[uuid.UUID | None] = _fk("organization_units")
    shift_template_id: Mapped[uuid.UUID | None] = _fk("shift_templates")
    employee_category: Mapped[str] = mapped_column(String(40), nullable=False)
    min_count: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    # Patients per staff member; when census is known, need = ceil(patients / ratio).
    patients_per_staff: Mapped[Decimal | None] = mapped_column(Numeric(6, 2))
    required_competency: Mapped[str | None] = mapped_column(String(120))
    effective_from: Mapped[date] = mapped_column(Date, nullable=False)
    effective_to: Mapped[date | None] = mapped_column(Date)


class StaffAllocation(Base, TenantMixin):
    """Temporary or replacement deployment of an employee to another
    department for a date/shift, on top of their roster."""

    __tablename__ = "staff_allocations"
    __table_args__ = (Index("ix_staff_allocations_dept_date", "tenant_id", "department_id", "work_date"),)
    employee_id: Mapped[uuid.UUID] = _fk("employees", False)
    department_id: Mapped[uuid.UUID] = _fk("departments", False)
    unit_id: Mapped[uuid.UUID | None] = _fk("organization_units")
    work_date: Mapped[date] = mapped_column(Date, nullable=False)
    shift_template_id: Mapped[uuid.UUID | None] = _fk("shift_templates")
    allocation_type: Mapped[str] = mapped_column(String(20), nullable=False, default="temporary")  # temporary|replacement
    replaces_employee_id: Mapped[uuid.UUID | None] = _fk("employees")
    reason: Mapped[str | None] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="active")


# ── leave ───────────────────────────────────────────────────────────────────


class LeaveType(Base, TenantMixin, SoftDelete):
    __tablename__ = "leave_types"
    __table_args__ = (Index("uq_leave_types_code", "tenant_id", "code", unique=True,
                            postgresql_where=text("deleted_at IS NULL")),)
    code: Mapped[str] = mapped_column(String(20), nullable=False)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    paid: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    allow_half_day: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    max_consecutive_days: Mapped[int | None] = mapped_column(Integer)
    document_required_after_days: Mapped[int | None] = mapped_column(Integer)
    is_emergency: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    allow_negative_balance: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    gender: Mapped[str | None] = mapped_column(String(20))
    color: Mapped[str | None] = mapped_column(String(9))


class LeavePolicy(Base, TenantMixin):
    __tablename__ = "leave_policies"
    leave_type_id: Mapped[uuid.UUID] = _fk("leave_types", False)
    employee_category: Mapped[str | None] = mapped_column(String(40))  # None = everyone
    annual_allocation: Mapped[Decimal] = mapped_column(Numeric(6, 2), nullable=False, default=0)
    accrual: Mapped[str] = mapped_column(String(10), nullable=False, default="annual")  # annual|monthly
    carry_forward_max: Mapped[Decimal] = mapped_column(Numeric(6, 2), nullable=False, default=0)
    min_service_days: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    effective_from: Mapped[date] = mapped_column(Date, nullable=False)


class LeaveBalance(Base, TenantMixin):
    __tablename__ = "leave_balances"
    __table_args__ = (UniqueConstraint("tenant_id", "employee_id", "leave_type_id", "year"),)
    employee_id: Mapped[uuid.UUID] = _fk("employees", False)
    leave_type_id: Mapped[uuid.UUID] = _fk("leave_types", False)
    year: Mapped[int] = mapped_column(Integer, nullable=False)
    allocated: Mapped[Decimal] = mapped_column(Numeric(6, 2), nullable=False, default=0)
    accrued: Mapped[Decimal] = mapped_column(Numeric(6, 2), nullable=False, default=0)
    accrued_through_month: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    carried_forward: Mapped[Decimal] = mapped_column(Numeric(6, 2), nullable=False, default=0)
    adjusted: Mapped[Decimal] = mapped_column(Numeric(6, 2), nullable=False, default=0)
    used: Mapped[Decimal] = mapped_column(Numeric(6, 2), nullable=False, default=0)
    pending: Mapped[Decimal] = mapped_column(Numeric(6, 2), nullable=False, default=0)


class LeaveRequest(Base, TenantMixin):
    __tablename__ = "leave_requests"
    __table_args__ = (Index("ix_leave_requests_emp_dates", "tenant_id", "employee_id", "start_date", "end_date"),)
    employee_id: Mapped[uuid.UUID] = _fk("employees", False)
    leave_type_id: Mapped[uuid.UUID] = _fk("leave_types", False)
    start_date: Mapped[date] = mapped_column(Date, nullable=False)
    end_date: Mapped[date] = mapped_column(Date, nullable=False)
    half_day: Mapped[str | None] = mapped_column(String(10))  # first|second (single-day only)
    days: Mapped[Decimal] = mapped_column(Numeric(6, 2), nullable=False)
    reason: Mapped[str] = mapped_column(Text, nullable=False)
    emergency: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    document_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True))
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="pending")
    approval_instance_id: Mapped[uuid.UUID | None] = _fk("approval_instances")
    decided_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
