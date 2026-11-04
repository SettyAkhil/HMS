"""Training & certification, performance reviews, compliance scanning,
grievances & discipline."""

import uuid
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal

from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.errors import AppError, Conflict, Forbidden, NotFound
from app.models import Employee, EmployeeCredential, EmployeeDepartment, EmployeeHistory
from app.models.talent import (
    ComplianceRecord, CredentialVerification, DisciplinaryAction, EmployeeCertification, EmployeeDocument,
    ExpiryAlert, GrievanceCase, GrievanceComment, InvestigationRecord, PerformanceGoal, PerformanceReview,
    ReviewCycle, ReviewScore, TrainingEnrollment, TrainingProgram, TrainingSession,
)
from app.security import GRIEVANCES_MANAGE, PERFORMANCE_WRITE, Principal
from app.services import workflow
from app.services.common import actor_of, audit, emit, next_code, tenant_of
from app.services.employees import employee_for_user, full_name


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


def _add_months(d: date, months: int) -> date:
    y, m = divmod(d.month - 1 + months, 12)
    year, month = d.year + y, m + 1
    for day in (d.day, 30, 29, 28):
        try:
            return date(year, month, day)
        except ValueError:
            continue
    return date(year, month, 28)


# ── training ───────────────────────────────────────────────────────────────


def create_program(db: Session, data: dict) -> TrainingProgram:
    p = _new(db, TrainingProgram, **data)
    audit(db, "training_program", p.id, "created", data)
    return p


def list_programs(db: Session):
    return db.scalars(select(TrainingProgram).where(TrainingProgram.deleted_at.is_(None))
                      .order_by(TrainingProgram.title)).all()


def create_session(db: Session, data: dict) -> TrainingSession:
    _get(db, TrainingProgram, data["program_id"], "Programme")
    if data["ends_at"] <= data["starts_at"]:
        raise AppError("A session must end after it starts")
    s = _new(db, TrainingSession, **data)
    audit(db, "training_session", s.id, "scheduled")
    return s


def list_sessions(db: Session, program_id=None, upcoming=False):
    stmt = select(TrainingSession).order_by(TrainingSession.starts_at.desc())
    if program_id:
        stmt = stmt.where(TrainingSession.program_id == program_id)
    if upcoming:
        stmt = stmt.where(TrainingSession.starts_at >= datetime.now(timezone.utc))
    out = []
    for s in db.scalars(stmt.limit(300)):
        p = db.get(TrainingProgram, s.program_id)
        n = db.scalar(select(func.count()).select_from(TrainingEnrollment).where(
            TrainingEnrollment.session_id == s.id, TrainingEnrollment.status != "cancelled"))
        out.append({**{c: getattr(s, c) for c in ("id", "program_id", "starts_at", "ends_at", "location", "trainer",
                                                   "capacity", "status")},
                    "program": p.title, "category": p.category, "enrolled": n})
    return out


def enroll(db: Session, session_id: uuid.UUID, employee_ids: list[uuid.UUID]) -> int:
    s = _get(db, TrainingSession, session_id, "Session")
    if s.status != "scheduled":
        raise Conflict("Enrolment is closed for this session")
    taken = db.scalar(select(func.count()).select_from(TrainingEnrollment).where(
        TrainingEnrollment.session_id == s.id, TrainingEnrollment.status != "cancelled"))
    added = 0
    for emp_id in employee_ids:
        emp = _get(db, Employee, emp_id, "Employee")
        if emp.status != "active":
            continue
        if db.scalar(select(TrainingEnrollment.id).where(TrainingEnrollment.session_id == s.id,
                                                         TrainingEnrollment.employee_id == emp.id)):
            continue
        if s.capacity and taken + added >= s.capacity:
            raise Conflict(f"Session is full ({s.capacity})", {"enrolled_before_full": added})
        db.add(TrainingEnrollment(tenant_id=s.tenant_id, session_id=s.id, employee_id=emp.id, created_by=actor_of(db)))
        added += 1
    db.flush()
    return added


