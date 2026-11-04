"""The single employee master every other HR area references.

Current placement (branch, designation, manager, status) lives on `employees`
for fast reads; `employment_records` and `employee_departments` keep the
effective-dated history behind it, so a transfer is a new row, never an edit
that erases where the employee used to work."""

import uuid
from datetime import date, datetime

from sqlalchemy import Date, DateTime, ForeignKey, Index, Integer, String, Text, func, text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, SoftDelete, TenantMixin

EMPLOYEE_CATEGORIES = (
    "doctor", "consultant", "nurse", "radiologist", "lab_technician", "pharmacist",
    "ot_technician", "icu_technician", "emergency_staff", "front_office", "billing",
    "administration", "housekeeping", "security", "support",
)
EMPLOYMENT_TYPES = ("permanent", "contract", "probation", "visiting", "intern", "part_time")
EMPLOYEE_STATUSES = ("draft", "active", "suspended", "terminated", "archived")


class Employee(Base, TenantMixin, SoftDelete):
    __tablename__ = "employees"
    __table_args__ = (
        Index("uq_employees_code", "tenant_id", "employee_code", unique=True),
        Index(
            "uq_employees_email", "tenant_id", text("lower(email)"), unique=True,
            postgresql_where=text("email IS NOT NULL AND deleted_at IS NULL"),
        ),
        Index(
            "uq_employees_hms_username", "tenant_id", "hms_username", unique=True,
            postgresql_where=text("hms_username IS NOT NULL"),
        ),
        Index("ix_employees_search", "tenant_id", "status", "employee_category"),
    )

    employee_code: Mapped[str] = mapped_column(String(30), nullable=False)
    first_name: Mapped[str] = mapped_column(String(80), nullable=False)
    middle_name: Mapped[str | None] = mapped_column(String(80))
    last_name: Mapped[str | None] = mapped_column(String(80))
    date_of_birth: Mapped[date | None] = mapped_column(Date)
    gender: Mapped[str | None] = mapped_column(String(20))
    email: Mapped[str | None] = mapped_column(String(200))
    phone: Mapped[str | None] = mapped_column(String(30))
    address_line: Mapped[str | None] = mapped_column(Text)
    city: Mapped[str | None] = mapped_column(String(120))
    state: Mapped[str | None] = mapped_column(String(120))
    postal_code: Mapped[str | None] = mapped_column(String(20))

    employee_category: Mapped[str] = mapped_column(String(40), nullable=False)
    employment_type: Mapped[str] = mapped_column(String(20), nullable=False, default="permanent")
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="draft")
    joining_date: Mapped[date | None] = mapped_column(Date)
    exit_date: Mapped[date | None] = mapped_column(Date)
    contract_end_date: Mapped[date | None] = mapped_column(Date)
    branch_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("branches.id"))
    designation_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("designations.id"))
    reporting_manager_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("employees.id"))
    # Points at a payroll salary structure once Phase 3 lands.
    salary_structure_ref: Mapped[str | None] = mapped_column(String(60))

    # Link to the auth-service account; HR never stores the password.
    hms_username: Mapped[str | None] = mapped_column(String(120))
    hms_employee_id: Mapped[str | None] = mapped_column(String(60), index=True)


class EmployeeProfile(Base, TenantMixin):
    __tablename__ = "employee_profiles"
    employee_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("employees.id", ondelete="CASCADE"), unique=True, nullable=False
    )
    qualification: Mapped[str | None] = mapped_column(String(200))
    specialization: Mapped[str | None] = mapped_column(String(200))
    blood_group: Mapped[str | None] = mapped_column(String(5))
    clinical_competencies: Mapped[list] = mapped_column(JSONB, nullable=False, server_default="[]")
    languages: Mapped[list] = mapped_column(JSONB, nullable=False, server_default="[]")


class EmployeeContact(Base, TenantMixin):
    __tablename__ = "employee_contacts"
    employee_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("employees.id", ondelete="CASCADE"), nullable=False, index=True
    )
    kind: Mapped[str] = mapped_column(String(20), nullable=False, default="emergency")
    name: Mapped[str] = mapped_column(String(160), nullable=False)
    relationship: Mapped[str | None] = mapped_column(String(60))
    phone: Mapped[str | None] = mapped_column(String(30))
    email: Mapped[str | None] = mapped_column(String(200))


class EmploymentRecord(Base, TenantMixin):
    __tablename__ = "employment_records"
    __table_args__ = (Index("ix_employment_records_emp", "employee_id", "effective_from"),)
    employee_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("employees.id", ondelete="CASCADE"), nullable=False
    )
    change_type: Mapped[str] = mapped_column(String(30), nullable=False)
    effective_from: Mapped[date] = mapped_column(Date, nullable=False)
    effective_to: Mapped[date | None] = mapped_column(Date)
    employment_type: Mapped[str] = mapped_column(String(20), nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False)
    branch_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("branches.id"))
    designation_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("designations.id"))
    reporting_manager_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("employees.id"))
    reason: Mapped[str | None] = mapped_column(Text)


class EmployeeDepartment(Base, TenantMixin):
    """Many departments per employee, each effective-dated. Exactly one open
    assignment may be primary (enforced by the partial unique index)."""

    __tablename__ = "employee_departments"
    __table_args__ = (
        Index(
            "uq_employee_primary_department", "employee_id", unique=True,
            postgresql_where=text("is_primary AND effective_to IS NULL"),
        ),
        Index("ix_employee_departments_dept", "tenant_id", "department_id"),
    )
    employee_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("employees.id", ondelete="CASCADE"), nullable=False, index=True
    )
    department_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("departments.id"), nullable=False)
    unit_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("organization_units.id"))
    is_primary: Mapped[bool] = mapped_column(nullable=False, default=False)
    allocation_percent: Mapped[int] = mapped_column(Integer, nullable=False, default=100)
    effective_from: Mapped[date] = mapped_column(Date, nullable=False)
    effective_to: Mapped[date | None] = mapped_column(Date)


class EmployeeHistory(Base, TenantMixin):
    __tablename__ = "employee_history"
    employee_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("employees.id", ondelete="CASCADE"), nullable=False, index=True
    )
    event_type: Mapped[str] = mapped_column(String(40), nullable=False)
    summary: Mapped[str] = mapped_column(Text, nullable=False)
    details: Mapped[dict | None] = mapped_column(JSONB)
    occurred_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class EmployeeCredential(Base, TenantMixin, SoftDelete):
    __tablename__ = "employee_credentials"
    __table_args__ = (Index("ix_employee_credentials_expiry", "tenant_id", "expires_on"),)
    employee_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("employees.id", ondelete="CASCADE"), nullable=False, index=True
    )
    credential_type: Mapped[str] = mapped_column(String(40), nullable=False)
    number: Mapped[str] = mapped_column(String(80), nullable=False)
    issuing_authority: Mapped[str | None] = mapped_column(String(200))
    issued_on: Mapped[date | None] = mapped_column(Date)
    expires_on: Mapped[date | None] = mapped_column(Date)
    verification_status: Mapped[str] = mapped_column(String(20), nullable=False, default="pending")
    verified_by: Mapped[str | None] = mapped_column(String(120))
    verified_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
