"""Phase 4 routes: recruitment & onboarding, documents, training, performance,
compliance, grievances & discipline."""

import uuid
from datetime import date, datetime
from decimal import Decimal
from typing import Literal

from fastapi import APIRouter, Depends, File, Form, Request, UploadFile
from fastapi.responses import Response
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy.orm import Session

from app.errors import AppError, Forbidden
from app.models.employee import EMPLOYEE_CATEGORIES
from app.models.talent import Candidate
from app.schemas.employee import CredentialIn
from app.security import (
    DOCUMENTS_WRITE, EMPLOYEES_WRITE, GRIEVANCES_MANAGE, PERFORMANCE_WRITE, RECRUITMENT_WRITE, TRAINING_WRITE,
    Principal, current_principal, get_db, require, require_hr_read,
)
from app.services import documents, hms, recruitment, talent
from app.services.employees import employee_for_user

rec = APIRouter(prefix="/api/v1/recruitment", tags=["recruitment"])
onb = APIRouter(prefix="/api/v1/onboarding", tags=["onboarding"])
docs = APIRouter(prefix="/api/v1/hr/documents", tags=["documents"])
trn = APIRouter(prefix="/api/v1/training", tags=["training"])
perf = APIRouter(prefix="/api/v1/performance", tags=["performance"])
comp = APIRouter(prefix="/api/v1/compliance", tags=["compliance"])
grv = APIRouter(prefix="/api/v1/hr/grievances", tags=["grievances"])
Recruiter = Depends(require(RECRUITMENT_WRITE))


def cols(obj, *names):
    return {n: getattr(obj, n) for n in names}


# ── recruitment ────────────────────────────────────────────────────────────


class RequisitionIn(BaseModel):
    department_id: uuid.UUID
    designation_id: uuid.UUID
    branch_id: uuid.UUID | None = None
    positions: int = Field(1, ge=1, le=100)
    employment_type: Literal["permanent", "contract", "probation", "visiting", "intern", "part_time"] = "permanent"
    justification: str = Field(min_length=10, max_length=3000)
    replacing_employee_id: uuid.UUID | None = None


class VacancyIn(BaseModel):
    requisition_id: uuid.UUID
    title: str = Field(min_length=3, max_length=200)
    description: str = Field(min_length=10, max_length=10000)
    requirements: str | None = Field(None, max_length=5000)
    openings: int = Field(1, ge=1, le=100)
    closes_on: date | None = None


class CandidateIn(BaseModel):
    first_name: str = Field(min_length=1, max_length=80)
    last_name: str | None = Field(None, max_length=80)
    email: EmailStr | None = None
    phone: str | None = Field(None, pattern=r"^[0-9+()\- ]{6,30}$")
    source: str | None = Field(None, max_length=60)
    current_employer: str | None = Field(None, max_length=200)
    experience_years: Decimal | None = Field(None, ge=0, le=60)
    qualification: str | None = Field(None, max_length=200)
    notes: str | None = Field(None, max_length=3000)


class ApplyIn(BaseModel):
    vacancy_id: uuid.UUID
    candidate_id: uuid.UUID


class StageIn(BaseModel):
    stage: Literal["screening", "interview", "selected", "rejected", "withdrawn"]
    reason: str | None = Field(None, max_length=1000)


class InterviewIn(BaseModel):
    application_id: uuid.UUID
    round_name: str = Field(min_length=1, max_length=80)
    scheduled_at: datetime
    mode: Literal["in_person", "video", "phone"] = "in_person"
    interviewers: list[str] = Field(default_factory=list, max_length=10)


class FeedbackIn(BaseModel):
    rating: int = Field(ge=1, le=5)
    recommendation: Literal["hire", "hold", "reject"]
    feedback: str = Field(min_length=3, max_length=5000)