def record_result(db: Session, enrollment_id: uuid.UUID, status: str, score: int | None, remarks: str | None,
                  certificate_number: str | None) -> TrainingEnrollment:
    e = _get(db, TrainingEnrollment, enrollment_id, "Enrolment")
    s = db.get(TrainingSession, e.session_id)
    p = db.get(TrainingProgram, s.program_id)
    if status == "passed" and p.pass_score is not None and (score is None or score < p.pass_score):
        raise AppError(f"A pass needs a score of at least {p.pass_score}")
    e.status, e.score, e.remarks = status, score, remarks
    if status in ("passed", "attended") and (status == "passed" or p.pass_score is None):
        issued = s.ends_at.date()
        for old in db.scalars(select(EmployeeCertification).where(
                EmployeeCertification.employee_id == e.employee_id, EmployeeCertification.program_id == p.id,
                EmployeeCertification.status == "valid")):
            old.status = "superseded"
        db.add(EmployeeCertification(
            tenant_id=e.tenant_id, employee_id=e.employee_id, program_id=p.id, enrollment_id=e.id,
            certificate_number=certificate_number, issued_on=issued,
            expires_on=_add_months(issued, p.validity_months) if p.validity_months else None, created_by=actor_of(db)))
        emit(db, "training.completed", e.id, {"employee_id": e.employee_id, "program": p.code, "issued_on": issued})
    audit(db, "training_enrollment", e.id, status, {"score": score})
    db.flush()
    return e


def enrollments(db: Session, session_id: uuid.UUID):
    rows = db.execute(select(TrainingEnrollment, Employee).join(Employee, Employee.id == TrainingEnrollment.employee_id)
                      .where(TrainingEnrollment.session_id == session_id).order_by(Employee.first_name)).all()
    return [{"id": e.id, "employee_id": emp.id, "employee_name": full_name(emp), "employee_code": emp.employee_code,
             "status": e.status, "score": e.score, "remarks": e.remarks} for e, emp in rows]


def certifications(db: Session, employee_id=None, expiring_within: int | None = None):
    stmt = select(EmployeeCertification, Employee, TrainingProgram).join(
        Employee, Employee.id == EmployeeCertification.employee_id).join(
        TrainingProgram, TrainingProgram.id == EmployeeCertification.program_id).where(
        EmployeeCertification.status == "valid").order_by(EmployeeCertification.expires_on.nulls_last())
    if employee_id:
        stmt = stmt.where(EmployeeCertification.employee_id == employee_id)
    if expiring_within is not None:
        stmt = stmt.where(EmployeeCertification.expires_on <= date.today() + timedelta(days=expiring_within))
    today = date.today()
    return [{"id": c.id, "employee_id": e.id, "employee_name": full_name(e), "program_id": p.id, "program": p.title,
             "category": p.category, "certificate_number": c.certificate_number, "issued_on": c.issued_on,
             "expires_on": c.expires_on, "days_to_expiry": (c.expires_on - today).days if c.expires_on else None}
            for c, e, p in db.execute(stmt.limit(1000)).all()]


def add_certification(db: Session, data: dict) -> EmployeeCertification:
    p = _get(db, TrainingProgram, data["program_id"], "Programme")
    _get(db, Employee, data["employee_id"], "Employee")
    if not data.get("expires_on") and p.validity_months:
        data["expires_on"] = _add_months(data["issued_on"], p.validity_months)
    c = _new(db, EmployeeCertification, **data)
    audit(db, "employee_certification", c.id, "recorded", data)
    return c


def training_matrix(db: Session, department_id=None) -> dict:
    """Mandatory programmes against every active employee they apply to."""
    programs = [p for p in list_programs(db) if p.mandatory_for]
    stmt = select(Employee).where(Employee.status == "active", Employee.deleted_at.is_(None)).order_by(Employee.first_name)
    if department_id:
        stmt = stmt.where(Employee.id.in_(select(EmployeeDepartment.employee_id).where(
            EmployeeDepartment.department_id == department_id, EmployeeDepartment.effective_to.is_(None))))
    today = date.today()
    certs = {}
    for c in db.scalars(select(EmployeeCertification).where(EmployeeCertification.status == "valid")):
        certs[(c.employee_id, c.program_id)] = c
    rows, gaps = [], 0
    for emp in db.scalars(stmt):
        cells = {}
        for p in programs:
            if "all" not in p.mandatory_for and emp.employee_category not in p.mandatory_for:
                continue
            c = certs.get((emp.id, p.id))
            if c is None:
                state = "missing"
            elif c.expires_on and c.expires_on < today:
                state = "expired"
            elif c.expires_on and c.expires_on <= today + timedelta(days=60):
                state = "expiring"
            else:
                state = "valid"
            gaps += state in ("missing", "expired")
            cells[str(p.id)] = {"state": state, "expires_on": c.expires_on if c else None,
                                "certification_id": str(c.id) if c else None}
        if cells:
            rows.append({"employee_id": emp.id, "employee_name": full_name(emp), "category": emp.employee_category,
                         "cells": cells})
    return {"programs": [{"id": p.id, "code": p.code, "title": p.title} for p in programs], "rows": rows, "gaps": gaps}


