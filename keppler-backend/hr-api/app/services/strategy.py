"""HR strategy & governance, workforce planning, budgets, engagement and
workforce analytics. Every "actual" here is computed from records -- payroll,
employment history, expenses -- never typed in."""

import hashlib
import uuid
from collections import Counter, defaultdict
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.errors import AppError, Conflict, NotFound
from app.models import Department, Designation, Employee, EmployeeDepartment, EmploymentRecord
from app.models.payroll import PayrollItem, PayrollRun
from app.models.strategy import (
    Budget, Expense, FacilityRequest, HrObjective, HrPolicy, PolicyAcknowledgement, PositionPlan, Recognition, Survey,
    SurveyResponse,
)
from app.services.common import actor_of, audit, emit, tenant_of
from app.services.employees import full_name

D0 = Decimal("0")
MIN_GROUP = 5  # smallest group an anonymous survey result is broken down to


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


def fiscal_year(d: date) -> int:
    return d.year if d.month >= 4 else d.year - 1


def fy_bounds(fy: int) -> tuple[date, date]:
    return date(fy, 4, 1), date(fy + 1, 3, 31)


def _primary_dept(db: Session) -> dict[uuid.UUID, uuid.UUID]:
    return dict(db.execute(select(EmployeeDepartment.employee_id, EmployeeDepartment.department_id).where(
        EmployeeDepartment.is_primary, EmployeeDepartment.effective_to.is_(None))).all())


def _audience_ok(aud: dict, emp: Employee, depts: set[str]) -> bool:
    return bool(aud.get("all") or depts & set(aud.get("departments", [])) or emp.employee_category in aud.get("categories", []))


# ── objectives ─────────────────────────────────────────────────────────────


def objective_out(db: Session, o: HrObjective) -> dict:
    owner = db.get(Employee, o.owner_employee_id) if o.owner_employee_id else None
    progress = None
    if o.current is not None and o.baseline is not None and o.target != o.baseline:
        progress = float((o.current - o.baseline) / (o.target - o.baseline) * 100)
        progress = max(0.0, min(progress, 100.0))
    elif o.current is not None:
        progress = 100.0 if (o.current >= o.target if o.higher_is_better else o.current <= o.target) else 0.0
    return {**{c: getattr(o, c) for c in ("id", "title", "pillar", "owner_employee_id", "metric", "baseline", "target",
                                          "current", "unit", "higher_is_better", "due_date", "status", "updated_at")},
            "owner_name": full_name(owner) if owner else None, "progress": progress,
            "at_risk": o.status == "active" and o.due_date < date.today() + timedelta(days=30) and (progress or 0) < 70}


def list_objectives(db: Session):
    return [objective_out(db, o) for o in db.scalars(select(HrObjective).order_by(HrObjective.due_date))]


def create_objective(db: Session, data: dict) -> HrObjective:
    o = _new(db, HrObjective, **data)
    audit(db, "hr_objective", o.id, "created", data)
    return o


def update_objective(db: Session, oid: uuid.UUID, data: dict) -> HrObjective:
    o = _get(db, HrObjective, oid, "Objective")
    for k, v in data.items():
        setattr(o, k, v)
    audit(db, "hr_objective", o.id, "updated", data)
    return o


# ── policies ───────────────────────────────────────────────────────────────


def _active_population(db: Session) -> list[tuple[Employee, set[str]]]:
    depts: dict[uuid.UUID, set[str]] = defaultdict(set)
    for emp_id, dept_id in db.execute(select(EmployeeDepartment.employee_id, EmployeeDepartment.department_id).where(
            EmployeeDepartment.effective_to.is_(None))).all():
        depts[emp_id].add(str(dept_id))
    return [(e, depts[e.id]) for e in db.scalars(select(Employee).where(Employee.status == "active",
                                                                       Employee.deleted_at.is_(None)))]


def policy_out(db: Session, p: HrPolicy, population=None) -> dict:
    population = population if population is not None else _active_population(db)
    audience = [e for e, d in population if _audience_ok(p.audience, e, d)]
    acked = set(db.scalars(select(PolicyAcknowledgement.employee_id).where(PolicyAcknowledgement.policy_id == p.id)))
    done = sum(1 for e in audience if e.id in acked)
    return {**{c: getattr(p, c) for c in ("id", "code", "title", "category", "version", "summary", "document_id",
                                          "effective_from", "review_due", "requires_acknowledgement", "audience",
                                          "status", "published_at", "created_by")},
            "audience_size": len(audience), "acknowledged": done,
            "acknowledgement_rate": round(done * 100 / len(audience)) if audience and p.requires_acknowledgement else None,
            "review_overdue": bool(p.review_due and p.review_due < date.today() and p.status == "published")}


