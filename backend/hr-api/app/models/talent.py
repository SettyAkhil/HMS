"""Phase 4: recruitment & onboarding, documents, training & certification,
performance, compliance, grievances & discipline."""

import uuid
from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import BigInteger, Boolean, Date, DateTime, ForeignKey, Index, Integer, Numeric, String, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, SoftDelete, TenantMixin


def _fk(table: str, nullable: bool = True, ondelete: str | None = None):
    return mapped_column(UUID(as_uuid=True), ForeignKey(f"{table}.id", ondelete=ondelete), nullable=nullable)


# ── recruitment & onboarding ───────────────────────────────────────────────


class JobRequisition(Base, TenantMixin):
    __tablename__ = "job_requisitions"
    code: Mapped[str] = mapped_column(String(30), nullable=False)
    department_id: Mapped[uuid.UUID] = _fk("departments", False)
    designation_id: Mapped[uuid.UUID] = _fk("designations", False)
    branch_id: Mapped[uuid.UUID | None] = _fk("branches")
    positions: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    employment_type: Mapped[str] = mapped_column(String(20), nullable=False, default="permanent")
    justification: Mapped[str] = mapped_column(Text, nullable=False)
    replacing_employee_id: Mapped[uuid.UUID | None] = _fk("employees")
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="pending")  # pending|approved|rejected|filled|cancelled
    approval_instance_id: Mapped[uuid.UUID | None] = _fk("approval_instances")


class Vacancy(Base, TenantMixin):
    __tablename__ = "vacancies"
    requisition_id: Mapped[uuid.UUID] = _fk("job_requisitions", False)
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    requirements: Mapped[str | None] = mapped_column(Text)
    openings: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="open")  # open|on_hold|closed
    closes_on: Mapped[date | None] = mapped_column(Date)


class Candidate(Base, TenantMixin, SoftDelete):
    __tablename__ = "candidates"
    __table_args__ = (Index("ix_candidates_email", "tenant_id", "email"),)
    first_name: Mapped[str] = mapped_column(String(80), nullable=False)
    last_name: Mapped[str | None] = mapped_column(String(80))
    email: Mapped[str | None] = mapped_column(String(200))
    phone: Mapped[str | None] = mapped_column(String(30))
    source: Mapped[str | None] = mapped_column(String(60))
    current_employer: Mapped[str | None] = mapped_column(String(200))
    experience_years: Mapped[Decimal | None] = mapped_column(Numeric(4, 1))
    qualification: Mapped[str | None] = mapped_column(String(200))
    resume_document_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True))
    notes: Mapped[str | None] = mapped_column(Text)


class Application(Base, TenantMixin):
    __tablename__ = "applications"
    __table_args__ = (UniqueConstraint("vacancy_id", "candidate_id"),)
    vacancy_id: Mapped[uuid.UUID] = _fk("vacancies", False)
    candidate_id: Mapped[uuid.UUID] = _fk("candidates", False)
    # applied|screening|interview|selected|offered|hired|rejected|withdrawn
    stage: Mapped[str] = mapped_column(String(20), nullable=False, default="applied")
    rejection_reason: Mapped[str | None] = mapped_column(Text)
    employee_id: Mapped[uuid.UUID | None] = _fk("employees")


class Interview(Base, TenantMixin):
    __tablename__ = "interviews"
    application_id: Mapped[uuid.UUID] = _fk("applications", False, "CASCADE")
    round_name: Mapped[str] = mapped_column(String(80), nullable=False)
    scheduled_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    mode: Mapped[str] = mapped_column(String(20), nullable=False, default="in_person")
    interviewers: Mapped[list] = mapped_column(JSONB, nullable=False, server_default="[]")  # usernames
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="scheduled")  # scheduled|completed|cancelled
    rating: Mapped[int | None] = mapped_column(Integer)
    recommendation: Mapped[str | None] = mapped_column(String(20))  # hire|hold|reject
    feedback: Mapped[str | None] = mapped_column(Text)