# ── performance ────────────────────────────────────────────────────────────


def create_cycle(db: Session, data: dict) -> ReviewCycle:
    for key, crit in data["criteria"].items():
        if sum(c["weight"] for c in crit) != 100:
            raise AppError(f"Criteria weights for {key} must add up to 100")
    if "default" not in data["criteria"]:
        raise AppError("Give default criteria; category-specific sets are optional")
    c = _new(db, ReviewCycle, **data)
    audit(db, "review_cycle", c.id, "created")
    return c


def list_cycles(db: Session):
    return db.scalars(select(ReviewCycle).order_by(ReviewCycle.period_start.desc())).all()


def launch_cycle(db: Session, cycle_id: uuid.UUID, department_id=None) -> int:
    cycle = _get(db, ReviewCycle, cycle_id, "Review cycle")
    if cycle.status == "closed":
        raise Conflict("This cycle is closed")
    stmt = select(Employee).where(Employee.status == "active", Employee.joining_date <= cycle.period_end)
    if department_id:
        stmt = stmt.where(Employee.id.in_(select(EmployeeDepartment.employee_id).where(
            EmployeeDepartment.department_id == department_id, EmployeeDepartment.effective_to.is_(None))))
    created = 0
    for emp in db.scalars(stmt):
        if db.scalar(select(PerformanceReview.id).where(PerformanceReview.cycle_id == cycle.id,
                                                        PerformanceReview.employee_id == emp.id)):
            continue
        review = PerformanceReview(tenant_id=cycle.tenant_id, cycle_id=cycle.id, employee_id=emp.id,
                                   reviewer_employee_id=emp.reporting_manager_id, created_by=actor_of(db))
        db.add(review)
        db.flush()
        for crit in cycle.criteria.get(emp.employee_category) or cycle.criteria["default"]:
            db.add(ReviewScore(tenant_id=cycle.tenant_id, review_id=review.id, criterion=crit["code"],
                               weight=crit["weight"], created_by=actor_of(db)))
        created += 1
    cycle.status = "active"
    audit(db, "review_cycle", cycle.id, "launched", {"reviews": created})
    return created


def review_out(db: Session, r: PerformanceReview, viewer: Principal | None = None) -> dict:
    emp = db.get(Employee, r.employee_id)
    cycle = db.get(ReviewCycle, r.cycle_id)
    labels = {c["code"]: c["label"] for crit in cycle.criteria.values() for c in crit}
    scores = db.scalars(select(ReviewScore).where(ReviewScore.review_id == r.id)).all()
    reviewer = db.get(Employee, r.reviewer_employee_id) if r.reviewer_employee_id else None
    goals = db.scalars(select(PerformanceGoal).where(PerformanceGoal.cycle_id == r.cycle_id,
                                                     PerformanceGoal.employee_id == r.employee_id)).all()
    return {**{c: getattr(r, c) for c in ("id", "cycle_id", "employee_id", "status", "self_comments",
                                          "manager_comments", "hr_comments", "overall_rating", "final_rating",
                                          "completed_at")},
            "employee_name": full_name(emp), "cycle": cycle.name, "rating_scale": cycle.rating_scale,
            "reviewer_name": full_name(reviewer) if reviewer else None,
            "scores": [{"criterion": s.criterion, "label": labels.get(s.criterion, s.criterion), "weight": s.weight,
                        "self_score": s.self_score, "manager_score": s.manager_score, "comment": s.comment}
                       for s in scores],
            "goals": [{"id": g.id, "title": g.title, "target": g.target, "weight": g.weight, "progress": g.progress,
                       "status": g.status} for g in goals]}


