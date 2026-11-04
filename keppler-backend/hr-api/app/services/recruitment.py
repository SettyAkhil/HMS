"""Requisition -> vacancy -> candidates & applications -> interviews -> offer
-> onboarding checklist -> activation.

Activation creates the employee master through the employee service (same
validation and events as any hire), sets compensation from the offer, asks
auth-service to create the HMS login (as the HR user doing it), maps the
biometric PIN when one is given and publishes a first-week roster. Each of
those side effects reports its own outcome, so a refusal by auth-service is
shown rather than hidden."""

import secrets
import string
import uuid
from datetime import date, datetime, timedelta, timezone

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.errors import AppError, Conflict, NotFound
from app.models import AttendanceIntegration, Designation
from app.models.talent import (
    Application, Candidate, Interview, JobRequisition, OnboardingTask, Offer, Vacancy,
)
from app.models.workforce import ShiftAssignment, ShiftTemplate
from app.services import employees as employee_svc
from app.services import attendance, hms, payroll, workflow
from app.services.common import actor_of, audit, emit, next_code, tenant_of

STAGES = ("applied", "screening", "interview", "selected", "offered", "hired", "rejected", "withdrawn")
FORWARD = {"applied": {"screening", "interview", "rejected", "withdrawn"},
           "screening": {"interview", "selected", "rejected", "withdrawn"},
           "interview": {"selected", "rejected", "withdrawn"},
           "selected": {"offered", "rejected", "withdrawn"},
           "offered": {"hired", "rejected", "withdrawn"}}
DEFAULT_TASKS = [
    ("background_verification", "Background verification"),
    ("document_verification", "Verify certificates and identity documents"),
    ("medical_fitness", "Pre-employment medical fitness"),
    ("induction", "Hospital induction (fire safety, infection control)"),
    ("it_access", "HMS login and system access", False),
    ("biometric", "Enrol fingerprint/face on the eSSL device", False),
]


def _new(db: Session, model, **data):
    obj = model(tenant_id=tenant_of(db), created_by=actor_of(db), updated_by=actor_of(db), **data)
    db.add(obj)
    db.flush()
    return obj


def _get(db: Session, model, obj_id, label):
    obj = db.get(model, obj_id)
    if obj is None or getattr(obj, "deleted_at", None):
        raise NotFound(f"{label} not found")
    return obj


# ── requisitions & vacancies ───────────────────────────────────────────────


def create_requisition(db: Session, data: dict, requester_username: str) -> JobRequisition:
    des = _get(db, Designation, data["designation_id"], "Designation")
    req = _new(db, JobRequisition, code=next_code(db, "requisition", "REQ-", 5), **data)
    requester = employee_svc.employee_for_user(db, requester_username)
    inst = workflow.start(db, "requisition", "job_requisition", req.id,
                          f"Manpower requisition {req.code}: {data['positions']} × {des.title}", requester,
                          requester_username, {"positions": data["positions"]})
    req.approval_instance_id = inst.id
    return req


@workflow.on_decision("requisition")
def _requisition_decided(db: Session, inst, outcome: str) -> None:
    req = db.get(JobRequisition, uuid.UUID(inst.entity_id))
    req.status = {"approved": "approved", "rejected": "rejected", "cancelled": "cancelled"}[outcome]


def list_requisitions(db: Session, status: str | None):
    stmt = select(JobRequisition).order_by(JobRequisition.created_at.desc())
    if status:
        stmt = stmt.where(JobRequisition.status == status)
    return db.scalars(stmt.limit(300)).all()


def create_vacancy(db: Session, data: dict) -> Vacancy:
    req = _get(db, JobRequisition, data["requisition_id"], "Requisition")
    if req.status != "approved":
        raise Conflict("A vacancy can only be opened from an approved requisition")
    v = _new(db, Vacancy, **data)
    audit(db, "vacancy", v.id, "opened", {"requisition": req.code})
    return v


def list_vacancies(db: Session, status: str | None):
    stmt = select(Vacancy).order_by(Vacancy.created_at.desc())
    if status:
        stmt = stmt.where(Vacancy.status == status)
    out = []
    for v in db.scalars(stmt.limit(300)):
        counts = dict(db.execute(select(Application.stage, func.count()).where(Application.vacancy_id == v.id)
                                 .group_by(Application.stage)).all())
        out.append({**{c: getattr(v, c) for c in ("id", "requisition_id", "title", "description", "requirements",
                                                   "openings", "status", "closes_on", "created_at")},
                    "pipeline": counts, "hired": counts.get("hired", 0)})
    return out