class OfferIn(BaseModel):
    application_id: uuid.UUID
    offered_gross: Decimal = Field(gt=0, le=10_000_000)
    joining_date: date
    expires_on: date
    terms: str | None = Field(None, max_length=5000)


class OfferResponseIn(BaseModel):
    response: Literal["accepted", "declined", "withdrawn"]


class TaskIn(BaseModel):
    category: Literal["background_verification", "document_verification", "medical_fitness", "it_access",
                      "biometric", "uniform", "induction", "other"]
    title: str = Field(min_length=3, max_length=200)
    required_for_activation: bool = True
    due_on: date | None = None


class TaskUpdate(BaseModel):
    status: Literal["pending", "done", "failed", "waived"]
    notes: str | None = Field(None, max_length=2000)


class ActivateIn(BaseModel):
    hms_username: str | None = Field(None, min_length=3, max_length=60, pattern=r"^[A-Za-z0-9._-]+$")
    module_access: list[str] = Field(default_factory=list, max_length=40)
    biometric_pin: str | None = Field(None, pattern=r"^[A-Za-z0-9_-]{1,40}$")
    shift_template_id: uuid.UUID | None = None
    structure_id: uuid.UUID | None = None
    reporting_manager_id: uuid.UUID | None = None
    contract_end_date: date | None = None
    credentials: list[CredentialIn] = Field(default_factory=list, max_length=10)


@rec.get("/requisitions")
def requisitions(status: str | None = None, _: Principal = Depends(require_hr_read), db: Session = Depends(get_db)):
    return [cols(r, "id", "code", "department_id", "designation_id", "branch_id", "positions", "employment_type",
                 "justification", "status", "approval_instance_id", "created_by", "created_at")
            for r in recruitment.list_requisitions(db, status)]


@rec.post("/requisitions", status_code=201)
def create_requisition(body: RequisitionIn, principal: Principal = Depends(require_hr_read),
                       db: Session = Depends(get_db)):
    """Any HR reader (department heads included) may raise one; approval decides."""
    r = recruitment.create_requisition(db, body.model_dump(), principal.username)
    return cols(r, "id", "code", "status", "approval_instance_id")


@rec.get("/vacancies")
def vacancies(status: str | None = None, _: Principal = Depends(require_hr_read), db: Session = Depends(get_db)):
    return recruitment.list_vacancies(db, status)


@rec.post("/vacancies", status_code=201)
def create_vacancy(body: VacancyIn, _: Principal = Recruiter, db: Session = Depends(get_db)):
    return cols(recruitment.create_vacancy(db, body.model_dump()), "id", "title", "status")


@rec.post("/vacancies/{vacancy_id}/{status}")
def vacancy_status(vacancy_id: uuid.UUID, status: Literal["open", "on_hold", "closed"], _: Principal = Recruiter,
                   db: Session = Depends(get_db)):
    return cols(recruitment.set_vacancy_status(db, vacancy_id, status), "id", "status")


@rec.post("/candidates", status_code=201)
def create_candidate(body: CandidateIn, _: Principal = Recruiter, db: Session = Depends(get_db)):
    return cols(recruitment.create_candidate(db, body.model_dump()), "id", "first_name", "last_name", "email")


@rec.post("/applications", status_code=201)
def create_application(body: ApplyIn, _: Principal = Recruiter, db: Session = Depends(get_db)):
    return cols(recruitment.apply(db, body.vacancy_id, body.candidate_id), "id", "stage")


@rec.get("/applications")
def applications(vacancy_id: uuid.UUID | None = None, _: Principal = Recruiter, db: Session = Depends(get_db)):
    return recruitment.pipeline(db, vacancy_id)


@rec.post("/applications/{app_id}/stage")
def move_stage(app_id: uuid.UUID, body: StageIn, _: Principal = Recruiter, db: Session = Depends(get_db)):
    return cols(recruitment.move(db, app_id, body.stage, body.reason), "id", "stage")


