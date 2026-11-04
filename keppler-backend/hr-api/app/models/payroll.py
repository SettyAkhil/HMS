"""Phase 3: compensation and payroll.

Statutory rates (PF, ESI, professional tax, overtime) live in
`statutory_configs` as validated, effective-dated settings entered by the
hospital -- nothing is hardcoded. A finalized run is immutable (trigger in
migration 0003); corrections go through a reversal run or an adjustment
carried into a later run."""

import uuid
from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import Boolean, Date, DateTime, ForeignKey, Index, Integer, Numeric, String, Text, UniqueConstraint, text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, SoftDelete, TenantMixin

Money = Numeric(14, 2)


def _fk(table: str, nullable: bool = True, ondelete: str | None = None):
    return mapped_column(UUID(as_uuid=True), ForeignKey(f"{table}.id", ondelete=ondelete), nullable=nullable)


class SalaryComponent(Base, TenantMixin, SoftDelete):
    __tablename__ = "salary_components"
    __table_args__ = (Index("uq_salary_components_code", "tenant_id", "code", unique=True,
                            postgresql_where=text("deleted_at IS NULL")),)
    code: Mapped[str] = mapped_column(String(20), nullable=False)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    kind: Mapped[str] = mapped_column(String(12), nullable=False)  # earning|deduction
    prorate: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    taxable: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    # Counts toward the PF wage base (Basic, DA ...).
    pf_wage: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)


class SalaryStructure(Base, TenantMixin, SoftDelete):
    __tablename__ = "salary_structures"
    __table_args__ = (Index("uq_salary_structures_code", "tenant_id", "code", unique=True,
                            postgresql_where=text("deleted_at IS NULL")),)
    code: Mapped[str] = mapped_column(String(20), nullable=False)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    # [{"component": "BASIC", "calc": "percent_of_ctc"|"percent_of_basic"|"fixed"|"balance", "value": 40}]
    lines: Mapped[list] = mapped_column(JSONB, nullable=False)


class EmployeeCompensation(Base, TenantMixin):
    __tablename__ = "employee_compensation"
    __table_args__ = (Index("uq_compensation_open", "tenant_id", "employee_id", unique=True,
                            postgresql_where=text("effective_to IS NULL")),)
    employee_id: Mapped[uuid.UUID] = _fk("employees", False)
    structure_id: Mapped[uuid.UUID] = _fk("salary_structures", False)
    monthly_gross: Mapped[Decimal] = mapped_column(Money, nullable=False)
    overrides: Mapped[dict] = mapped_column(JSONB, nullable=False, server_default="{}")  # {component: amount}
    effective_from: Mapped[date] = mapped_column(Date, nullable=False)
    effective_to: Mapped[date | None] = mapped_column(Date)
    pf_enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    esi_enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    pt_state: Mapped[str | None] = mapped_column(String(40))
    uan: Mapped[str | None] = mapped_column(String(20))
    esi_number: Mapped[str | None] = mapped_column(String(20))
    # Fernet ciphertext; responses show only the last four digits.
    pan_encrypted: Mapped[str | None] = mapped_column(Text)
    bank_account_encrypted: Mapped[str | None] = mapped_column(Text)
    bank_account_last4: Mapped[str | None] = mapped_column(String(4))
    bank_ifsc: Mapped[str | None] = mapped_column(String(11))
    bank_name: Mapped[str | None] = mapped_column(String(120))
    reason: Mapped[str | None] = mapped_column(Text)


class StatutoryConfig(Base, TenantMixin):
    __tablename__ = "statutory_configs"
    __table_args__ = (UniqueConstraint("tenant_id", "kind", "effective_from"),)
    kind: Mapped[str] = mapped_column(String(12), nullable=False)  # pf|esi|pt|overtime
    config: Mapped[dict] = mapped_column(JSONB, nullable=False)
    effective_from: Mapped[date] = mapped_column(Date, nullable=False)
    source_note: Mapped[str | None] = mapped_column(Text)  # notification / circular the rates came from


class EmployeeLoan(Base, TenantMixin):
    __tablename__ = "employee_loans"
    employee_id: Mapped[uuid.UUID] = _fk("employees", False)
    kind: Mapped[str] = mapped_column(String(12), nullable=False)  # advance|loan
    principal: Mapped[Decimal] = mapped_column(Money, nullable=False)
    installment: Mapped[Decimal] = mapped_column(Money, nullable=False)
    start_year: Mapped[int] = mapped_column(Integer, nullable=False)
    start_month: Mapped[int] = mapped_column(Integer, nullable=False)
    recovered: Mapped[Decimal] = mapped_column(Money, nullable=False, default=0)
    status: Mapped[str] = mapped_column(String(12), nullable=False, default="active")  # active|closed|cancelled
    reason: Mapped[str | None] = mapped_column(Text)