def list_reviews(db: Session, principal: Principal, cycle_id=None, mine=False):
    stmt = select(PerformanceReview).order_by(PerformanceReview.created_at.desc())
    if cycle_id:
        stmt = stmt.where(PerformanceReview.cycle_id == cycle_id)
    me = employee_for_user(db, principal.username)
    if mine or not principal.can(PERFORMANCE_WRITE):
        if me is None:
            return []
        stmt = stmt.where(or_(PerformanceReview.employee_id == me.id, PerformanceReview.reviewer_employee_id == me.id))
    return [review_out(db, r) for r in db.scalars(stmt.limit(500))]


def _scores(db: Session, review_id) -> dict[str, ReviewScore]:
    return {s.criterion: s for s in db.scalars(select(ReviewScore).where(ReviewScore.review_id == review_id))}


def submit_review_step(db: Session, review_id: uuid.UUID, principal: Principal, data: dict) -> dict:
    r = _get(db, PerformanceReview, review_id, "Review")
    cycle = db.get(ReviewCycle, r.cycle_id)
    me = employee_for_user(db, principal.username)
    scores = _scores(db, r.id)
    for code, val in (data.get("scores") or {}).items():
        if code not in scores:
            raise AppError(f"Unknown criterion {code}")
        if not (1 <= int(val) <= cycle.rating_scale):
            raise AppError(f"Scores run from 1 to {cycle.rating_scale}")
    if r.status == "self_assessment":
        if not me or me.id != r.employee_id:
            raise Forbidden("This step is the employee's self-assessment")
        for code, val in data.get("scores", {}).items():
            scores[code].self_score = int(val)
        r.self_comments, r.status = data.get("comments"), "manager_review"
    elif r.status == "manager_review":
        if not (me and me.id == r.reviewer_employee_id) and not principal.can(PERFORMANCE_WRITE):
            raise Forbidden("Waiting for the reporting manager's review")
        if me and me.id == r.employee_id:
            raise Forbidden("You cannot review yourself")
        for code, val in data.get("scores", {}).items():
            scores[code].manager_score = int(val)
        if any(s.manager_score is None for s in scores.values()):
            raise AppError("Score every criterion")
        r.overall_rating = (sum(Decimal(s.manager_score) * s.weight for s in scores.values()) / 100).quantize(Decimal("0.01"))
        r.manager_comments, r.status = data.get("comments"), "hr_review"
    elif r.status == "hr_review":
        if not principal.can(PERFORMANCE_WRITE) or (me and me.id == r.employee_id):
            raise Forbidden("Waiting for HR to approve")
        r.final_rating = Decimal(str(data.get("final_rating") or r.overall_rating))
        r.hr_comments, r.status, r.completed_at = data.get("comments"), "completed", datetime.now(timezone.utc)
        emit(db, "performance.review.completed", r.id, {"employee_id": r.employee_id, "rating": r.final_rating})
    else:
        raise Conflict("This review is complete")
    audit(db, "performance_review", r.id, "step", {"status": r.status})
    db.flush()
    return review_out(db, r)


def create_goal(db: Session, data: dict) -> PerformanceGoal:
    _get(db, ReviewCycle, data["cycle_id"], "Review cycle")
    if not (data.get("employee_id") or data.get("department_id")):
        raise AppError("A goal belongs to an employee or a department (KPI)")
    return _new(db, PerformanceGoal, **data)


def update_goal(db: Session, goal_id: uuid.UUID, progress: int, status: str | None) -> PerformanceGoal:
    g = _get(db, PerformanceGoal, goal_id, "Goal")
    g.progress = max(0, min(progress, 100))
    g.status = status or ("achieved" if g.progress == 100 else g.status)
    return g


def list_goals(db: Session, cycle_id: uuid.UUID, department_id=None):
    stmt = select(PerformanceGoal).where(PerformanceGoal.cycle_id == cycle_id)
    if department_id:
        stmt = stmt.where(PerformanceGoal.department_id == department_id)
    return db.scalars(stmt).all()


# ── compliance ─────────────────────────────────────────────────────────────


def verify_credential(db: Session, credential_id: uuid.UUID, data: dict) -> CredentialVerification:
    cred = _get(db, EmployeeCredential, credential_id, "Credential")
    v = _new(db, CredentialVerification, credential_id=cred.id, **data)
    cred.verification_status, cred.verified_by, cred.verified_at = data["verdict"], actor_of(db), datetime.now(timezone.utc)
    audit(db, "credential_verification", v.id, data["verdict"], {"credential_id": cred.id, "method": data["method"]})
    return v