@rec.post("/interviews", status_code=201)
def schedule(body: InterviewIn, _: Principal = Recruiter, db: Session = Depends(get_db)):
    return cols(recruitment.schedule_interview(db, body.model_dump()), "id", "scheduled_at", "status")


@rec.post("/interviews/{interview_id}/feedback")
def feedback(interview_id: uuid.UUID, body: FeedbackIn, principal: Principal = Depends(current_principal),
             db: Session = Depends(get_db)):
    i = recruitment.record_feedback(db, interview_id, body.model_dump(), principal.username,
                                    principal.can(RECRUITMENT_WRITE))
    return cols(i, "id", "status", "rating", "recommendation")


@rec.post("/offers", status_code=201)
def offer(body: OfferIn, _: Principal = Recruiter, db: Session = Depends(get_db)):
    return cols(recruitment.create_offer(db, body.model_dump()), "id", "status")


@rec.post("/offers/{offer_id}/respond")
def respond(offer_id: uuid.UUID, body: OfferResponseIn, _: Principal = Recruiter, db: Session = Depends(get_db)):
    return cols(recruitment.respond_offer(db, offer_id, body.response), "id", "status")


@onb.get("/{app_id}/tasks")
def tasks(app_id: uuid.UUID, _: Principal = Recruiter, db: Session = Depends(get_db)):
    return [cols(t, "id", "category", "title", "required_for_activation", "status", "due_on", "completed_by",
                 "completed_at", "notes") for t in recruitment.onboarding(db, app_id)]


@onb.post("/{app_id}/tasks", status_code=201)
def add_task(app_id: uuid.UUID, body: TaskIn, _: Principal = Recruiter, db: Session = Depends(get_db)):
    return cols(recruitment.add_task(db, app_id, body.model_dump()), "id", "status")


@onb.patch("/tasks/{task_id}")
def update_task(task_id: uuid.UUID, body: TaskUpdate, _: Principal = Recruiter, db: Session = Depends(get_db)):
    return cols(recruitment.update_task(db, task_id, body.status, body.notes), "id", "status")


@onb.post("/{app_id}/activate")
def activate(app_id: uuid.UUID, body: ActivateIn, request: Request, principal: Principal = Recruiter,
             db: Session = Depends(get_db)):
    if not principal.can(EMPLOYEES_WRITE):
        raise Forbidden("Activating a hire creates an employee record; that needs employee management rights")
    data = body.model_dump()
    data["credentials"] = [c.model_dump() for c in body.credentials]
    return recruitment.activate(db, app_id, data, hms.CallerContext.from_request(request))


# ── documents ──────────────────────────────────────────────────────────────


@docs.post("", status_code=201)
async def upload(file: UploadFile = File(...), category: str = Form(...), title: str = Form(..., max_length=200),
                 employee_id: uuid.UUID | None = Form(None), candidate_id: uuid.UUID | None = Form(None),
                 issue_date: date | None = Form(None), expiry_date: date | None = Form(None),
                 access_level: Literal["hr_only", "employee", "confidential"] = Form("employee"),
                 replaces: uuid.UUID | None = Form(None), principal: Principal = Depends(current_principal),
                 db: Session = Depends(get_db)):
    me = employee_for_user(db, principal.username)
    own = me is not None and employee_id == me.id
    if candidate_id and not principal.can(RECRUITMENT_WRITE):
        raise Forbidden("Candidate documents need recruitment rights")
    if employee_id and not (principal.can(DOCUMENTS_WRITE) or own):
        raise Forbidden("You can upload documents only to your own record")
    if access_level == "confidential" and not principal.can(GRIEVANCES_MANAGE):
        raise Forbidden("Confidential documents are for grievance case files")
    if own and not principal.can(DOCUMENTS_WRITE):
        access_level = "employee"
    data = await file.read(documents.MAX_BYTES + 1)
    doc = documents.upload(db, data=data, filename=file.filename or "document", category=category, title=title,
                           employee_id=employee_id, candidate_id=candidate_id, issue_date=issue_date,
                           expiry_date=expiry_date, access_level=access_level, replaces=replaces)
    if candidate_id and category == "resume":
        db.get(Candidate, candidate_id).resume_document_id = doc.id
    return documents.doc_out(doc)


