"""HR strategy & governance, workforce planning, HR/admin budgets, employee
engagement, and the Facility & Administration domain (requests, assets,
vendors). Administration is its own domain (facility.* permissions) that
shares the employee master rather than duplicating it."""

import uuid
from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import Boolean, Date, DateTime, ForeignKey, Index, Integer, Numeric, String, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, SoftDelete, TenantMixin

Money = Numeric(14, 2)


def _fk(table: str, nullable: bool = True, ondelete: str | None = None):
    return mapped_column(UUID(as_uuid=True), ForeignKey(f"{table}.id", ondelete=ondelete), nullable=nullable)


# ── HR strategy & governance ───────────────────────────────────────────────


class HrObjective(Base, TenantMixin):
    __tablename__ = "hr_objectives"
    title: Mapped[str] = mapped_column(String(300), nullable=False)
    pillar: Mapped[str] = mapped_column(String(40), nullable=False)  # talent|retention|capability|compliance|culture|cost
    owner_employee_id: Mapped[uuid.UUID | None] = _fk("employees")
    metric: Mapped[str] = mapped_column(String(200), nullable=False)
    baseline: Mapped[Decimal | None] = mapped_column(Numeric(12, 2))
    target: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    current: Mapped[Decimal | None] = mapped_column(Numeric(12, 2))
    unit: Mapped[str | None] = mapped_column(String(20))
    higher_is_better: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    due_date: Mapped[date] = mapped_column(Date, nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="active")  # active|achieved|dropped


class HrPolicy(Base, TenantMixin, SoftDelete):
    __tablename__ = "hr_policies"
    __table_args__ = (UniqueConstraint("tenant_id", "code", "version"),)
    code: Mapped[str] = mapped_column(String(30), nullable=False)
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    category: Mapped[str] = mapped_column(String(40), nullable=False)  # conduct|leave|attendance|safety|pay|clinical|it|other
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    summary: Mapped[str] = mapped_column(Text, nullable=False)
    document_id: Mapped[uuid.UUID | None] = _fk("employee_documents")
    effective_from: Mapped[date] = mapped_column(Date, nullable=False)
    review_due: Mapped[date | None] = mapped_column(Date)
    requires_acknowledgement: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    audience: Mapped[dict] = mapped_column(JSONB, nullable=False, server_default='{"all": true}')
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="draft")  # draft|published|retired
    published_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class PolicyAcknowledgement(Base, TenantMixin):
    __tablename__ = "policy_acknowledgements"
    __table_args__ = (UniqueConstraint("policy_id", "employee_id"),)
    policy_id: Mapped[uuid.UUID] = _fk("hr_policies", False, "CASCADE")
    employee_id: Mapped[uuid.UUID] = _fk("employees", False)
    acknowledged_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)


# ── workforce planning & budgets ───────────────────────────────────────────


class PositionPlan(Base, TenantMixin):
    """Sanctioned establishment: how many of a designation a department may
    have this fiscal year, and what each costs per month."""

    __tablename__ = "position_plans"
    __table_args__ = (UniqueConstraint("tenant_id", "fiscal_year", "department_id", "designation_id"),)
    fiscal_year: Mapped[int] = mapped_column(Integer, nullable=False)  # FY starting April of this year
    department_id: Mapped[uuid.UUID] = _fk("departments", False)
    designation_id: Mapped[uuid.UUID] = _fk("designations", False)
    sanctioned: Mapped[int] = mapped_column(Integer, nullable=False)
    monthly_cost_per_position: Mapped[Decimal | None] = mapped_column(Money)
    justification: Mapped[str | None] = mapped_column(Text)