class Offer(Base, TenantMixin):
    __tablename__ = "offers"
    application_id: Mapped[uuid.UUID] = _fk("applications", False)
    offered_gross: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)
    joining_date: Mapped[date] = mapped_column(Date, nullable=False)
    expires_on: Mapped[date] = mapped_column(Date, nullable=False)
    terms: Mapped[str | None] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="draft")  # draft|sent|accepted|declined|expired|withdrawn
    responded_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class OnboardingTask(Base, TenantMixin):
    __tablename__ = "onboarding_tasks"
    application_id: Mapped[uuid.UUID] = _fk("applications", False)
    employee_id: Mapped[uuid.UUID | None] = _fk("employees")
    # background_verification|document_verification|medical_fitness|it_access|biometric|uniform|induction|other
    category: Mapped[str] = mapped_column(String(30), nullable=False)
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    required_for_activation: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="pending")  # pending|done|failed|waived
    due_on: Mapped[date | None] = mapped_column(Date)
    completed_by: Mapped[str | None] = mapped_column(String(120))
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    notes: Mapped[str | None] = mapped_column(Text)


# ── documents ──────────────────────────────────────────────────────────────


class EmployeeDocument(Base, TenantMixin):
    """One row per version. Files live in private storage under `storage_key`,
    served only through an authorised endpoint, never by public URL."""

    __tablename__ = "employee_documents"
    __table_args__ = (Index("ix_employee_documents_owner", "tenant_id", "employee_id", "category"),)
    employee_id: Mapped[uuid.UUID | None] = _fk("employees")
    candidate_id: Mapped[uuid.UUID | None] = _fk("candidates")
    category: Mapped[str] = mapped_column(String(40), nullable=False)
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    previous_version_id: Mapped[uuid.UUID | None] = _fk("employee_documents")
    is_current: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    storage_key: Mapped[str] = mapped_column(String(200), nullable=False)
    filename: Mapped[str] = mapped_column(String(255), nullable=False)
    content_type: Mapped[str] = mapped_column(String(100), nullable=False)
    size_bytes: Mapped[int] = mapped_column(BigInteger, nullable=False)
    sha256: Mapped[str] = mapped_column(String(64), nullable=False)
    issue_date: Mapped[date | None] = mapped_column(Date)
    expiry_date: Mapped[date | None] = mapped_column(Date)
    # hr_only | employee (the employee sees it) | confidential (grievance managers only)
    access_level: Mapped[str] = mapped_column(String(20), nullable=False, default="employee")
    verification_status: Mapped[str] = mapped_column(String(20), nullable=False, default="pending")
    verified_by: Mapped[str | None] = mapped_column(String(120))
    verified_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    archived_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


# ── training & certification ───────────────────────────────────────────────


class TrainingProgram(Base, TenantMixin, SoftDelete):
    __tablename__ = "training_programs"
    code: Mapped[str] = mapped_column(String(20), nullable=False)
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    category: Mapped[str] = mapped_column(String(30), nullable=False)  # bls|acls|fire_safety|infection_control|clinical|department|other
    description: Mapped[str | None] = mapped_column(Text)
    validity_months: Mapped[int | None] = mapped_column(Integer)  # certificate lifetime
    mandatory_for: Mapped[list] = mapped_column(JSONB, nullable=False, server_default="[]")  # employee categories, or ["all"]
    department_id: Mapped[uuid.UUID | None] = _fk("departments")
    pass_score: Mapped[int | None] = mapped_column(Integer)


class TrainingSession(Base, TenantMixin):
    __tablename__ = "training_sessions"
    program_id: Mapped[uuid.UUID] = _fk("training_programs", False)
    starts_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    ends_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    location: Mapped[str | None] = mapped_column(String(200))
    trainer: Mapped[str | None] = mapped_column(String(200))
    capacity: Mapped[int | None] = mapped_column(Integer)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="scheduled")  # scheduled|completed|cancelled