@docs.get("")
def list_docs(employee_id: uuid.UUID | None = None, candidate_id: uuid.UUID | None = None, history: bool = False,
              principal: Principal = Depends(current_principal), db: Session = Depends(get_db)):
    if not (employee_id or candidate_id):
        raise AppError("Give employee_id or candidate_id")
    return [documents.doc_out(d) for d in documents.list_for(db, principal, employee_id, candidate_id, history)]


@docs.get("/{doc_id}/download")
def download(doc_id: uuid.UUID, principal: Principal = Depends(current_principal), db: Session = Depends(get_db)):
    doc = documents.get(db, doc_id, principal)
    data = documents.read_bytes(db, doc)
    return Response(data, media_type=doc.content_type, headers={
        "Content-Disposition": f'attachment; filename="{doc.filename}"', "Cache-Control": "private, no-store"})


@docs.post("/{doc_id}/{verdict}")
def verify_doc(doc_id: uuid.UUID, verdict: Literal["verified", "rejected"],
               principal: Principal = Depends(current_principal), db: Session = Depends(get_db)):
    return documents.doc_out(documents.verify(db, doc_id, verdict, principal))


@docs.delete("/{doc_id}", status_code=204)
def archive_doc(doc_id: uuid.UUID, principal: Principal = Depends(current_principal), db: Session = Depends(get_db)):
    documents.archive(db, doc_id, principal)
    return Response(status_code=204)


# ── training ───────────────────────────────────────────────────────────────


class ProgramIn(BaseModel):
    code: str = Field(min_length=1, max_length=20, pattern=r"^[A-Za-z0-9_-]+$")
    title: str = Field(min_length=3, max_length=200)
    category: Literal["bls", "acls", "fire_safety", "infection_control", "clinical", "department", "other"]
    description: str | None = Field(None, max_length=5000)
    validity_months: int | None = Field(None, ge=1, le=120)
    mandatory_for: list[str] = Field(default_factory=list)
    department_id: uuid.UUID | None = None
    pass_score: int | None = Field(None, ge=0, le=100)


class SessionIn(BaseModel):
    program_id: uuid.UUID
    starts_at: datetime
    ends_at: datetime
    location: str | None = Field(None, max_length=200)
    trainer: str | None = Field(None, max_length=200)
    capacity: int | None = Field(None, ge=1, le=1000)


class EnrollIn(BaseModel):
    employee_ids: list[uuid.UUID] = Field(min_length=1, max_length=500)


class ResultIn(BaseModel):
    status: Literal["attended", "no_show", "passed", "failed", "cancelled"]
    score: int | None = Field(None, ge=0, le=100)
    remarks: str | None = Field(None, max_length=1000)
    certificate_number: str | None = Field(None, max_length=80)


class CertificationIn(BaseModel):
    employee_id: uuid.UUID
    program_id: uuid.UUID
    certificate_number: str | None = Field(None, max_length=80)
    issued_on: date
    expires_on: date | None = None
    document_id: uuid.UUID | None = None


@trn.get("/programs")
def programs(_: Principal = Depends(current_principal), db: Session = Depends(get_db)):
    return [cols(p, "id", "code", "title", "category", "description", "validity_months", "mandatory_for",
                 "department_id", "pass_score") for p in talent.list_programs(db)]


@trn.post("/programs", status_code=201)
def create_program(body: ProgramIn, _: Principal = Depends(require(TRAINING_WRITE)), db: Session = Depends(get_db)):
    bad = [c for c in body.mandatory_for if c != "all" and c not in EMPLOYEE_CATEGORIES]
    if bad:
        raise AppError("Unknown employee categories", {"categories": bad})
    return cols(talent.create_program(db, body.model_dump()), "id", "code", "title")