class PayrollRun(Base, TenantMixin):
    __tablename__ = "payroll_runs"
    __table_args__ = (Index("uq_payroll_run_period", "tenant_id", "year", "month", "branch_key", unique=True,
                            postgresql_where=text("kind = 'regular' AND status <> 'reversed'")),)
    code: Mapped[str] = mapped_column(String(30), nullable=False)
    kind: Mapped[str] = mapped_column(String(12), nullable=False, default="regular")  # regular|reversal
    year: Mapped[int] = mapped_column(Integer, nullable=False)
    month: Mapped[int] = mapped_column(Integer, nullable=False)
    branch_id: Mapped[uuid.UUID | None] = _fk("branches")
    branch_key: Mapped[str] = mapped_column(String(40), nullable=False, default="all")
    # draft -> calculated -> in_review -> approved -> finalized (-> reversed)
    status: Mapped[str] = mapped_column(String(12), nullable=False, default="draft")
    totals: Mapped[dict] = mapped_column(JSONB, nullable=False, server_default="{}")
    calculated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    approval_instance_id: Mapped[uuid.UUID | None] = _fk("approval_instances")
    finalized_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    finalized_by: Mapped[str | None] = mapped_column(String(120))
    reverses_run_id: Mapped[uuid.UUID | None] = _fk("payroll_runs")
    reversal_reason: Mapped[str | None] = mapped_column(Text)
    posting_status: Mapped[str | None] = mapped_column(String(20))  # posted|pending|failed
    posting_reference: Mapped[dict | None] = mapped_column(JSONB)


class PayrollItem(Base, TenantMixin):
    __tablename__ = "payroll_items"
    __table_args__ = (UniqueConstraint("run_id", "employee_id"),)
    run_id: Mapped[uuid.UUID] = _fk("payroll_runs", False, "CASCADE")
    employee_id: Mapped[uuid.UUID] = _fk("employees", False)
    compensation_id: Mapped[uuid.UUID | None] = _fk("employee_compensation")
    days_in_month: Mapped[int] = mapped_column(Integer, nullable=False)
    payable_days: Mapped[Decimal] = mapped_column(Numeric(6, 2), nullable=False)
    lop_days: Mapped[Decimal] = mapped_column(Numeric(6, 2), nullable=False)
    overtime_minutes: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    night_shifts: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    earnings: Mapped[list] = mapped_column(JSONB, nullable=False)  # [{code, name, amount}]
    deductions: Mapped[list] = mapped_column(JSONB, nullable=False)
    employer_contributions: Mapped[list] = mapped_column(JSONB, nullable=False)
    gross: Mapped[Decimal] = mapped_column(Money, nullable=False)
    total_deductions: Mapped[Decimal] = mapped_column(Money, nullable=False)
    net: Mapped[Decimal] = mapped_column(Money, nullable=False)
    warnings: Mapped[list] = mapped_column(JSONB, nullable=False, server_default="[]")
    status: Mapped[str] = mapped_column(String(12), nullable=False, default="ok")  # ok|warning|error


class PayrollAdjustment(Base, TenantMixin):
    __tablename__ = "payroll_adjustments"
    employee_id: Mapped[uuid.UUID] = _fk("employees", False)
    # Applied by the first run for this period (or later) that includes the employee.
    year: Mapped[int] = mapped_column(Integer, nullable=False)
    month: Mapped[int] = mapped_column(Integer, nullable=False)
    kind: Mapped[str] = mapped_column(String(12), nullable=False)  # earning|deduction
    code: Mapped[str] = mapped_column(String(20), nullable=False)  # e.g. ARREARS, INCENTIVE, TDS, RECOVERY
    amount: Mapped[Decimal] = mapped_column(Money, nullable=False)
    reason: Mapped[str] = mapped_column(Text, nullable=False)
    applied_run_id: Mapped[uuid.UUID | None] = _fk("payroll_runs", ondelete="SET NULL")
    status: Mapped[str] = mapped_column(String(12), nullable=False, default="pending")  # pending|applied|cancelled


class Payslip(Base, TenantMixin):
    __tablename__ = "payslips"
    __table_args__ = (UniqueConstraint("tenant_id", "number"),)
    item_id: Mapped[uuid.UUID] = _fk("payroll_items", False)
    run_id: Mapped[uuid.UUID] = _fk("payroll_runs", False)
    employee_id: Mapped[uuid.UUID] = _fk("employees", False, )
    number: Mapped[str] = mapped_column(String(40), nullable=False)
    year: Mapped[int] = mapped_column(Integer, nullable=False)
    month: Mapped[int] = mapped_column(Integer, nullable=False)
    snapshot: Mapped[dict] = mapped_column(JSONB, nullable=False)
    void: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