class TrainingEnrollment(Base, TenantMixin):
    __tablename__ = "training_enrollments"
    __table_args__ = (UniqueConstraint("session_id", "employee_id"),)
    session_id: Mapped[uuid.UUID] = _fk("training_sessions", False)
    employee_id: Mapped[uuid.UUID] = _fk("employees", False)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="enrolled")  # enrolled|attended|no_show|passed|failed|cancelled
    score: Mapped[int | None] = mapped_column(Integer)
    remarks: Mapped[str | None] = mapped_column(Text)


class EmployeeCertification(Base, TenantMixin):
    __tablename__ = "employee_certifications"
    __table_args__ = (Index("ix_employee_certifications_expiry", "tenant_id", "expires_on"),)
    employee_id: Mapped[uuid.UUID] = _fk("employees", False)
    program_id: Mapped[uuid.UUID] = _fk("training_programs", False)
    enrollment_id: Mapped[uuid.UUID | None] = _fk("training_enrollments")
    certificate_number: Mapped[str | None] = mapped_column(String(80))
    issued_on: Mapped[date] = mapped_column(Date, nullable=False)
    expires_on: Mapped[date | None] = mapped_column(Date)
    document_id: Mapped[uuid.UUID | None] = _fk("employee_documents")
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="valid")  # valid|revoked|superseded


# ── performance ────────────────────────────────────────────────────────────


class ReviewCycle(Base, TenantMixin):
    __tablename__ = "review_cycles"
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    period_start: Mapped[date] = mapped_column(Date, nullable=False)
    period_end: Mapped[date] = mapped_column(Date, nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="draft")  # draft|active|closed
    # {"default": [{"code","label","weight"}], "nurse": [...], ...}
    criteria: Mapped[dict] = mapped_column(JSONB, nullable=False)
    rating_scale: Mapped[int] = mapped_column(Integer, nullable=False, default=5)


class PerformanceGoal(Base, TenantMixin):
    __tablename__ = "performance_goals"
    cycle_id: Mapped[uuid.UUID] = _fk("review_cycles", False)
    employee_id: Mapped[uuid.UUID | None] = _fk("employees")
    department_id: Mapped[uuid.UUID | None] = _fk("departments")  # a department KPI when no employee
    title: Mapped[str] = mapped_column(String(300), nullable=False)
    metric: Mapped[str | None] = mapped_column(String(200))
    target: Mapped[str | None] = mapped_column(String(120))
    weight: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    progress: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="open")


class PerformanceReview(Base, TenantMixin):
    __tablename__ = "performance_reviews"
    __table_args__ = (UniqueConstraint("cycle_id", "employee_id"),)
    cycle_id: Mapped[uuid.UUID] = _fk("review_cycles", False)
    employee_id: Mapped[uuid.UUID] = _fk("employees", False)
    reviewer_employee_id: Mapped[uuid.UUID | None] = _fk("employees")
    # self_assessment -> manager_review -> hr_review -> completed
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="self_assessment")
    self_comments: Mapped[str | None] = mapped_column(Text)
    manager_comments: Mapped[str | None] = mapped_column(Text)
    hr_comments: Mapped[str | None] = mapped_column(Text)
    overall_rating: Mapped[Decimal | None] = mapped_column(Numeric(4, 2))
    final_rating: Mapped[Decimal | None] = mapped_column(Numeric(4, 2))
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class ReviewScore(Base, TenantMixin):
    __tablename__ = "review_scores"
    __table_args__ = (UniqueConstraint("review_id", "criterion"),)
    review_id: Mapped[uuid.UUID] = _fk("performance_reviews", False, "CASCADE")
    criterion: Mapped[str] = mapped_column(String(40), nullable=False)
    weight: Mapped[int] = mapped_column(Integer, nullable=False)
    self_score: Mapped[int | None] = mapped_column(Integer)
    manager_score: Mapped[int | None] = mapped_column(Integer)
    comment: Mapped[str | None] = mapped_column(Text)


# ── compliance ─────────────────────────────────────────────────────────────


class CredentialVerification(Base, TenantMixin):
    __tablename__ = "credential_verifications"
    credential_id: Mapped[uuid.UUID] = _fk("employee_credentials", False)
    verdict: Mapped[str] = mapped_column(String(20), nullable=False)
    method: Mapped[str] = mapped_column(String(40), nullable=False)  # council_portal|original_seen|issuer_letter|other
    reference: Mapped[str | None] = mapped_column(String(200))
    notes: Mapped[str | None] = mapped_column(Text)


