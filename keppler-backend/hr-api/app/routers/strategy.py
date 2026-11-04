"""Phase 7 routes: HR strategy & governance, workforce planning, HR/admin
budgets, engagement, workforce analytics, the HR audit log and the
department head's team view."""

import uuid
from datetime import date
from decimal import Decimal
from typing import Literal

from fastapi import APIRouter, Depends
from fastapi.responses import Response
from pydantic import BaseModel, Field, model_validator
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.errors import Forbidden
from app.models import AuditLog
from app.security import (
    AUDIT_READ, ENGAGEMENT_WRITE, FACILITY_READ, FACILITY_REPORTS_READ, FACILITY_VENDORS_WRITE, GOVERNANCE_WRITE,
    PAYROLL_WRITE, PLANNING_WRITE, REPORTS_READ, Principal, current_principal, get_db, require, require_any,
    require_hr_read,
)
from app.services import selfservice, strategy, team
from app.services.employees import employee_for_user

hr = APIRouter(prefix="/api/v1/hr", tags=["strategy"])
tm = APIRouter(prefix="/api/v1/team", tags=["team"])
mine = APIRouter(prefix="/api/v1/me", tags=["self-service"])

Pillar = Literal["talent", "retention", "capability", "compliance", "culture", "cost"]


class Audience(BaseModel):
    all: bool = True
    departments: list[str] = []
    categories: list[str] = []


# ── objectives ─────────────────────────────────────────────────────────────


class ObjectiveIn(BaseModel):
    title: str = Field(min_length=3, max_length=300)
    pillar: Pillar
    owner_employee_id: uuid.UUID | None = None
    metric: str = Field(min_length=2, max_length=200)
    baseline: Decimal | None = None
    target: Decimal
    current: Decimal | None = None
    unit: str | None = Field(None, max_length=20)
    higher_is_better: bool = True
    due_date: date


class ObjectivePatch(BaseModel):
    current: Decimal | None = None
    target: Decimal | None = None
    status: Literal["active", "achieved", "dropped"] | None = None
    owner_employee_id: uuid.UUID | None = None
    due_date: date | None = None


@hr.get("/objectives")
def objectives(_: Principal = Depends(require_hr_read), db: Session = Depends(get_db)):
    return strategy.list_objectives(db)


@hr.post("/objectives", status_code=201)
def create_objective(body: ObjectiveIn, _: Principal = Depends(require(GOVERNANCE_WRITE)), db: Session = Depends(get_db)):
    return strategy.objective_out(db, strategy.create_objective(db, body.model_dump()))


@hr.patch("/objectives/{objective_id}")
def update_objective(objective_id: uuid.UUID, body: ObjectivePatch, _: Principal = Depends(require(GOVERNANCE_WRITE)),
                     db: Session = Depends(get_db)):
    return strategy.objective_out(db, strategy.update_objective(db, objective_id, body.model_dump(exclude_unset=True)))


# ── policies ───────────────────────────────────────────────────────────────


class PolicyIn(BaseModel):
    code: str = Field(min_length=2, max_length=30, pattern=r"^[A-Z0-9-]+$")
    title: str = Field(min_length=3, max_length=200)
    category: Literal["conduct", "leave", "attendance", "safety", "pay", "clinical", "it", "other"]
    summary: str = Field(min_length=10, max_length=5000)
    document_id: uuid.UUID | None = None
    effective_from: date
    review_due: date | None = None
    requires_acknowledgement: bool = True
    audience: Audience = Audience()


@hr.get("/policies")
def policies(status: Literal["draft", "published", "retired"] | None = None, _: Principal = Depends(require_hr_read),
             db: Session = Depends(get_db)):
    return strategy.list_policies(db, status)


@hr.post("/policies", status_code=201)
def create_policy(body: PolicyIn, _: Principal = Depends(require(GOVERNANCE_WRITE)), db: Session = Depends(get_db)):
    return strategy.policy_out(db, strategy.create_policy(db, body.model_dump()))


@hr.post("/policies/{policy_id}/publish")
def publish_policy(policy_id: uuid.UUID, _: Principal = Depends(require(GOVERNANCE_WRITE)), db: Session = Depends(get_db)):
    return strategy.policy_out(db, strategy.publish_policy(db, policy_id))


@mine.get("/policies")
def my_policies(principal: Principal = Depends(current_principal), db: Session = Depends(get_db)):
    return strategy.policies_for(db, selfservice.me(db, principal))