@trn.get("/sessions")
def sessions(program_id: uuid.UUID | None = None, upcoming: bool = False, _: Principal = Depends(current_principal),
             db: Session = Depends(get_db)):
    return talent.list_sessions(db, program_id, upcoming)


@trn.post("/sessions", status_code=201)
def create_session(body: SessionIn, _: Principal = Depends(require(TRAINING_WRITE)), db: Session = Depends(get_db)):
    return cols(talent.create_session(db, body.model_dump()), "id", "status")


@trn.get("/sessions/{session_id}/enrollments")
def session_enrollments(session_id: uuid.UUID, _: Principal = Depends(require_hr_read), db: Session = Depends(get_db)):
    return talent.enrollments(db, session_id)


@trn.post("/sessions/{session_id}/enroll")
def enroll(session_id: uuid.UUID, body: EnrollIn, _: Principal = Depends(require(TRAINING_WRITE)),
           db: Session = Depends(get_db)):
    return {"enrolled": talent.enroll(db, session_id, body.employee_ids)}


@trn.post("/enrollments/{enrollment_id}/result")
def result(enrollment_id: uuid.UUID, body: ResultIn, _: Principal = Depends(require(TRAINING_WRITE)),
           db: Session = Depends(get_db)):
    e = talent.record_result(db, enrollment_id, body.status, body.score, body.remarks, body.certificate_number)
    return cols(e, "id", "status", "score")


@trn.get("/certifications")
def certifications(employee_id: uuid.UUID | None = None, expiring_within: int | None = None,
                   principal: Principal = Depends(current_principal), db: Session = Depends(get_db)):
    if not principal.can_read_hr():
        me = employee_for_user(db, principal.username)
        if me is None:
            raise Forbidden("Your login is not linked to an employee record")
        employee_id = me.id
    return talent.certifications(db, employee_id, expiring_within)


@trn.post("/certifications", status_code=201)
def add_certification(body: CertificationIn, _: Principal = Depends(require(TRAINING_WRITE)),
                      db: Session = Depends(get_db)):
    return cols(talent.add_certification(db, body.model_dump()), "id", "expires_on")


@trn.get("/matrix")
def matrix(department_id: uuid.UUID | None = None, _: Principal = Depends(require_hr_read),
           db: Session = Depends(get_db)):
    return talent.training_matrix(db, department_id)


# ── performance ────────────────────────────────────────────────────────────


class Criterion(BaseModel):
    code: str = Field(min_length=1, max_length=40)
    label: str = Field(min_length=1, max_length=120)
    weight: int = Field(ge=1, le=100)


class CycleIn(BaseModel):
    name: str = Field(min_length=3, max_length=120)
    period_start: date
    period_end: date
    criteria: dict[str, list[Criterion]]
    rating_scale: int = Field(5, ge=3, le=10)


class GoalIn(BaseModel):
    cycle_id: uuid.UUID
    employee_id: uuid.UUID | None = None
    department_id: uuid.UUID | None = None
    title: str = Field(min_length=3, max_length=300)
    metric: str | None = Field(None, max_length=200)
    target: str | None = Field(None, max_length=120)
    weight: int = Field(0, ge=0, le=100)


class GoalUpdate(BaseModel):
    progress: int = Field(ge=0, le=100)
    status: Literal["open", "achieved", "missed", "dropped"] | None = None


class ReviewStepIn(BaseModel):
    scores: dict[str, int] = Field(default_factory=dict)
    comments: str | None = Field(None, max_length=5000)
    final_rating: Decimal | None = Field(None, ge=0, le=10)


@perf.get("/cycles")
def cycles(_: Principal = Depends(current_principal), db: Session = Depends(get_db)):
    return [cols(c, "id", "name", "period_start", "period_end", "status", "criteria", "rating_scale")
            for c in talent.list_cycles(db)]