def list_policies(db: Session, status: str | None = None):
    stmt = select(HrPolicy).where(HrPolicy.deleted_at.is_(None)).order_by(HrPolicy.code, HrPolicy.version.desc())
    if status:
        stmt = stmt.where(HrPolicy.status == status)
    population = _active_population(db)
    return [policy_out(db, p, population) for p in db.scalars(stmt)]


def create_policy(db: Session, data: dict) -> HrPolicy:
    latest = db.scalar(select(func.max(HrPolicy.version)).where(HrPolicy.code == data["code"])) or 0
    p = _new(db, HrPolicy, version=latest + 1, **data)
    audit(db, "hr_policy", p.id, "drafted", {"code": p.code, "version": p.version})
    return p


def publish_policy(db: Session, pid: uuid.UUID) -> HrPolicy:
    p = _get(db, HrPolicy, pid, "Policy")
    if p.status != "draft":
        raise Conflict(f"Policy is {p.status}")
    for older in db.scalars(select(HrPolicy).where(HrPolicy.code == p.code, HrPolicy.status == "published")):
        older.status = "retired"  # a new version replaces the old; acknowledgements start again
    p.status, p.published_at = "published", datetime.now(timezone.utc)
    emit(db, "hr.policy.published", p.id, {"code": p.code, "version": p.version, "title": p.title,
                                           "requires_acknowledgement": p.requires_acknowledgement})
    audit(db, "hr_policy", p.id, "published")
    return p


def policies_for(db: Session, emp: Employee) -> list[dict]:
    depts = {str(d) for d in db.scalars(select(EmployeeDepartment.department_id).where(
        EmployeeDepartment.employee_id == emp.id, EmployeeDepartment.effective_to.is_(None)))}
    acked = dict(db.execute(select(PolicyAcknowledgement.policy_id, PolicyAcknowledgement.acknowledged_at).where(
        PolicyAcknowledgement.employee_id == emp.id)).all())
    return [{"id": p.id, "code": p.code, "title": p.title, "category": p.category, "version": p.version,
             "summary": p.summary, "effective_from": p.effective_from, "document_id": p.document_id,
             "requires_acknowledgement": p.requires_acknowledgement, "acknowledged_at": acked.get(p.id)}
            for p in db.scalars(select(HrPolicy).where(HrPolicy.status == "published", HrPolicy.deleted_at.is_(None))
                                .order_by(HrPolicy.title)) if _audience_ok(p.audience, emp, depts)]


def acknowledge(db: Session, pid: uuid.UUID, emp: Employee) -> None:
    p = _get(db, HrPolicy, pid, "Policy")
    if p.status != "published":
        raise Conflict("Only a published policy can be acknowledged")
    if db.scalar(select(PolicyAcknowledgement.id).where(PolicyAcknowledgement.policy_id == p.id,
                                                        PolicyAcknowledgement.employee_id == emp.id)):
        return
    _new(db, PolicyAcknowledgement, policy_id=p.id, employee_id=emp.id, acknowledged_at=datetime.now(timezone.utc))
    audit(db, "hr_policy", p.id, "acknowledged", {"employee_id": emp.id})


# ── workforce planning ─────────────────────────────────────────────────────


def upsert_plan(db: Session, data: dict) -> PositionPlan:
    _get(db, Department, data["department_id"], "Department")
    _get(db, Designation, data["designation_id"], "Designation")
    row = db.scalar(select(PositionPlan).where(PositionPlan.fiscal_year == data["fiscal_year"],
                                               PositionPlan.department_id == data["department_id"],
                                               PositionPlan.designation_id == data["designation_id"]))
    if row is None:
        row = _new(db, PositionPlan, **data)
    else:
        for k in ("sanctioned", "monthly_cost_per_position", "justification"):
            setattr(row, k, data.get(k))
    audit(db, "position_plan", row.id, "saved", data)
    return row