def set_vacancy_status(db: Session, vid: uuid.UUID, status: str) -> Vacancy:
    v = _get(db, Vacancy, vid, "Vacancy")
    v.status = status
    audit(db, "vacancy", v.id, status)
    return v


# ── candidates & applications ──────────────────────────────────────────────


def create_candidate(db: Session, data: dict) -> Candidate:
    if data.get("email"):
        dup = db.scalar(select(Candidate).where(func.lower(Candidate.email) == data["email"].lower(),
                                                Candidate.deleted_at.is_(None)))
        if dup:
            raise Conflict("A candidate with this email already exists", {"candidate_id": str(dup.id)})
    c = _new(db, Candidate, **data)
    audit(db, "candidate", c.id, "registered")
    return c


def apply(db: Session, vacancy_id: uuid.UUID, candidate_id: uuid.UUID) -> Application:
    v = _get(db, Vacancy, vacancy_id, "Vacancy")
    if v.status != "open":
        raise Conflict("This vacancy is not open")
    _get(db, Candidate, candidate_id, "Candidate")
    a = _new(db, Application, vacancy_id=v.id, candidate_id=candidate_id)
    audit(db, "application", a.id, "created")
    return a


def move(db: Session, app_id: uuid.UUID, stage: str, reason: str | None) -> Application:
    a = _get(db, Application, app_id, "Application")
    if stage not in FORWARD.get(a.stage, set()):
        raise Conflict(f"Cannot move an application from {a.stage} to {stage}")
    if stage in ("offered", "hired"):
        raise Conflict(f"{stage.title()} is set by the offer and activation steps")
    if stage == "rejected" and not reason:
        raise AppError("Give a reason for rejecting")
    previous, a.stage = a.stage, stage
    a.rejection_reason = reason if stage == "rejected" else a.rejection_reason
    audit(db, "application", a.id, "moved", {"from": previous, "to": stage, "reason": reason})
    return a


def pipeline(db: Session, vacancy_id: uuid.UUID | None):
    stmt = select(Application, Candidate, Vacancy).join(Candidate, Candidate.id == Application.candidate_id).join(
        Vacancy, Vacancy.id == Application.vacancy_id).order_by(Application.created_at.desc())
    if vacancy_id:
        stmt = stmt.where(Application.vacancy_id == vacancy_id)
    out = []
    for a, c, v in db.execute(stmt.limit(500)).all():
        interviews = db.scalars(select(Interview).where(Interview.application_id == a.id)
                                .order_by(Interview.scheduled_at)).all()
        offer = db.scalar(select(Offer).where(Offer.application_id == a.id).order_by(Offer.created_at.desc()))
        out.append({"id": a.id, "stage": a.stage, "rejection_reason": a.rejection_reason, "employee_id": a.employee_id,
                    "vacancy_id": v.id, "vacancy": v.title, "candidate_id": c.id,
                    "candidate_name": " ".join(p for p in (c.first_name, c.last_name) if p), "email": c.email,
                    "phone": c.phone, "experience_years": c.experience_years, "source": c.source,
                    "interviews": [{"id": i.id, "round_name": i.round_name, "scheduled_at": i.scheduled_at,
                                    "status": i.status, "rating": i.rating, "recommendation": i.recommendation,
                                    "feedback": i.feedback, "interviewers": i.interviewers} for i in interviews],
                    "offer": {"id": offer.id, "status": offer.status, "offered_gross": offer.offered_gross,
                              "joining_date": offer.joining_date, "expires_on": offer.expires_on} if offer else None,
                    "created_at": a.created_at})
    return out


# ── interviews ─────────────────────────────────────────────────────────────


def schedule_interview(db: Session, data: dict) -> Interview:
    a = _get(db, Application, data["application_id"], "Application")
    if a.stage in ("rejected", "withdrawn", "hired"):
        raise Conflict(f"Application is {a.stage}")
    if data["scheduled_at"] < datetime.now(timezone.utc) - timedelta(hours=1):
        raise AppError("Interview time is in the past")
    i = _new(db, Interview, **data)
    if a.stage in ("applied", "screening"):
        a.stage = "interview"
    emit(db, "recruitment.interview.scheduled", i.id, {"application_id": a.id, "at": data["scheduled_at"],
                                                       "interviewers": data.get("interviewers", [])})
    return i