@mine.post("/policies/{policy_id}/acknowledge", status_code=204)
def acknowledge(policy_id: uuid.UUID, principal: Principal = Depends(current_principal), db: Session = Depends(get_db)):
    strategy.acknowledge(db, policy_id, selfservice.me(db, principal))
    return Response(status_code=204)


# ── workforce planning ─────────────────────────────────────────────────────


class PlanIn(BaseModel):
    fiscal_year: int = Field(ge=2000, le=2100)
    department_id: uuid.UUID
    designation_id: uuid.UUID
    sanctioned: int = Field(ge=0, le=10000)
    monthly_cost_per_position: Decimal | None = Field(None, ge=0)
    justification: str | None = Field(None, max_length=2000)


@hr.get("/planning")
def plan(fiscal_year: int | None = None, _: Principal = Depends(require_hr_read), db: Session = Depends(get_db)):
    return strategy.workforce_plan(db, fiscal_year or strategy.fiscal_year(date.today()))


@hr.put("/planning")
def save_plan(body: PlanIn, _: Principal = Depends(require(PLANNING_WRITE)), db: Session = Depends(get_db)):
    row = strategy.upsert_plan(db, body.model_dump())
    return {"id": row.id, "sanctioned": row.sanctioned}


# ── budgets & cost ─────────────────────────────────────────────────────────

Domain = Literal["hr", "admin"]
_READ = {"hr": (PLANNING_WRITE, PAYROLL_WRITE, REPORTS_READ), "admin": (FACILITY_READ, FACILITY_REPORTS_READ)}
_WRITE = {"hr": PLANNING_WRITE, "admin": FACILITY_VENDORS_WRITE}


def _gate(principal: Principal, domain: str, write: bool) -> None:
    perms = (_WRITE[domain],) if write else _READ[domain]
    if not any(principal.can(p) for p in perms):
        raise Forbidden("You do not have access to this budget", {"required_any": list(perms)})


class BudgetIn(BaseModel):
    domain: Domain
    fiscal_year: int = Field(ge=2000, le=2100)
    department_id: uuid.UUID | None = None
    category: str = Field(max_length=30)
    amount: Decimal = Field(ge=0)
    notes: str | None = Field(None, max_length=1000)


class ExpenseIn(BaseModel):
    domain: Domain
    category: str = Field(max_length=30)
    department_id: uuid.UUID | None = None
    spent_on: date
    amount: Decimal = Field(gt=0)
    description: str = Field(min_length=3, max_length=300)
    reference: str | None = Field(None, max_length=80)
    vendor_id: uuid.UUID | None = None

    @model_validator(mode="after")
    def _category(self):
        cats = strategy.HR_CATEGORIES if self.domain == "hr" else strategy.ADMIN_CATEGORIES
        if self.category not in cats:
            raise ValueError(f"category must be one of {', '.join(cats)}")
        return self


@hr.get("/budget")
def budget(domain: Domain = "hr", fiscal_year: int | None = None, principal: Principal = Depends(current_principal),
           db: Session = Depends(get_db)):
    _gate(principal, domain, False)
    return strategy.budget_report(db, domain, fiscal_year or strategy.fiscal_year(date.today()))


@hr.put("/budget")
def set_budget(body: BudgetIn, principal: Principal = Depends(current_principal), db: Session = Depends(get_db)):
    _gate(principal, body.domain, True)
    row = strategy.set_budget(db, body.model_dump())
    return {"id": row.id, "amount": row.amount}


@hr.get("/expenses")
def expenses(domain: Domain = "hr", fiscal_year: int | None = None, principal: Principal = Depends(current_principal),
             db: Session = Depends(get_db)):
    _gate(principal, domain, False)
    rows = strategy.list_expenses(db, domain, fiscal_year or strategy.fiscal_year(date.today()))
    return [{c: getattr(e, c) for c in ("id", "category", "department_id", "spent_on", "amount", "description",
                                         "reference", "vendor_id", "created_by")} for e in rows]


@hr.post("/expenses", status_code=201)
def add_expense(body: ExpenseIn, principal: Principal = Depends(current_principal), db: Session = Depends(get_db)):
    _gate(principal, body.domain, True)
    return {"id": strategy.add_expense(db, body.model_dump()).id}


# ── engagement ─────────────────────────────────────────────────────────────


class Question(BaseModel):
    id: str = Field(min_length=1, max_length=20)
    text: str = Field(min_length=3, max_length=300)
    kind: Literal["scale", "choice", "text"]
    options: list[str] = []