@perf.post("/cycles", status_code=201)
def create_cycle(body: CycleIn, _: Principal = Depends(require(PERFORMANCE_WRITE)), db: Session = Depends(get_db)):
    data = body.model_dump()
    return cols(talent.create_cycle(db, data), "id", "name", "status")


@perf.post("/cycles/{cycle_id}/launch")
def launch(cycle_id: uuid.UUID, department_id: uuid.UUID | None = None,
           _: Principal = Depends(require(PERFORMANCE_WRITE)), db: Session = Depends(get_db)):
    return {"reviews_created": talent.launch_cycle(db, cycle_id, department_id)}


@perf.get("/reviews")
def reviews(cycle_id: uuid.UUID | None = None, mine: bool = False, principal: Principal = Depends(current_principal),
            db: Session = Depends(get_db)):
    return talent.list_reviews(db, principal, cycle_id, mine)


@perf.post("/reviews/{review_id}/submit")
def review_step(review_id: uuid.UUID, body: ReviewStepIn, principal: Principal = Depends(current_principal),
                db: Session = Depends(get_db)):
    return talent.submit_review_step(db, review_id, principal, body.model_dump())


@perf.get("/goals")
def goals(cycle_id: uuid.UUID, department_id: uuid.UUID | None = None, _: Principal = Depends(current_principal),
          db: Session = Depends(get_db)):
    return [cols(g, "id", "cycle_id", "employee_id", "department_id", "title", "metric", "target", "weight",
                 "progress", "status") for g in talent.list_goals(db, cycle_id, department_id)]


@perf.post("/goals", status_code=201)
def create_goal(body: GoalIn, _: Principal = Depends(require(PERFORMANCE_WRITE)), db: Session = Depends(get_db)):
    return cols(talent.create_goal(db, body.model_dump()), "id", "title")


@perf.patch("/goals/{goal_id}")
def update_goal(goal_id: uuid.UUID, body: GoalUpdate, _: Principal = Depends(require(PERFORMANCE_WRITE)),
                db: Session = Depends(get_db)):
    return cols(talent.update_goal(db, goal_id, body.progress, body.status), "id", "progress", "status")


# ── compliance ─────────────────────────────────────────────────────────────


class VerificationIn(BaseModel):
    verdict: Literal["verified", "rejected"]
    method: Literal["council_portal", "original_seen", "issuer_letter", "other"]
    reference: str | None = Field(None, max_length=200)
    notes: str | None = Field(None, max_length=1000)


@comp.post("/scan")
def scan(_: Principal = Depends(require(EMPLOYEES_WRITE)), db: Session = Depends(get_db)):
    return talent.compliance_scan(db)


@comp.get("/records")
def records(status: Literal["compliant", "expiring", "non_compliant"] | None = None,
            _: Principal = Depends(require_hr_read), db: Session = Depends(get_db)):
    return talent.compliance_summary(db, status)


@comp.get("/alerts")
def alerts(status: Literal["open", "acknowledged", "resolved"] = "open", _: Principal = Depends(require_hr_read),
           db: Session = Depends(get_db)):
    return talent.alerts(db, status)


@comp.post("/alerts/{alert_id}/acknowledge", status_code=204)
def ack(alert_id: uuid.UUID, _: Principal = Depends(require(EMPLOYEES_WRITE)), db: Session = Depends(get_db)):
    talent.acknowledge_alert(db, alert_id)
    return Response(status_code=204)


@comp.post("/credentials/{credential_id}/verify")
def verify_credential(credential_id: uuid.UUID, body: VerificationIn,
                      _: Principal = Depends(require(EMPLOYEES_WRITE)), db: Session = Depends(get_db)):
    return cols(talent.verify_credential(db, credential_id, body.model_dump()), "id", "verdict", "method")