class Budget(Base, TenantMixin):
    __tablename__ = "budgets"
    __table_args__ = (UniqueConstraint("tenant_id", "domain", "fiscal_year", "department_id", "category"),)
    domain: Mapped[str] = mapped_column(String(10), nullable=False)  # hr|admin
    fiscal_year: Mapped[int] = mapped_column(Integer, nullable=False)
    department_id: Mapped[uuid.UUID | None] = _fk("departments")
    # hr: salary|overtime|recruitment|training|welfare|other; admin: maintenance|housekeeping|security|utilities|assets|vendors|other
    category: Mapped[str] = mapped_column(String(30), nullable=False)
    amount: Mapped[Decimal] = mapped_column(Money, nullable=False)
    notes: Mapped[str | None] = mapped_column(Text)


class Expense(Base, TenantMixin):
    """Spend not already captured by payroll (recruitment fees, training,
    welfare, facility work orders, vendor invoices)."""

    __tablename__ = "expenses"
    __table_args__ = (Index("ix_expenses_period", "tenant_id", "domain", "spent_on"),)
    domain: Mapped[str] = mapped_column(String(10), nullable=False)
    category: Mapped[str] = mapped_column(String(30), nullable=False)
    department_id: Mapped[uuid.UUID | None] = _fk("departments")
    spent_on: Mapped[date] = mapped_column(Date, nullable=False)
    amount: Mapped[Decimal] = mapped_column(Money, nullable=False)
    description: Mapped[str] = mapped_column(String(300), nullable=False)
    reference: Mapped[str | None] = mapped_column(String(80))
    vendor_id: Mapped[uuid.UUID | None] = _fk("vendors")
    facility_request_id: Mapped[uuid.UUID | None] = _fk("facility_requests")


# ── engagement ─────────────────────────────────────────────────────────────


class Survey(Base, TenantMixin):
    __tablename__ = "surveys"
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    # [{"id": "q1", "text": "...", "kind": "scale"|"choice"|"text", "options": [...]}]
    questions: Mapped[list] = mapped_column(JSONB, nullable=False)
    anonymous: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    audience: Mapped[dict] = mapped_column(JSONB, nullable=False, server_default='{"all": true}')
    opens_on: Mapped[date] = mapped_column(Date, nullable=False)
    closes_on: Mapped[date] = mapped_column(Date, nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="draft")  # draft|open|closed


class SurveyResponse(Base, TenantMixin):
    """Anonymous surveys store a one-way hash of the respondent so each person
    answers once, without the answer being traceable to them."""

    __tablename__ = "survey_responses"
    __table_args__ = (UniqueConstraint("survey_id", "respondent_key"),)
    survey_id: Mapped[uuid.UUID] = _fk("surveys", False, "CASCADE")
    respondent_key: Mapped[str] = mapped_column(String(64), nullable=False)
    employee_id: Mapped[uuid.UUID | None] = _fk("employees")  # NULL when anonymous
    department_id: Mapped[uuid.UUID | None] = _fk("departments")
    answers: Mapped[dict] = mapped_column(JSONB, nullable=False)


class Recognition(Base, TenantMixin):
    __tablename__ = "recognitions"
    from_employee_id: Mapped[uuid.UUID | None] = _fk("employees")
    to_employee_id: Mapped[uuid.UUID] = _fk("employees", False)
    category: Mapped[str] = mapped_column(String(30), nullable=False)  # patient_care|teamwork|above_beyond|safety|innovation
    message: Mapped[str] = mapped_column(Text, nullable=False)


# ── facility & administration ──────────────────────────────────────────────


class Vendor(Base, TenantMixin, SoftDelete):
    __tablename__ = "vendors"
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    service: Mapped[str] = mapped_column(String(40), nullable=False)  # housekeeping|security|biomedical|it|catering|laundry|transport|maintenance|other
    contact_name: Mapped[str | None] = mapped_column(String(120))
    phone: Mapped[str | None] = mapped_column(String(30))
    email: Mapped[str | None] = mapped_column(String(200))
    contract_start: Mapped[date | None] = mapped_column(Date)
    contract_end: Mapped[date | None] = mapped_column(Date)
    monthly_value: Mapped[Decimal | None] = mapped_column(Money)
    sla_hours: Mapped[int | None] = mapped_column(Integer)
    rating: Mapped[int | None] = mapped_column(Integer)