class ExpiryAlert(Base, TenantMixin):
    __tablename__ = "expiry_alerts"
    __table_args__ = (UniqueConstraint("tenant_id", "source_type", "source_id", "due_date"),)
    employee_id: Mapped[uuid.UUID] = _fk("employees", False)
    source_type: Mapped[str] = mapped_column(String(30), nullable=False)  # credential|certification|document|contract
    source_id: Mapped[str] = mapped_column(String(64), nullable=False)
    title: Mapped[str] = mapped_column(String(300), nullable=False)
    due_date: Mapped[date] = mapped_column(Date, nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="open")  # open|acknowledged|resolved
    acknowledged_by: Mapped[str | None] = mapped_column(String(120))


class ComplianceRecord(Base, TenantMixin):
    """Result of the latest compliance scan, one row per employee and requirement."""

    __tablename__ = "compliance_records"
    __table_args__ = (UniqueConstraint("tenant_id", "employee_id", "requirement"),)
    employee_id: Mapped[uuid.UUID] = _fk("employees", False)
    requirement: Mapped[str] = mapped_column(String(80), nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False)  # compliant|expiring|non_compliant
    detail: Mapped[str | None] = mapped_column(Text)
    due_date: Mapped[date | None] = mapped_column(Date)
    checked_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)


# ── grievances & discipline ────────────────────────────────────────────────


class GrievanceCase(Base, TenantMixin):
    __tablename__ = "grievance_cases"
    case_number: Mapped[str] = mapped_column(String(30), nullable=False)
    submitted_by_employee_id: Mapped[uuid.UUID | None] = _fk("employees")
    submitted_by_username: Mapped[str | None] = mapped_column(String(120))  # NULL when anonymous
    anonymous: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    category: Mapped[str] = mapped_column(String(40), nullable=False)  # harassment|workload|safety|pay|discrimination|other
    severity: Mapped[str] = mapped_column(String(10), nullable=False, default="medium")
    subject: Mapped[str] = mapped_column(String(300), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    against_employee_id: Mapped[uuid.UUID | None] = _fk("employees")
    # submitted|assigned|investigating|action_taken|resolved|closed
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="submitted")
    assigned_to: Mapped[str | None] = mapped_column(String(120))
    resolution: Mapped[str | None] = mapped_column(Text)
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    approval_instance_id: Mapped[uuid.UUID | None] = _fk("approval_instances")


class GrievanceComment(Base, TenantMixin):
    __tablename__ = "grievance_comments"
    case_id: Mapped[uuid.UUID] = _fk("grievance_cases", False, "CASCADE")
    author: Mapped[str] = mapped_column(String(120), nullable=False)
    body: Mapped[str] = mapped_column(Text, nullable=False)
    internal: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)  # hidden from the submitter


class InvestigationRecord(Base, TenantMixin):
    __tablename__ = "investigation_records"
    case_id: Mapped[uuid.UUID] = _fk("grievance_cases", False, "CASCADE")
    kind: Mapped[str] = mapped_column(String(20), nullable=False)  # interview|finding|evidence|note
    summary: Mapped[str] = mapped_column(Text, nullable=False)
    document_id: Mapped[uuid.UUID | None] = _fk("employee_documents")


class DisciplinaryAction(Base, TenantMixin):
    __tablename__ = "disciplinary_actions"
    employee_id: Mapped[uuid.UUID] = _fk("employees", False)
    case_id: Mapped[uuid.UUID | None] = _fk("grievance_cases")
    action_type: Mapped[str] = mapped_column(String(30), nullable=False)  # verbal_warning|written_warning|memo|suspension|termination
    details: Mapped[str] = mapped_column(Text, nullable=False)
    effective_from: Mapped[date] = mapped_column(Date, nullable=False)
    effective_to: Mapped[date | None] = mapped_column(Date)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="issued")  # issued|acknowledged|appealed|withdrawn