class SurveyIn(BaseModel):
    title: str = Field(min_length=3, max_length=200)
    description: str | None = Field(None, max_length=2000)
    questions: list[Question] = Field(min_length=1, max_length=40)
    anonymous: bool = True
    audience: Audience = Audience()
    opens_on: date
    closes_on: date

    @model_validator(mode="after")
    def _dates(self):
        if self.closes_on < self.opens_on:
            raise ValueError("closes_on is before opens_on")
        return self


class RecognitionIn(BaseModel):
    to_employee_id: uuid.UUID
    category: Literal["patient_care", "teamwork", "above_beyond", "safety", "innovation"]
    message: str = Field(min_length=5, max_length=1000)


@hr.get("/engagement/surveys")
def surveys(_: Principal = Depends(require_hr_read), db: Session = Depends(get_db)):
    return strategy.list_surveys(db)


@hr.post("/engagement/surveys", status_code=201)
def create_survey(body: SurveyIn, _: Principal = Depends(require(ENGAGEMENT_WRITE)), db: Session = Depends(get_db)):
    return {"id": strategy.create_survey(db, body.model_dump()).id}


@hr.post("/engagement/surveys/{survey_id}/{action}")
def survey_status(survey_id: uuid.UUID, action: Literal["open", "close"], _: Principal = Depends(require(ENGAGEMENT_WRITE)),
                  db: Session = Depends(get_db)):
    s = strategy.set_survey_status(db, survey_id, "open" if action == "open" else "closed")
    return {"id": s.id, "status": s.status}


@hr.get("/engagement/surveys/{survey_id}/results")
def survey_results(survey_id: uuid.UUID, _: Principal = Depends(require_any(ENGAGEMENT_WRITE, REPORTS_READ)),
                   db: Session = Depends(get_db)):
    return strategy.survey_results(db, survey_id)


@hr.get("/engagement/recognition")
def wall(_: Principal = Depends(current_principal), db: Session = Depends(get_db)):
    return strategy.recognition_wall(db)


@mine.get("/surveys")
def my_surveys(principal: Principal = Depends(current_principal), db: Session = Depends(get_db)):
    emp = selfservice.me(db, principal)
    today = date.today()
    out = []
    for s in strategy.list_surveys(db):
        if s["status"] != "open" or not (s["opens_on"] <= today <= s["closes_on"]):
            continue
        out.append({**{k: s[k] for k in ("id", "title", "description", "questions", "anonymous", "closes_on")},
                    "responded": strategy.has_responded(db, s["id"], emp.id)})
    return out


@mine.post("/surveys/{survey_id}/respond", status_code=204)
def respond(survey_id: uuid.UUID, answers: dict[str, int | str], principal: Principal = Depends(current_principal),
            db: Session = Depends(get_db)):
    strategy.respond(db, survey_id, selfservice.me(db, principal), answers)
    return Response(status_code=204)


@mine.post("/recognition", status_code=201)
def recognise(body: RecognitionIn, principal: Principal = Depends(current_principal), db: Session = Depends(get_db)):
    return {"id": strategy.recognise(db, body.model_dump(), selfservice.me(db, principal)).id}


# ── analytics & audit ──────────────────────────────────────────────────────


@hr.get("/analytics/workforce")
def workforce_analytics(months: int = 12, _: Principal = Depends(require_hr_read), db: Session = Depends(get_db)):
    return strategy.analytics(db, max(3, min(months, 36)))


@hr.get("/audit")
def audit_log(entity_type: str | None = None, actor: str | None = None, limit: int = 200,
              _: Principal = Depends(require_any(AUDIT_READ, GOVERNANCE_WRITE)), db: Session = Depends(get_db)):
    stmt = select(AuditLog).order_by(AuditLog.created_at.desc()).limit(max(1, min(limit, 1000)))
    if entity_type:
        stmt = stmt.where(AuditLog.entity_type == entity_type)
    if actor:
        stmt = stmt.where(AuditLog.actor == actor)
    return [{"id": a.id, "at": a.created_at, "actor": a.actor, "action": a.action, "entity_type": a.entity_type,
             "entity_id": a.entity_id, "changes": a.changes, "correlation_id": a.correlation_id} for a in db.scalars(stmt)]


# ── department head ────────────────────────────────────────────────────────


@tm.get("")
def my_team(principal: Principal = Depends(current_principal), db: Session = Depends(get_db)):
    return team.overview(db, principal.username)


@tm.get("/scope")
def scope(principal: Principal = Depends(current_principal), db: Session = Depends(get_db)):
    """Does this login lead a department? The UI uses it to offer the team view."""
    me = employee_for_user(db, principal.username)
    _, depts = team.led_departments(db, principal.username)
    return {"linked": me is not None, "departments": [{"id": d.id, "name": d.name} for d in depts]}
