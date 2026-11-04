import uuid
from datetime import date, datetime, time
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from app.models.employee import EMPLOYEE_CATEGORIES

Category = Literal[EMPLOYEE_CATEGORIES]  # type: ignore[valid-type]


class ORM(BaseModel):
    model_config = ConfigDict(from_attributes=True)


# ── approvals ──────────────────────────────────────────────────────────────


class ApprovalActionIn(BaseModel):
    action: Literal["approve", "reject", "delegate", "cancel"]
    comment: str | None = Field(None, max_length=2000)
    delegate_to: str | None = Field(None, max_length=120)


class StepIn(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    approver_type: Literal["reporting_manager", "department_head", "permission"]
    permission: str | None = Field(None, max_length=60)
    condition: dict | None = None
    escalate_after_hours: int | None = Field(None, ge=1, le=720)

    @model_validator(mode="after")
    def _perm(self):
        if self.approver_type == "permission" and not self.permission:
            raise ValueError("permission steps need a permission")
        if self.condition and not {"field", "op", "value"} <= self.condition.keys():
            raise ValueError("condition needs field, op and value")
        return self


class WorkflowIn(BaseModel):
    name: str | None = Field(None, max_length=120)
    active: bool | None = None
    allow_self_approval: bool | None = None
    steps: list[StepIn] = Field(max_length=6)


# ── shifts ─────────────────────────────────────────────────────────────────


class ShiftTemplateIn(BaseModel):
    code: str = Field(min_length=1, max_length=20, pattern=r"^[A-Za-z0-9_-]+$")
    name: str = Field(min_length=1, max_length=120)
    kind: Literal["general", "morning", "evening", "night", "rotational"] = "general"
    start_time: time
    end_time: time
    break_minutes: int = Field(30, ge=0, le=240)
    grace_in_minutes: int = Field(10, ge=0, le=120)
    grace_out_minutes: int = Field(10, ge=0, le=120)
    full_day_minutes: int = Field(420, ge=60, le=1440)
    half_day_minutes: int = Field(240, ge=30, le=1440)
    overtime_after_minutes: int = Field(30, ge=0, le=600)
    min_rest_minutes: int = Field(480, ge=0, le=1440)
    is_night: bool = False
    department_id: uuid.UUID | None = None
    color: str | None = Field(None, pattern=r"^#[0-9A-Fa-f]{6}$")

    @model_validator(mode="after")
    def _halves(self):
        if self.half_day_minutes > self.full_day_minutes:
            raise ValueError("half_day_minutes cannot exceed full_day_minutes")
        return self


class ShiftTemplateUpdate(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=120)
    break_minutes: int | None = Field(None, ge=0, le=240)
    grace_in_minutes: int | None = Field(None, ge=0, le=120)
    grace_out_minutes: int | None = Field(None, ge=0, le=120)
    full_day_minutes: int | None = Field(None, ge=60, le=1440)
    half_day_minutes: int | None = Field(None, ge=30, le=1440)
    overtime_after_minutes: int | None = Field(None, ge=0, le=600)
    min_rest_minutes: int | None = Field(None, ge=0, le=1440)
    is_night: bool | None = None
    color: str | None = Field(None, pattern=r"^#[0-9A-Fa-f]{6}$")


class HolidayIn(BaseModel):
    holiday_date: date
    name: str = Field(min_length=1, max_length=120)
    branch_id: uuid.UUID | None = None
    optional: bool = False


class HolidayOut(ORM):
    id: uuid.UUID
    holiday_date: date
    name: str
    branch_id: uuid.UUID | None
    optional: bool


class RosterIn(BaseModel):
    department_id: uuid.UUID
    period_start: date
    period_end: date
    notes: str | None = Field(None, max_length=1000)


class AssignmentCell(BaseModel):
    employee_id: uuid.UUID
    work_date: date
    shift_template_id: uuid.UUID | None = None
    is_weekly_off: bool = False
    unit_id: uuid.UUID | None = None
    notes: str | None = Field(None, max_length=500)


class RotationIn(BaseModel):
    employee_ids: list[uuid.UUID] = Field(min_length=1, max_length=200)
    pattern: list[str] = Field(min_length=1, max_length=28)
    stagger: bool = True


class SwapIn(BaseModel):
    kind: Literal["swap", "replacement"]
    requester_assignment_id: uuid.UUID
    counterpart_employee_id: uuid.UUID
    counterpart_assignment_id: uuid.UUID | None = None
    reason: str = Field(min_length=3, max_length=1000)

    @model_validator(mode="after")
    def _swap(self):
        if self.kind == "swap" and not self.counterpart_assignment_id:
            raise ValueError("a swap needs the colleague's shift")
        return self


class HandoverIn(BaseModel):
    department_id: uuid.UUID
    work_date: date
    shift_template_id: uuid.UUID | None = None
    from_employee_id: uuid.UUID
    to_employee_id: uuid.UUID | None = None
    notes: str = Field(min_length=3, max_length=5000)


class RequirementIn(BaseModel):
    department_id: uuid.UUID
    unit_id: uuid.UUID | None = None
    shift_template_id: uuid.UUID | None = None
    employee_category: Category
    min_count: int = Field(1, ge=0, le=500)
    patients_per_staff: Decimal | None = Field(None, gt=0, le=100)
    required_competency: str | None = Field(None, max_length=120)
    effective_from: date


class RequirementOut(ORM):
    id: uuid.UUID
    department_id: uuid.UUID
    unit_id: uuid.UUID | None
    shift_template_id: uuid.UUID | None
    employee_category: str
    min_count: int
    patients_per_staff: Decimal | None
    required_competency: str | None
    effective_from: date
    effective_to: date | None


class AllocationIn(BaseModel):
    employee_id: uuid.UUID
    department_id: uuid.UUID
    unit_id: uuid.UUID | None = None
    work_date: date
    shift_template_id: uuid.UUID | None = None
    allocation_type: Literal["temporary", "replacement"] = "temporary"
    replaces_employee_id: uuid.UUID | None = None
    reason: str | None = Field(None, max_length=1000)


# ── attendance operations ──────────────────────────────────────────────────


class CorrectionIn(BaseModel):
    employee_id: uuid.UUID | None = None  # omitted = yourself
    work_date: date
    punch_times: list[datetime] = Field(min_length=1, max_length=6)
    reason: str = Field(min_length=5, max_length=1000)


class RecalcIn(BaseModel):
    employee_ids: list[uuid.UUID] | None = Field(None, max_length=500)
    date_from: date
    date_to: date

    @model_validator(mode="after")
    def _range(self):
        if self.date_to < self.date_from:
            raise ValueError("date_to is before date_from")
        return self


class DismissIn(BaseModel):
    reason: str = Field(min_length=3, max_length=500)


# ── leave ──────────────────────────────────────────────────────────────────


class LeaveTypeIn(BaseModel):
    code: str = Field(min_length=1, max_length=20, pattern=r"^[A-Za-z0-9_-]+$")
    name: str = Field(min_length=1, max_length=120)
    paid: bool = True
    allow_half_day: bool = True
    max_consecutive_days: int | None = Field(None, ge=1, le=365)
    document_required_after_days: int | None = Field(None, ge=0, le=365)
    is_emergency: bool = False
    allow_negative_balance: bool = False
    gender: Literal["male", "female"] | None = None
    color: str | None = Field(None, pattern=r"^#[0-9A-Fa-f]{6}$")


class LeaveTypeUpdate(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=120)
    paid: bool | None = None
    allow_half_day: bool | None = None
    max_consecutive_days: int | None = Field(None, ge=1, le=365)
    document_required_after_days: int | None = Field(None, ge=0, le=365)
    is_emergency: bool | None = None
    allow_negative_balance: bool | None = None
    color: str | None = Field(None, pattern=r"^#[0-9A-Fa-f]{6}$")


class LeaveTypeOut(ORM):
    id: uuid.UUID
    code: str
    name: str
    paid: bool
    allow_half_day: bool
    max_consecutive_days: int | None
    document_required_after_days: int | None
    is_emergency: bool
    allow_negative_balance: bool
    gender: str | None
    color: str | None


class LeavePolicyIn(BaseModel):
    leave_type_id: uuid.UUID
    employee_category: Category | None = None
    annual_allocation: Decimal = Field(ge=0, le=365)
    accrual: Literal["annual", "monthly"] = "annual"
    carry_forward_max: Decimal = Field(Decimal("0"), ge=0, le=365)
    min_service_days: int = Field(0, ge=0, le=3650)
    effective_from: date


class LeavePolicyOut(ORM, LeavePolicyIn):
    id: uuid.UUID
    employee_category: str | None


class LeaveApplyIn(BaseModel):
    employee_id: uuid.UUID | None = None  # omitted = yourself
    leave_type_id: uuid.UUID
    start_date: date
    end_date: date
    half_day: Literal["first", "second"] | None = None
    reason: str = Field(min_length=3, max_length=2000)
    emergency: bool = False
    document_id: uuid.UUID | None = None


class LeaveCancelIn(BaseModel):
    reason: str = Field(min_length=3, max_length=1000)


class BalanceAdjustIn(BaseModel):
    employee_id: uuid.UUID
    leave_type_id: uuid.UUID
    year: int = Field(ge=2000, le=2100)
    delta: Decimal = Field(ge=-365, le=365)
    reason: str = Field(min_length=3, max_length=500)

    @field_validator("delta")
    @classmethod
    def _nonzero(cls, v):
        if v == 0:
            raise ValueError("delta cannot be zero")
        return v


class AccrualIn(BaseModel):
    year: int = Field(ge=2000, le=2100)
    month: int = Field(ge=1, le=12)