def record_feedback(db: Session, iid: uuid.UUID, data: dict, username: str, can_manage: bool) -> Interview:
    i = _get(db, Interview, iid, "Interview")
    if not can_manage and username not in (i.interviewers or []):
        raise Conflict("Only a listed interviewer or recruiter can record feedback")
    i.rating, i.recommendation, i.feedback, i.status = data["rating"], data["recommendation"], data["feedback"], "completed"
    audit(db, "interview", i.id, "feedback", {"rating": data["rating"], "recommendation": data["recommendation"]})
    return i


# ── offers ─────────────────────────────────────────────────────────────────


def create_offer(db: Session, data: dict) -> Offer:
    a = _get(db, Application, data["application_id"], "Application")
    if a.stage != "selected":
        raise Conflict("Make an offer only to a selected candidate")
    if data["expires_on"] < date.today() or data["joining_date"] < date.today():
        raise AppError("Offer and joining dates must be in the future")
    o = _new(db, Offer, **data, status="sent")
    a.stage = "offered"
    audit(db, "offer", o.id, "sent", {"gross": data["offered_gross"], "joining_date": data["joining_date"]})
    emit(db, "recruitment.offer.sent", o.id, {"application_id": a.id})
    return o


def respond_offer(db: Session, oid: uuid.UUID, response: str) -> Offer:
    o = _get(db, Offer, oid, "Offer")
    if o.status != "sent":
        raise Conflict(f"Offer is {o.status}")
    if response == "accepted" and o.expires_on < date.today():
        o.status = "expired"
        raise Conflict("This offer has expired")
    o.status, o.responded_at = response, datetime.now(timezone.utc)
    a = db.get(Application, o.application_id)
    if response == "accepted":
        for row in DEFAULT_TASKS:
            category, title, required = row if len(row) == 3 else (*row, True)
            db.add(OnboardingTask(tenant_id=tenant_of(db), application_id=a.id, category=category, title=title,
                                  required_for_activation=required, due_on=o.joining_date, created_by=actor_of(db)))
    else:
        a.stage = "rejected" if response == "declined" else a.stage
        a.rejection_reason = "Offer declined" if response == "declined" else a.rejection_reason
    audit(db, "offer", o.id, response)
    return o


# ── onboarding & activation ────────────────────────────────────────────────


def onboarding(db: Session, app_id: uuid.UUID):
    return db.scalars(select(OnboardingTask).where(OnboardingTask.application_id == app_id)
                      .order_by(OnboardingTask.created_at)).all()


def add_task(db: Session, app_id: uuid.UUID, data: dict) -> OnboardingTask:
    _get(db, Application, app_id, "Application")
    return _new(db, OnboardingTask, application_id=app_id, **data)


def update_task(db: Session, task_id: uuid.UUID, status: str, notes: str | None) -> OnboardingTask:
    t = _get(db, OnboardingTask, task_id, "Task")
    if status == "waived" and not notes:
        raise AppError("Say why the task is being waived")
    t.status, t.notes = status, notes or t.notes
    t.completed_by, t.completed_at = actor_of(db), datetime.now(timezone.utc)
    audit(db, "onboarding_task", t.id, status, {"notes": notes})
    return t


def _temp_password() -> str:
    alphabet = string.ascii_letters + string.digits
    core = "".join(secrets.choice(alphabet) for _ in range(10))
    return f"{core}!{secrets.randbelow(90) + 10}"