class FacilityRequest(Base, TenantMixin):
    __tablename__ = "facility_requests"
    __table_args__ = (Index("ix_facility_requests_open", "tenant_id", "status", "priority"),)
    number: Mapped[str] = mapped_column(String(20), nullable=False)
    category: Mapped[str] = mapped_column(String(30), nullable=False)  # maintenance|electrical|plumbing|housekeeping|biomedical|it|transport|stationery|security|other
    priority: Mapped[str] = mapped_column(String(10), nullable=False, default="normal")  # critical|high|normal|low
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    location: Mapped[str] = mapped_column(String(200), nullable=False)
    department_id: Mapped[uuid.UUID | None] = _fk("departments")
    asset_id: Mapped[uuid.UUID | None] = _fk("assets")
    requested_by: Mapped[str] = mapped_column(String(120), nullable=False)
    requester_employee_id: Mapped[uuid.UUID | None] = _fk("employees")
    assigned_to_employee_id: Mapped[uuid.UUID | None] = _fk("employees")
    vendor_id: Mapped[uuid.UUID | None] = _fk("vendors")
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="open")  # open|assigned|in_progress|on_hold|resolved|closed|cancelled
    due_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    resolution: Mapped[str | None] = mapped_column(Text)
    cost: Mapped[Decimal | None] = mapped_column(Money)
    satisfaction: Mapped[int | None] = mapped_column(Integer)  # 1-5 from the requester


class FacilityRequestUpdate(Base, TenantMixin):
    __tablename__ = "facility_request_updates"
    request_id: Mapped[uuid.UUID] = _fk("facility_requests", False, "CASCADE")
    author: Mapped[str] = mapped_column(String(120), nullable=False)
    status: Mapped[str | None] = mapped_column(String(20))
    note: Mapped[str] = mapped_column(Text, nullable=False)


class Asset(Base, TenantMixin, SoftDelete):
    __tablename__ = "assets"
    __table_args__ = (UniqueConstraint("tenant_id", "tag"),)
    tag: Mapped[str] = mapped_column(String(40), nullable=False)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    category: Mapped[str] = mapped_column(String(30), nullable=False)  # it|medical|furniture|vehicle|communication|uniform|key|other
    serial_number: Mapped[str | None] = mapped_column(String(80))
    location: Mapped[str | None] = mapped_column(String(200))
    department_id: Mapped[uuid.UUID | None] = _fk("departments")
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="in_stock")  # in_stock|assigned|maintenance|retired|lost
    condition: Mapped[str] = mapped_column(String(20), nullable=False, default="good")  # new|good|fair|poor
    purchase_date: Mapped[date | None] = mapped_column(Date)
    cost: Mapped[Decimal | None] = mapped_column(Money)
    warranty_until: Mapped[date | None] = mapped_column(Date)
    vendor_id: Mapped[uuid.UUID | None] = _fk("vendors")


class AssetAssignment(Base, TenantMixin):
    __tablename__ = "asset_assignments"
    __table_args__ = (Index("ix_asset_assignments_open", "tenant_id", "asset_id", "returned_on"),)
    asset_id: Mapped[uuid.UUID] = _fk("assets", False)
    employee_id: Mapped[uuid.UUID] = _fk("employees", False)
    assigned_on: Mapped[date] = mapped_column(Date, nullable=False)
    expected_return: Mapped[date | None] = mapped_column(Date)
    returned_on: Mapped[date | None] = mapped_column(Date)
    condition_out: Mapped[str] = mapped_column(String(20), nullable=False, default="good")
    condition_in: Mapped[str | None] = mapped_column(String(20))
    notes: Mapped[str | None] = mapped_column(Text)