def _alert(db: Session, emp_id, source_type: str, source_id, title: str, due: date) -> bool:
    exists = db.scalar(select(ExpiryAlert.id).where(ExpiryAlert.source_type == source_type,
                                                    ExpiryAlert.source_id == str(source_id), ExpiryAlert.due_date == due))
    if exists:
        return False
    db.add(ExpiryAlert(tenant_id=tenant_of(db), employee_id=emp_id, source_type=source_type, source_id=str(source_id),
                       title=title, due_date=due, created_by="system"))
    emit(db, "credential.expiring", source_id, {"employee_id": emp_id, "type": source_type, "title": title,
                                                "due_date": due})
    return True


def compliance_scan(db: Session, horizon_days: int = 60) -> dict:
    """Credentials, certifications, mandatory training and documents, for
    every active employee. Refreshes compliance_records and raises one expiry
    alert per item and expiry date."""
    today, horizon = date.today(), date.today() + timedelta(days=horizon_days)
    now = datetime.now(timezone.utc)
    new_alerts = 0
    results: dict[tuple, tuple] = {}

    def record(emp_id, requirement, status, detail, due=None):
        results[(emp_id, requirement)] = (status, detail, due)

    for cred, emp in db.execute(select(EmployeeCredential, Employee).join(Employee, Employee.id == EmployeeCredential.employee_id)
                                .where(Employee.status == "active", EmployeeCredential.deleted_at.is_(None))).all():
        req = f"credential:{cred.credential_type}"
        if cred.expires_on and cred.expires_on < today:
            record(emp.id, req, "non_compliant", f"{cred.number} expired {cred.expires_on}", cred.expires_on)
        elif cred.expires_on and cred.expires_on <= horizon:
            record(emp.id, req, "expiring", f"{cred.number} expires {cred.expires_on}", cred.expires_on)
            new_alerts += _alert(db, emp.id, "credential", cred.id, f"{cred.credential_type.replace('_', ' ')} {cred.number}",
                                 cred.expires_on)
        elif cred.verification_status != "verified":
            record(emp.id, req, "non_compliant", f"{cred.number} not verified")
        else:
            record(emp.id, req, "compliant", None, cred.expires_on)
    matrix = training_matrix(db)
    titles = {str(p["id"]): p["title"] for p in matrix["programs"]}
    for row in matrix["rows"]:
        for pid, cell in row["cells"].items():
            status = {"valid": "compliant", "expiring": "expiring"}.get(cell["state"], "non_compliant")
            record(row["employee_id"], f"training:{titles[pid]}", status, cell["state"], cell["expires_on"])
            if cell["state"] == "expiring":
                # Keyed on the certificate itself (a renewal is a new certificate, so a new alert).
                new_alerts += _alert(db, row["employee_id"], "certification", cell["certification_id"],
                                     f"{titles[pid]} certificate", cell["expires_on"])
    for doc in db.scalars(select(EmployeeDocument).where(EmployeeDocument.is_current, EmployeeDocument.archived_at.is_(None),
                                                         EmployeeDocument.expiry_date.is_not(None),
                                                         EmployeeDocument.employee_id.is_not(None))):
        if doc.expiry_date <= horizon:
            new_alerts += _alert(db, doc.employee_id, "document", doc.id, doc.title, doc.expiry_date)
    for emp in db.scalars(select(Employee).where(Employee.status == "active", Employee.contract_end_date.is_not(None),
                                                 Employee.contract_end_date <= horizon)):
        new_alerts += _alert(db, emp.id, "contract", emp.id, "Employment contract", emp.contract_end_date)

    db.execute(ComplianceRecord.__table__.delete().where(ComplianceRecord.tenant_id == tenant_of(db)))
    for (emp_id, requirement), (status, detail, due) in results.items():
        db.add(ComplianceRecord(tenant_id=tenant_of(db), employee_id=emp_id, requirement=requirement, status=status,
                                detail=detail, due_date=due, checked_at=now, created_by="system"))
    db.flush()
    summary = {s: sum(1 for v in results.values() if v[0] == s) for s in ("compliant", "expiring", "non_compliant")}
    return {**summary, "new_alerts": new_alerts, "checked_at": now}


