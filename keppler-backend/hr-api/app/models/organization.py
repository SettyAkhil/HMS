"""Hospital -> branch -> department -> sub-department/unit, plus designations."""

import uuid
from decimal import Decimal

from sqlalchemy import ForeignKey, Index, Numeric, String, Text, UniqueConstraint, text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, SoftDelete, TenantMixin


class Hospital(Base, TenantMixin, SoftDelete):
    __tablename__ = "hospitals"
    __table_args__ = (UniqueConstraint("tenant_id", "code"),)
    code: Mapped[str] = mapped_column(String(40), nullable=False)
    name: Mapped[str] = mapped_column(String(200), nullable=False)


class Branch(Base, TenantMixin, SoftDelete):
    __tablename__ = "branches"
    __table_args__ = (UniqueConstraint("tenant_id", "code"),)
    hospital_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("hospitals.id"), nullable=False)
    code: Mapped[str] = mapped_column(String(40), nullable=False)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    city: Mapped[str | None] = mapped_column(String(120))
    address: Mapped[str | None] = mapped_column(Text)


class Department(Base, TenantMixin, SoftDelete):
    """A department, or a sub-department when `parent_id` is set."""

    __tablename__ = "departments"
    __table_args__ = (
        Index("uq_departments_code", "tenant_id", "code", unique=True, postgresql_where=text("deleted_at IS NULL")),
    )
    code: Mapped[str] = mapped_column(String(40), nullable=False)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    branch_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("branches.id"))
    parent_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("departments.id"))
    # Clinical departments feed staffing/allocation (ICU, ER, OT ...).
    kind: Mapped[str] = mapped_column(String(20), nullable=False, default="clinical")
    head_employee_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("employees.id", use_alter=True, name="fk_department_head")
    )
    cost_center: Mapped[str | None] = mapped_column(String(40))
    # Only returned to holders of hr.payroll.write.
    annual_budget: Mapped[Decimal | None] = mapped_column(Numeric(14, 2))
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="active")
    # Which HMS module this department staffs (icu, er, ot, ip, op, radiology,
    # laboratory, pharmacy ...), so clinical screens can ask "who is on duty".
    hms_module: Mapped[str | None] = mapped_column(String(30))
    # Bed-board ward names whose occupied beds are this department's census.
    census_wards: Mapped[list] = mapped_column(JSONB, nullable=False, server_default="[]")


class OrganizationUnit(Base, TenantMixin, SoftDelete):
    """A ward, bay or desk inside a department (ICU Bay A, OT-3, Triage)."""

    __tablename__ = "organization_units"
    __table_args__ = (UniqueConstraint("tenant_id", "department_id", "code"),)
    department_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("departments.id"), nullable=False)
    code: Mapped[str] = mapped_column(String(40), nullable=False)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    unit_type: Mapped[str | None] = mapped_column(String(40))
    bed_capacity: Mapped[int | None]


class Designation(Base, TenantMixin, SoftDelete):
    __tablename__ = "designations"
    __table_args__ = (
        Index("uq_designations_code", "tenant_id", "code", unique=True, postgresql_where=text("deleted_at IS NULL")),
    )
    code: Mapped[str] = mapped_column(String(40), nullable=False)
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    # One of EMPLOYEE_CATEGORIES (doctor, nurse, lab_technician ...).
    job_category: Mapped[str] = mapped_column(String(40), nullable=False)
    grade: Mapped[str | None] = mapped_column(String(20))
    is_clinical: Mapped[bool] = mapped_column(nullable=False, default=False)
    requires_registration: Mapped[bool] = mapped_column(nullable=False, default=False)