# ── grievances ────────────────────────────────────────────────────────────


class GrievanceIn(BaseModel):
    category: Literal["harassment", "workload", "safety", "pay", "discrimination", "conduct", "other"]
    severity: Literal["low", "medium", "high"] = "medium"
    subject: str = Field(min_length=5, max_length=300)
    description: str = Field(min_length=20, max_length=10000)
    against_employee_id: uuid.UUID | None = None
    anonymous: bool = False


class AssignIn(BaseModel):
    assignee: str = Field(min_length=1, max_length=120)


class CommentIn(BaseModel):
    body: str = Field(min_length=1, max_length=5000)
    internal: bool = True


class InvestigationIn(BaseModel):
    kind: Literal["interview", "finding", "evidence", "note"]
    summary: str = Field(min_length=3, max_length=10000)
    document_id: uuid.UUID | None = None


class ActionIn(BaseModel):
    employee_id: uuid.UUID
    case_id: uuid.UUID | None = None
    action_type: Literal["verbal_warning", "written_warning", "memo", "suspension", "termination"]
    details: str = Field(min_length=10, max_length=5000)
    effective_from: date
    effective_to: date | None = None


class ResolutionIn(BaseModel):
    resolution: str = Field(min_length=10, max_length=5000)


@grv.post("", status_code=201)
def submit(body: GrievanceIn, principal: Principal = Depends(current_principal), db: Session = Depends(get_db)):
    case = talent.submit_grievance(db, body.model_dump(), principal)
    return {"id": case.id, "case_number": case.case_number, "status": case.status}


@grv.get("")
def cases(status: str | None = None, principal: Principal = Depends(current_principal), db: Session = Depends(get_db)):
    return talent.list_cases(db, principal, status)


@grv.get("/actions")
def actions(employee_id: uuid.UUID | None = None, _: Principal = Depends(require(GRIEVANCES_MANAGE)),
            db: Session = Depends(get_db)):
    return [cols(a, "id", "employee_id", "case_id", "action_type", "details", "effective_from", "effective_to",
                 "status", "created_by", "created_at") for a in talent.list_actions(db, employee_id)]


@grv.post("/actions", status_code=201)
def issue_action(body: ActionIn, principal: Principal = Depends(current_principal), db: Session = Depends(get_db)):
    return cols(talent.issue_action(db, body.model_dump(), principal), "id", "action_type", "status")


@grv.get("/{case_id}")
def case(case_id: uuid.UUID, principal: Principal = Depends(current_principal), db: Session = Depends(get_db)):
    return talent.get_case(db, case_id, principal)


@grv.post("/{case_id}/assign")
def assign(case_id: uuid.UUID, body: AssignIn, principal: Principal = Depends(current_principal),
           db: Session = Depends(get_db)):
    c = talent.assign_case(db, case_id, principal, body.assignee)
    return {"id": c.id, "status": c.status, "assigned_to": c.assigned_to}


@grv.post("/{case_id}/comments", status_code=204)
def comment(case_id: uuid.UUID, body: CommentIn, principal: Principal = Depends(current_principal),
            db: Session = Depends(get_db)):
    talent.comment_case(db, case_id, principal, body.body, body.internal)
    return Response(status_code=204)


@grv.post("/{case_id}/investigation", status_code=201)
def investigation(case_id: uuid.UUID, body: InvestigationIn, principal: Principal = Depends(current_principal),
                  db: Session = Depends(get_db)):
    return {"id": talent.add_investigation(db, case_id, principal, body.model_dump()).id}


@grv.post("/{case_id}/resolve")
def resolve(case_id: uuid.UUID, body: ResolutionIn, principal: Principal = Depends(current_principal),
            db: Session = Depends(get_db)):
    c = talent.propose_resolution(db, case_id, principal, body.resolution)
    return {"id": c.id, "status": c.status, "approval_instance_id": c.approval_instance_id}