def compliance_summary(db: Session, status: str | None = None):
    stmt = select(ComplianceRecord, Employee).join(Employee, Employee.id == ComplianceRecord.employee_id).order_by(
        ComplianceRecord.status.desc(), Employee.first_name)
    if status:
        stmt = stmt.where(ComplianceRecord.status == status)
    return [{"employee_id": e.id, "employee_name": full_name(e), "requirement": c.requirement, "status": c.status,
             "detail": c.detail, "due_date": c.due_date, "checked_at": c.checked_at}
            for c, e in db.execute(stmt.limit(2000)).all()]


def alerts(db: Session, status: str = "open"):
    stmt = select(ExpiryAlert, Employee).join(Employee, Employee.id == ExpiryAlert.employee_id).where(
        ExpiryAlert.status == status).order_by(ExpiryAlert.due_date)
    return [{"id": a.id, "employee_id": e.id, "employee_name": full_name(e), "source_type": a.source_type,
             "title": a.title, "due_date": a.due_date, "days_left": (a.due_date - date.today()).days,
             "status": a.status} for a, e in db.execute(stmt.limit(1000)).all()]


def acknowledge_alert(db: Session, alert_id: uuid.UUID) -> None:
    a = _get(db, ExpiryAlert, alert_id, "Alert")
    a.status, a.acknowledged_by = "acknowledged", actor_of(db)


# ── grievances & discipline ────────────────────────────────────────────────


def _visible(db: Session, case: GrievanceCase, principal: Principal) -> str | None:
    """'manager' (full file), 'submitter' (own case, no internal notes) or None."""
    if principal.can(GRIEVANCES_MANAGE) or case.assigned_to == principal.username:
        return "manager"
    if case.submitted_by_username and case.submitted_by_username == principal.username:
        return "submitter"
    return None


def submit_grievance(db: Session, data: dict, principal: Principal) -> GrievanceCase:
    me = employee_for_user(db, principal.username)
    anonymous = bool(data.pop("anonymous", False))
    case = _new(db, GrievanceCase, case_number=next_code(db, "grievance", "GRV-", 5), anonymous=anonymous,
                submitted_by_employee_id=None if anonymous else (me.id if me else None),
                # Anonymous cases keep no link to the submitter at all.
                submitted_by_username=None if anonymous else principal.username, **data)
    case.created_by = "anonymous" if anonymous else principal.username
    emit(db, "grievance.created", case.id, {"case_number": case.case_number, "category": case.category,
                                            "severity": case.severity})
    return case


def case_out(db: Session, case: GrievanceCase, view: str) -> dict:
    out = {c: getattr(case, c) for c in ("id", "case_number", "anonymous", "category", "severity", "subject",
                                         "description", "status", "resolution", "resolved_at", "created_at")}
    comments = db.scalars(select(GrievanceComment).where(GrievanceComment.case_id == case.id)
                          .order_by(GrievanceComment.created_at)).all()
    if view == "manager":
        sub = db.get(Employee, case.submitted_by_employee_id) if case.submitted_by_employee_id else None
        against = db.get(Employee, case.against_employee_id) if case.against_employee_id else None
        out |= {"assigned_to": case.assigned_to, "submitted_by": full_name(sub) if sub else ("Anonymous" if case.anonymous else None),
                "against": full_name(against) if against else None, "against_employee_id": case.against_employee_id,
                "approval_instance_id": case.approval_instance_id,
                "investigation": [{"id": i.id, "kind": i.kind, "summary": i.summary, "document_id": i.document_id,
                                   "by": i.created_by, "at": i.created_at} for i in db.scalars(
                    select(InvestigationRecord).where(InvestigationRecord.case_id == case.id)
                    .order_by(InvestigationRecord.created_at))],
                "actions": [{"id": a.id, "employee_id": a.employee_id, "action_type": a.action_type, "details": a.details,
                             "effective_from": a.effective_from, "status": a.status} for a in db.scalars(
                    select(DisciplinaryAction).where(DisciplinaryAction.case_id == case.id))]}
    else:
        comments = [c for c in comments if not c.internal]
    out["comments"] = [{"author": c.author if view == "manager" or not c.internal else "HR", "body": c.body,
                        "internal": c.internal, "at": c.created_at} for c in comments]
    return out