def activate(db: Session, app_id: uuid.UUID, data: dict, ctx: hms.CallerContext | None) -> dict:
    a = _get(db, Application, app_id, "Application")
    if a.stage == "hired":
        raise Conflict("This candidate is already an employee", {"employee_id": str(a.employee_id)})
    offer = db.scalar(select(Offer).where(Offer.application_id == a.id, Offer.status == "accepted"))
    if offer is None:
        raise Conflict("The candidate has not accepted an offer")
    blocking = [t.title for t in onboarding(db, a.id) if t.required_for_activation and t.status not in ("done", "waived")]
    if blocking:
        raise Conflict("Onboarding steps still open", {"pending": blocking})
    cand = db.get(Candidate, a.candidate_id)
    vacancy = db.get(Vacancy, a.vacancy_id)
    req = db.get(JobRequisition, vacancy.requisition_id)
    des = db.get(Designation, req.designation_id)
    emp = employee_svc.create_employee(db, {
        "first_name": cand.first_name, "last_name": cand.last_name, "email": cand.email, "phone": cand.phone,
        "employee_category": des.job_category, "employment_type": req.employment_type,
        "joining_date": offer.joining_date, "contract_end_date": data.get("contract_end_date"),
        "branch_id": req.branch_id, "designation_id": des.id, "reporting_manager_id": data.get("reporting_manager_id"),
        "departments": [{"department_id": req.department_id, "is_primary": True}],
        "credentials": data.get("credentials") or [], "contacts": [], "profile": {"qualification": cand.qualification},
        # Active from the joining date in one step (the employment record starts
        # then), so a future joiner is never activated before their own record.
        "activate": True,
    })
    a.stage, a.employee_id = "hired", emp.id
    for t in onboarding(db, a.id):
        t.employee_id = emp.id
    filled = db.scalar(select(func.count()).select_from(Application).join(Vacancy, Vacancy.id == Application.vacancy_id)
                       .where(Vacancy.requisition_id == req.id, Application.stage == "hired"))
    if filled >= req.positions:
        req.status = "filled"
        vacancy.status = "closed"
    outcome: dict = {"employee_id": emp.id, "employee_code": emp.employee_code, "steps": {}}

    if data.get("structure_id"):
        payroll.set_compensation(db, emp.id, {"structure_id": data["structure_id"], "monthly_gross": offer.offered_gross,
                                              "effective_from": offer.joining_date, "reason": f"Offer {offer.id}"})
        outcome["steps"]["compensation"] = "set from offer"

    if data.get("hms_username"):
        password = _temp_password()
        result = hms.call(ctx, "POST", "/api/employees", {
            "username": data["hms_username"], "password": password, "full_name": employee_svc.full_name(emp),
            "email": emp.email, "phone": emp.phone, "job_role": des.title, "user_type": "normal",
            "module_access": data.get("module_access") or [],
        })
        if result.ok and (result.data or {}).get("success", True):
            emp.hms_username = data["hms_username"]
            emp.hms_employee_id = (result.data or {}).get("employee_id")
            outcome["steps"]["hms_account"] = "created"
            # Shown once to the HR user to hand over; never stored or logged.
            outcome["temporary_password"] = password
            _done(db, a.id, "it_access")
        else:
            outcome["steps"]["hms_account"] = f"not created: {(result.data or {}).get('message') or result.error}"

    if data.get("biometric_pin"):
        integration = db.scalar(select(AttendanceIntegration).where(AttendanceIntegration.deleted_at.is_(None))
                                .order_by(AttendanceIntegration.created_at))
        if integration is None:
            outcome["steps"]["biometric"] = "no attendance integration configured"
        else:
            attendance.create_mapping(db, {"integration_id": integration.id, "employee_id": emp.id,
                                           "device_user_id": data["biometric_pin"],
                                           "effective_from": offer.joining_date})
            outcome["steps"]["biometric"] = f"PIN {data['biometric_pin']} mapped; enrol the fingerprint on the device"

    if data.get("shift_template_id"):
        t = _get(db, ShiftTemplate, data["shift_template_id"], "Shift")
        for d in range(7):
            day = offer.joining_date + timedelta(days=d)
            if not db.scalar(select(ShiftAssignment.id).where(ShiftAssignment.employee_id == emp.id,
                                                              ShiftAssignment.work_date == day)):
                db.add(ShiftAssignment(tenant_id=tenant_of(db), employee_id=emp.id, work_date=day,
                                       shift_template_id=t.id, department_id=req.department_id, status="published",
                                       notes="Initial roster from onboarding", created_by=actor_of(db)))
        outcome["steps"]["initial_shifts"] = f"7 days of {t.name} from {offer.joining_date}"
        emit(db, "workforce.shift.assigned", emp.id, {"employee_id": emp.id, "from": offer.joining_date})

    emit(db, "notification.requested", emp.id, {
        "audience": "employee", "employee_id": emp.id, "template": "welcome",
        "message": f"Welcome to the hospital. Your employee code is {emp.employee_code}; you join on {offer.joining_date}.",
    })
    audit(db, "application", a.id, "activated", {k: v for k, v in outcome["steps"].items()})
    db.flush()
    return outcome


def _done(db: Session, app_id: uuid.UUID, category: str) -> None:
    for t in onboarding(db, app_id):
        if t.category == category and t.status == "pending":
            t.status, t.completed_by, t.completed_at = "done", "system", datetime.now(timezone.utc)