def workforce_plan(db: Session, fy: int) -> dict:
    """Sanctioned vs filled vs in-recruitment per department and designation."""
    from app.models.talent import Application, JobRequisition, Vacancy

    depts = {d.id: d for d in db.scalars(select(Department).where(Department.deleted_at.is_(None)))}
    desigs = {d.id: d for d in db.scalars(select(Designation).where(Designation.deleted_at.is_(None)))}
    primary = _primary_dept(db)
    filled: Counter = Counter()
    for e in db.scalars(select(Employee).where(Employee.status == "active", Employee.deleted_at.is_(None))):
        if e.designation_id and primary.get(e.id):
            filled[(primary[e.id], e.designation_id)] += 1
    pipeline: Counter = Counter()
    for req in db.scalars(select(JobRequisition).where(JobRequisition.status.in_(("pending", "approved")))):
        hired = db.scalar(select(func.count()).select_from(Application).join(Vacancy, Vacancy.id == Application.vacancy_id)
                          .where(Vacancy.requisition_id == req.id, Application.stage == "hired")) or 0
        pipeline[(req.department_id, req.designation_id)] += max(req.positions - hired, 0)
    plans = {(p.department_id, p.designation_id): p for p in db.scalars(select(PositionPlan).where(PositionPlan.fiscal_year == fy))}
    keys = set(plans) | set(filled)
    rows = []
    for dept_id, des_id in keys:
        if dept_id not in depts or des_id not in desigs:
            continue
        p = plans.get((dept_id, des_id))
        sanctioned = p.sanctioned if p else None
        f = filled[(dept_id, des_id)]
        rows.append({"department_id": dept_id, "department": depts[dept_id].name, "designation_id": des_id,
                     "designation": desigs[des_id].title, "category": desigs[des_id].job_category,
                     "sanctioned": sanctioned, "filled": f, "in_recruitment": pipeline[(dept_id, des_id)],
                     "vacant": max(sanctioned - f, 0) if sanctioned is not None else None,
                     "excess": max(f - sanctioned, 0) if sanctioned is not None else None,
                     "monthly_cost_per_position": p.monthly_cost_per_position if p else None,
                     "planned_monthly_cost": (p.monthly_cost_per_position or D0) * p.sanctioned if p else None,
                     "plan_id": p.id if p else None})
    rows.sort(key=lambda r: (r["department"], r["designation"]))
    tot_s = sum(r["sanctioned"] or 0 for r in rows)
    tot_f = sum(r["filled"] for r in rows)
    return {"fiscal_year": fy, "rows": rows, "totals": {
        "sanctioned": tot_s, "filled": tot_f, "vacant": sum(r["vacant"] or 0 for r in rows),
        "in_recruitment": sum(r["in_recruitment"] for r in rows), "unplanned_roles": sum(1 for r in rows if r["sanctioned"] is None),
        "fill_rate": round(tot_f * 100 / tot_s) if tot_s else None}}


# ── budgets & cost ─────────────────────────────────────────────────────────

HR_CATEGORIES = ("salary", "overtime", "recruitment", "training", "welfare", "other")
ADMIN_CATEGORIES = ("maintenance", "housekeeping", "security", "utilities", "assets", "vendors", "other")
REQUEST_TO_BUDGET = {"maintenance": "maintenance", "electrical": "maintenance", "plumbing": "maintenance",
                     "biomedical": "maintenance", "housekeeping": "housekeeping", "security": "security"}


def set_budget(db: Session, data: dict) -> Budget:
    cats = HR_CATEGORIES if data["domain"] == "hr" else ADMIN_CATEGORIES
    if data["category"] not in cats:
        raise AppError(f"Category must be one of {', '.join(cats)}")
    row = db.scalar(select(Budget).where(Budget.domain == data["domain"], Budget.fiscal_year == data["fiscal_year"],
                                         Budget.category == data["category"],
                                         Budget.department_id.is_(None) if data.get("department_id") is None
                                         else Budget.department_id == data["department_id"]))
    if row is None:
        row = _new(db, Budget, **data)
    else:
        row.amount, row.notes = data["amount"], data.get("notes")
    audit(db, "budget", row.id, "saved", data)
    return row


def add_expense(db: Session, data: dict) -> Expense:
    e = _new(db, Expense, **data)
    audit(db, "expense", e.id, "recorded", data)
    return e