def list_cases(db: Session, principal: Principal, status: str | None = None):
    stmt = select(GrievanceCase).order_by(GrievanceCase.created_at.desc()).limit(500)
    if status:
        stmt = stmt.where(GrievanceCase.status == status)
    out = []
    for c in db.scalars(stmt):
        view = _visible(db, c, principal)
        if view:
            out.append({**{k: getattr(c, k) for k in ("id", "case_number", "category", "severity", "subject", "status",
                                                      "created_at")},
                        "assigned_to": c.assigned_to if view == "manager" else None, "view": view})
    return out


def get_case(db: Session, case_id: uuid.UUID, principal: Principal) -> dict:
    case = db.get(GrievanceCase, case_id)
    view = _visible(db, case, principal) if case else None
    if view is None:
        raise NotFound("Case not found")
    audit(db, "grievance_case", case.id, "viewed")
    return case_out(db, case, view)


def _manage(db: Session, case_id, principal: Principal) -> GrievanceCase:
    case = db.get(GrievanceCase, case_id)
    if case is None or _visible(db, case, principal) != "manager":
        raise NotFound("Case not found")
    return case


def assign_case(db: Session, case_id, principal: Principal, assignee: str) -> GrievanceCase:
    case = _manage(db, case_id, principal)
    if not principal.can(GRIEVANCES_MANAGE):
        raise Forbidden("Only the grievance committee assigns cases")
    if case.submitted_by_username == assignee:
        raise AppError("A case cannot be assigned to the person who raised it")
    case.assigned_to, case.status = assignee, "assigned" if case.status == "submitted" else case.status
    audit(db, "grievance_case", case.id, "assigned", {"to": assignee})
    return case


def comment_case(db: Session, case_id, principal: Principal, body: str, internal: bool) -> None:
    case = db.get(GrievanceCase, case_id)
    view = _visible(db, case, principal) if case else None
    if view is None:
        raise NotFound("Case not found")
    if view == "submitter":
        internal = False
    db.add(GrievanceComment(tenant_id=case.tenant_id, case_id=case.id, author=principal.username, body=body,
                            internal=internal, created_by=principal.username))
    if view == "manager" and case.status == "assigned":
        case.status = "investigating"


def add_investigation(db: Session, case_id, principal: Principal, data: dict) -> InvestigationRecord:
    case = _manage(db, case_id, principal)
    case.status = "investigating" if case.status in ("submitted", "assigned") else case.status
    return _new(db, InvestigationRecord, case_id=case.id, **data)


def issue_action(db: Session, data: dict, principal: Principal) -> DisciplinaryAction:
    if not principal.can(GRIEVANCES_MANAGE):
        raise Forbidden("Disciplinary actions need grievance management rights")
    emp = _get(db, Employee, data["employee_id"], "Employee")
    if data.get("case_id"):
        case = _manage(db, data["case_id"], principal)
        case.status = "action_taken"
    a = _new(db, DisciplinaryAction, **data)
    audit(db, "disciplinary_action", a.id, "issued", {"employee_id": emp.id, "type": data["action_type"]})
    db.add(EmployeeHistory(tenant_id=a.tenant_id, employee_id=emp.id, event_type="disciplinary",
                           summary=f"{data['action_type'].replace('_', ' ').title()} issued", created_by=actor_of(db)))
    return a


def list_actions(db: Session, employee_id=None):
    stmt = select(DisciplinaryAction).order_by(DisciplinaryAction.created_at.desc())
    if employee_id:
        stmt = stmt.where(DisciplinaryAction.employee_id == employee_id)
    return db.scalars(stmt.limit(500)).all()


def propose_resolution(db: Session, case_id, principal: Principal, resolution: str) -> GrievanceCase:
    case = _manage(db, case_id, principal)
    if case.status in ("resolved", "closed"):
        raise Conflict("Case already resolved")
    case.resolution = resolution
    inst = workflow.start(db, "grievance_closure", "grievance_case", case.id,
                          f"Close grievance {case.case_number}", None, principal.username, {"category": case.category})
    case.approval_instance_id = inst.id
    return case


@workflow.on_decision("grievance_closure")
def _grievance_closed(db: Session, inst, outcome: str) -> None:
    case = db.get(GrievanceCase, uuid.UUID(inst.entity_id))
    if outcome == "approved":
        case.status, case.resolved_at = "resolved", datetime.now(timezone.utc)
        emit(db, "grievance.resolved", case.id, {"case_number": case.case_number})