def list_expenses(db: Session, domain: str, fy: int):
    start, end = fy_bounds(fy)
    return db.scalars(select(Expense).where(Expense.domain == domain, Expense.spent_on >= start, Expense.spent_on <= end)
                      .order_by(Expense.spent_on.desc()).limit(500)).all()


def budget_report(db: Session, domain: str, fy: int) -> dict:
    """Budget vs actual by department and category, plus a monthly actuals
    series. HR salary/overtime actuals come from finalized payroll."""
    start, end = fy_bounds(fy)
    depts = {d.id: d.name for d in db.scalars(select(Department))}
    actual: dict[tuple, Decimal] = defaultdict(lambda: D0)
    monthly: dict[str, Decimal] = defaultdict(lambda: D0)
    if domain == "hr":
        primary = _primary_dept(db)
        runs = db.scalars(select(PayrollRun).where(PayrollRun.status == "finalized", PayrollRun.kind == "regular",
                                                   (PayrollRun.year * 100 + PayrollRun.month) >= start.year * 100 + start.month,
                                                   (PayrollRun.year * 100 + PayrollRun.month) <= end.year * 100 + end.month)).all()
        for run in runs:
            key = f"{run.year}-{run.month:02d}"
            for item in db.scalars(select(PayrollItem).where(PayrollItem.run_id == run.id)):
                dept = primary.get(item.employee_id)
                ot = sum((Decimal(l["amount"]) for l in item.earnings if l["code"] == "OVERTIME"), D0)
                employer = sum((Decimal(l["amount"]) for l in item.employer_contributions), D0)
                salary = item.gross - ot + employer
                actual[(dept, "salary")] += salary
                actual[(dept, "overtime")] += ot
                monthly[key] += salary + ot
    for e in db.scalars(select(Expense).where(Expense.domain == domain, Expense.spent_on >= start, Expense.spent_on <= end)):
        actual[(e.department_id, e.category)] += e.amount
        monthly[f"{e.spent_on:%Y-%m}"] += e.amount
    if domain == "admin":
        for r in db.scalars(select(FacilityRequest).where(FacilityRequest.cost.is_not(None),
                                                          FacilityRequest.resolved_at >= datetime.combine(start, datetime.min.time(), timezone.utc))):
            cat = REQUEST_TO_BUDGET.get(r.category, "other")
            actual[(r.department_id, cat)] += r.cost
            monthly[f"{r.resolved_at:%Y-%m}"] += r.cost
    budgets = db.scalars(select(Budget).where(Budget.domain == domain, Budget.fiscal_year == fy)).all()
    planned = {(b.department_id, b.category): b.amount for b in budgets}
    # Department-less budget lines are hospital-wide: compare with all spend in that category.
    rows = []
    for key in set(planned) | set(actual):
        dept, cat = key
        if (None, cat) in planned and dept is not None and key not in planned:
            continue  # rolled into the hospital-wide line below
        spent = actual[key] if dept is not None else sum((v for (d, c), v in actual.items() if c == cat and (
            d is None or (d, c) not in planned)), D0)
        b = planned.get(key)
        rows.append({"department_id": dept, "department": depts.get(dept, "Hospital-wide") if dept else "Hospital-wide",
                     "category": cat, "budget": b, "actual": spent,
                     "variance": (b - spent) if b is not None else None,
                     "utilisation": round(float(spent / b * 100)) if b else None})
    rows.sort(key=lambda r: (r["department"], r["category"]))
    elapsed = max(1, min(12, (date.today().year - start.year) * 12 + date.today().month - start.month + 1))
    total_b = sum((b for b in planned.values()), D0)
    total_a = sum((a for a in actual.values()), D0)
    return {"domain": domain, "fiscal_year": fy, "rows": rows,
            "monthly": [{"month": k, "actual": v} for k, v in sorted(monthly.items())],
            "totals": {"budget": total_b, "actual": total_a, "variance": total_b - total_a,
                       "run_rate_annual": total_a / elapsed * 12, "months_elapsed": elapsed,
                       "utilisation": round(float(total_a / total_b * 100)) if total_b else None}}


# ── engagement ─────────────────────────────────────────────────────────────


def create_survey(db: Session, data: dict) -> Survey:
    ids = [q["id"] for q in data["questions"]]
    if len(set(ids)) != len(ids):
        raise AppError("Question ids must be unique")
    s = _new(db, Survey, **data)
    audit(db, "survey", s.id, "created")
    return s


def set_survey_status(db: Session, sid: uuid.UUID, status: str) -> Survey:
    s = _get(db, Survey, sid, "Survey")
    s.status = status
    if status == "open":
        emit(db, "engagement.survey.opened", s.id, {"title": s.title, "closes_on": s.closes_on})
    audit(db, "survey", s.id, status)
    return s


def list_surveys(db: Session):
    out = []
    population = _active_population(db)
    for s in db.scalars(select(Survey).order_by(Survey.opens_on.desc())):
        n = db.scalar(select(func.count()).select_from(SurveyResponse).where(SurveyResponse.survey_id == s.id)) or 0
        eligible = sum(1 for e, d in population if _audience_ok(s.audience, e, d))
        out.append({**{c: getattr(s, c) for c in ("id", "title", "description", "questions", "anonymous", "audience",
                                                   "opens_on", "closes_on", "status")},
                    "responses": n, "eligible": eligible, "response_rate": round(n * 100 / eligible) if eligible else None})
    return out


def _respondent_key(survey_id: uuid.UUID, employee_id: uuid.UUID) -> str:
    return hashlib.sha256(f"{survey_id}:{employee_id}".encode()).hexdigest()


def has_responded(db: Session, sid: uuid.UUID, employee_id: uuid.UUID) -> bool:
    return db.scalar(select(SurveyResponse.id).where(SurveyResponse.survey_id == sid,
                                                     SurveyResponse.respondent_key == _respondent_key(sid, employee_id))) is not None


def respond(db: Session, sid: uuid.UUID, emp: Employee, answers: dict) -> None:
    s = _get(db, Survey, sid, "Survey")
    today = date.today()
    if s.status != "open" or not (s.opens_on <= today <= s.closes_on):
        raise Conflict("This survey is not open")
    key = _respondent_key(s.id, emp.id)
    if db.scalar(select(SurveyResponse.id).where(SurveyResponse.survey_id == s.id, SurveyResponse.respondent_key == key)):
        raise Conflict("You have already responded")
    known = {q["id"]: q for q in s.questions}
    for qid, val in answers.items():
        q = known.get(qid)
        if q is None:
            raise AppError(f"Unknown question {qid}")
        if q["kind"] == "scale" and not (isinstance(val, int) and 1 <= val <= 5):
            raise AppError(f"{q['text']}: answer 1 to 5")
    dept = _primary_dept(db).get(emp.id)
    _new(db, SurveyResponse, survey_id=s.id, respondent_key=key, employee_id=None if s.anonymous else emp.id,
         department_id=dept, answers=answers)


def survey_results(db: Session, sid: uuid.UUID) -> dict:
    s = _get(db, Survey, sid, "Survey")
    responses = db.scalars(select(SurveyResponse).where(SurveyResponse.survey_id == s.id)).all()
    depts = {d.id: d.name for d in db.scalars(select(Department))}
    out = []
    for q in s.questions:
        vals = [r.answers.get(q["id"]) for r in responses if r.answers.get(q["id"]) is not None]
        item = {"id": q["id"], "text": q["text"], "kind": q["kind"], "answered": len(vals)}
        if q["kind"] == "scale":
            item["average"] = round(sum(vals) / len(vals), 2) if vals else None
            item["distribution"] = {str(i): vals.count(i) for i in range(1, 6)}
            by_dept: dict = defaultdict(list)
            for r in responses:
                if r.answers.get(q["id"]) is not None:
                    by_dept[r.department_id].append(r.answers[q["id"]])
            item["by_department"] = [{"department": depts.get(k, "—"), "average": round(sum(v) / len(v), 2), "n": len(v)}
                                     for k, v in by_dept.items() if len(v) >= MIN_GROUP]
        elif q["kind"] == "choice":
            item["counts"] = dict(Counter(vals))
        else:
            item["comments"] = [v for v in vals if isinstance(v, str) and v.strip()][:200]
        out.append(item)
    return {"survey_id": s.id, "title": s.title, "responses": len(responses), "questions": out,
            "note": f"Department breakdowns are shown only for groups of {MIN_GROUP} or more."}


def recognise(db: Session, data: dict, giver: Employee | None) -> Recognition:
    to = _get(db, Employee, data["to_employee_id"], "Colleague")
    if giver and giver.id == to.id:
        raise AppError("Recognise a colleague, not yourself")
    r = _new(db, Recognition, from_employee_id=giver.id if giver else None, **data)
    emit(db, "engagement.recognition", r.id, {"to_employee_id": to.id, "category": data["category"]})
    return r


def recognition_wall(db: Session, limit: int = 50):
    rows = db.scalars(select(Recognition).order_by(Recognition.created_at.desc()).limit(limit)).all()
    return [{"id": r.id, "category": r.category, "message": r.message, "at": r.created_at,
             "to_employee_id": r.to_employee_id, "to_name": full_name(db.get(Employee, r.to_employee_id)),
             "from_name": full_name(db.get(Employee, r.from_employee_id)) if r.from_employee_id else r.created_by}
            for r in rows]


# ── workforce analytics ────────────────────────────────────────────────────


def analytics(db: Session, months: int = 12) -> dict:
    """Headcount, joiners, leavers and turnover by month, tenure and attrition
    by department -- from joining/exit dates and employment records."""
    today = date.today()
    first = (today.replace(day=1) - timedelta(days=31 * (months - 1))).replace(day=1)
    emps = db.scalars(select(Employee).where(Employee.deleted_at.is_(None), Employee.status != "draft")).all()

    def active_on(d: date) -> int:
        return sum(1 for e in emps if (e.joining_date or d) <= d and (e.exit_date is None or e.exit_date > d))

    series = []
    m = first
    while m <= today:
        nxt = (m + timedelta(days=32)).replace(day=1)
        end = min(nxt - timedelta(days=1), today)
        joiners = sum(1 for e in emps if e.joining_date and m <= e.joining_date <= end)
        leavers = sum(1 for e in emps if e.exit_date and m <= e.exit_date <= end)
        hc_start, hc_end = active_on(m - timedelta(days=1)), active_on(end)
        avg = (hc_start + hc_end) / 2 or 1
        series.append({"month": f"{m:%Y-%m}", "headcount": hc_end, "joiners": joiners, "leavers": leavers,
                       "turnover_rate": round(leavers / avg * 100, 2)})
        m = nxt
    leavers_12 = sum(s["leavers"] for s in series)
    avg_hc = sum(s["headcount"] for s in series) / len(series) if series else 0
    primary = _primary_dept(db)
    depts = {d.id: d.name for d in db.scalars(select(Department))}
    dept_hc: Counter = Counter()
    dept_left: Counter = Counter()
    for e in emps:
        d = primary.get(e.id)
        if d is None:  # leavers lose their open assignment: use their last one
            d = db.scalar(select(EmployeeDepartment.department_id).where(EmployeeDepartment.employee_id == e.id)
                          .order_by(EmployeeDepartment.effective_to.desc().nulls_first()).limit(1))
        if e.status == "active":
            dept_hc[d] += 1
        if e.exit_date and e.exit_date >= first:
            dept_left[d] += 1
    tenure = [((today - e.joining_date).days / 365) for e in emps if e.status == "active" and e.joining_date]
    reasons = Counter(r.reason or "Not recorded" for r in db.scalars(select(EmploymentRecord).where(
        EmploymentRecord.change_type == "terminate", EmploymentRecord.effective_from >= first)))
    return {
        "months": series,
        "annual_turnover_rate": round(leavers_12 / avg_hc * 100, 1) if avg_hc else None,
        "leavers_12m": leavers_12, "joiners_12m": sum(s["joiners"] for s in series),
        "average_tenure_years": round(sum(tenure) / len(tenure), 1) if tenure else None,
        "by_department": sorted([{"department": depts.get(d, "Unassigned"), "headcount": dept_hc[d], "leavers": dept_left[d],
                                  "attrition_rate": round(dept_left[d] / (dept_hc[d] + dept_left[d]) * 100, 1)
                                  if dept_hc[d] + dept_left[d] else 0} for d in set(dept_hc) | set(dept_left)],
                                key=lambda x: -x["attrition_rate"]),
        "exit_reasons": [{"reason": k, "count": v} for k, v in reasons.most_common(8)],
        "tenure_bands": dict(Counter("< 1 y" if t < 1 else "1–3 y" if t < 3 else "3–5 y" if t < 5 else "5+ y" for t in tenure)),
    }

