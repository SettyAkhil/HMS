"""Shift templates, holidays, duty rosters, rotation, swaps and handovers.

Publishing a roster runs validation first. Errors block it (inactive staff,
approved leave on the day, too little rest between consecutive shifts);
warnings are returned for the planner to see (pending leave, staff from
another department, missing competency, understaffing)."""

import uuid
from datetime import date, datetime, timedelta, timezone

from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.errors import AppError, Conflict, NotFound
from app.models import Department, Employee, EmployeeDepartment, EmployeeProfile
from app.models.workforce import (
    DutyRoster, Holiday, LeaveRequest, ShiftAssignment, ShiftHandover, ShiftSwapRequest, ShiftTemplate,
    StaffAllocation, StaffingRequirement,
)
from app.services import attendance_engine as engine
from app.services import workflow
from app.services.common import actor_of, audit, diff, emit, notify_live, tenant_of
from app.services.employees import full_name


def _get(db: Session, model, obj_id, label):
    obj = db.get(model, obj_id)
    if obj is None or getattr(obj, "deleted_at", None):
        raise NotFound(f"{label} not found")
    return obj


def _new(db: Session, model, **data):
    obj = model(tenant_id=tenant_of(db), created_by=actor_of(db), updated_by=actor_of(db), **data)
    db.add(obj)
    db.flush()
    return obj


# ── templates & holidays ────────────────────────────────────────────────────


def shift_span(t: ShiftTemplate, day: date) -> tuple[datetime, datetime]:
    z = engine.tz()
    s = datetime.combine(day, t.start_time, z)
    e = datetime.combine(day + timedelta(days=1) if t.end_time <= t.start_time else day, t.end_time, z)
    return s, e


def template_out(t: ShiftTemplate) -> dict:
    s, e = shift_span(t, date(2026, 1, 1))
    return {**{c: getattr(t, c) for c in (
        "id", "code", "name", "kind", "start_time", "end_time", "break_minutes", "grace_in_minutes",
        "grace_out_minutes", "full_day_minutes", "half_day_minutes", "overtime_after_minutes", "min_rest_minutes",
        "is_night", "department_id", "color")},
        "crosses_midnight": e.date() != s.date(), "duration_minutes": int((e - s).total_seconds() // 60)}


def list_templates(db: Session):
    return [template_out(t) for t in db.scalars(select(ShiftTemplate).where(ShiftTemplate.deleted_at.is_(None))
                                                .order_by(ShiftTemplate.start_time))]


def create_template(db: Session, data: dict) -> dict:
    if data["start_time"] == data["end_time"]:
        raise AppError("A shift cannot start and end at the same time")
    t = _new(db, ShiftTemplate, **data)
    audit(db, "shift_template", t.id, "created", data)
    return template_out(t)


def update_template(db: Session, tid: uuid.UUID, data: dict) -> dict:
    t = _get(db, ShiftTemplate, tid, "Shift")
    changes = diff(t, data)
    if changes:
        audit(db, "shift_template", t.id, "updated", changes)
    return template_out(t)


def delete_template(db: Session, tid: uuid.UUID) -> None:
    t = _get(db, ShiftTemplate, tid, "Shift")
    in_use = db.scalar(select(func.count()).select_from(ShiftAssignment).where(
        ShiftAssignment.shift_template_id == t.id, ShiftAssignment.work_date >= date.today()))
    if in_use:
        raise Conflict(f"{in_use} upcoming assignments use this shift; reassign them first")
    t.deleted_at = datetime.now(timezone.utc)
    audit(db, "shift_template", t.id, "deleted")


def list_holidays(db: Session, year: int | None):
    stmt = select(Holiday).order_by(Holiday.holiday_date)
    if year:
        stmt = stmt.where(func.extract("year", Holiday.holiday_date) == year)
    return db.scalars(stmt).all()


def _recalc_day_everyone(db: Session, day: date) -> None:
    emp_ids = set(db.scalars(select(Employee.id).where(Employee.status == "active")).all())
    if emp_ids and day <= datetime.now(engine.tz()).date():
        engine.recalculate(db, emp_ids, day, day, "holiday calendar changed")


def create_holiday(db: Session, data: dict) -> Holiday:
    h = _new(db, Holiday, **data)
    audit(db, "holiday", h.id, "created", data)
    _recalc_day_everyone(db, h.holiday_date)
    return h


def delete_holiday(db: Session, hid: uuid.UUID) -> None:
    h = _get(db, Holiday, hid, "Holiday")
    day = h.holiday_date
    db.delete(h)
    db.flush()
    audit(db, "holiday", hid, "deleted", {"date": day})
    _recalc_day_everyone(db, day)


# ── rosters ─────────────────────────────────────────────────────────────────


def roster_out(db: Session, r: DutyRoster) -> dict:
    dept = db.get(Department, r.department_id)
    n = db.scalar(select(func.count()).select_from(ShiftAssignment).where(ShiftAssignment.roster_id == r.id))
    return {**{c: getattr(r, c) for c in ("id", "department_id", "period_start", "period_end", "status",
                                          "published_at", "published_by", "notes", "created_by", "created_at")},
            "department_name": dept.name if dept else None, "assignment_count": n}


def list_rosters(db: Session, department_id=None):
    stmt = select(DutyRoster).order_by(DutyRoster.period_start.desc())
    if department_id:
        stmt = stmt.where(DutyRoster.department_id == department_id)
    return [roster_out(db, r) for r in db.scalars(stmt.limit(200))]


def create_roster(db: Session, data: dict) -> dict:
    _get(db, Department, data["department_id"], "Department")
    if data["period_end"] < data["period_start"] or (data["period_end"] - data["period_start"]).days > 62:
        raise AppError("Roster period must be 1–62 days")
    overlap = db.scalar(select(DutyRoster).where(
        DutyRoster.department_id == data["department_id"], DutyRoster.period_start <= data["period_end"],
        DutyRoster.period_end >= data["period_start"]))
    if overlap:
        raise Conflict("Another roster already covers part of this period for this department",
                       {"roster_id": str(overlap.id)})
    r = _new(db, DutyRoster, **data)
    audit(db, "duty_roster", r.id, "created", data)
    return roster_out(db, r)


def _roster(db: Session, rid: uuid.UUID) -> DutyRoster:
    return _get(db, DutyRoster, rid, "Roster")


def set_assignments(db: Session, rid: uuid.UUID, items: list[dict]) -> dict:
    """Upsert cells. An item with neither shift nor weekly_off clears the cell."""
    r = _roster(db, rid)
    for it in items:
        if not (r.period_start <= it["work_date"] <= r.period_end):
            raise AppError(f"{it['work_date']} is outside the roster period")
        emp = _get(db, Employee, it["employee_id"], "Employee")
        if it.get("shift_template_id"):
            _get(db, ShiftTemplate, it["shift_template_id"], "Shift")
        a = db.scalar(select(ShiftAssignment).where(ShiftAssignment.employee_id == emp.id,
                                                    ShiftAssignment.work_date == it["work_date"]))
        clear = not it.get("shift_template_id") and not it.get("is_weekly_off")
        if a and a.roster_id not in (None, r.id) and a.status == "published":
            dept = db.get(DutyRoster, a.roster_id)
            raise Conflict(f"{full_name(emp)} is already rostered on {it['work_date']} by another department",
                           {"roster_id": str(dept.id) if dept else None})
        if clear:
            if a:
                db.delete(a)
            continue
        if a is None:
            a = ShiftAssignment(tenant_id=tenant_of(db), employee_id=emp.id, work_date=it["work_date"],
                                created_by=actor_of(db))
            db.add(a)
        a.shift_template_id = None if it.get("is_weekly_off") else it.get("shift_template_id")
        a.is_weekly_off = bool(it.get("is_weekly_off"))
        a.department_id, a.unit_id, a.roster_id = r.department_id, it.get("unit_id"), r.id
        a.notes = it.get("notes")
        # Editing a published roster republishes on the next publish; until
        # then the change is a draft and attendance keeps the old schedule.
        a.status = "draft"
    if r.status == "published":
        r.status = "draft"
    db.flush()
    return roster_out(db, r)


def generate_rotation(db: Session, rid: uuid.UUID, employee_ids: list[uuid.UUID], pattern: list[str],
                      stagger: bool) -> dict:
    """pattern: shift codes or "OFF", repeated over the period; staggered
    employees start at successive offsets so coverage spreads evenly."""
    r = _roster(db, rid)
    codes = {t.code: t.id for t in db.scalars(select(ShiftTemplate).where(ShiftTemplate.deleted_at.is_(None)))}
    unknown = [c for c in pattern if c != "OFF" and c not in codes]
    if unknown or not pattern:
        raise AppError("Unknown shift codes in pattern", {"unknown": unknown})
    items = []
    days = (r.period_end - r.period_start).days + 1
    for n, emp_id in enumerate(employee_ids):
        offset = n % len(pattern) if stagger else 0
        for d in range(days):
            code = pattern[(d + offset) % len(pattern)]
            items.append({"employee_id": emp_id, "work_date": r.period_start + timedelta(days=d),
                          "shift_template_id": None if code == "OFF" else codes[code], "is_weekly_off": code == "OFF"})
    return set_assignments(db, rid, items)


def assignments(db: Session, start: date, end: date, department_id=None, employee_id=None, roster_id=None,
                published_only=False) -> list[dict]:
    stmt = (select(ShiftAssignment, Employee, ShiftTemplate)
            .join(Employee, Employee.id == ShiftAssignment.employee_id)
            .outerjoin(ShiftTemplate, ShiftTemplate.id == ShiftAssignment.shift_template_id)
            .where(ShiftAssignment.work_date >= start, ShiftAssignment.work_date <= end)
            .order_by(Employee.first_name, ShiftAssignment.work_date))
    if department_id:
        stmt = stmt.where(ShiftAssignment.department_id == department_id)
    if employee_id:
        stmt = stmt.where(ShiftAssignment.employee_id == employee_id)
    if roster_id:
        stmt = stmt.where(ShiftAssignment.roster_id == roster_id)
    if published_only:
        stmt = stmt.where(ShiftAssignment.status == "published")
    return [{"id": a.id, "employee_id": e.id, "employee_name": full_name(e), "employee_code": e.employee_code,
             "category": e.employee_category, "work_date": a.work_date, "is_weekly_off": a.is_weekly_off,
             "shift_template_id": a.shift_template_id, "shift_code": t.code if t else None,
             "shift_name": t.name if t else None, "start_time": t.start_time if t else None,
             "end_time": t.end_time if t else None, "color": t.color if t else None, "status": a.status,
             "department_id": a.department_id, "roster_id": a.roster_id, "notes": a.notes}
            for a, e, t in db.execute(stmt).all()]


def validate_roster(db: Session, rid: uuid.UUID) -> dict:
    r = _roster(db, rid)
    rows = db.execute(select(ShiftAssignment, Employee, ShiftTemplate)
                      .join(Employee, Employee.id == ShiftAssignment.employee_id)
                      .outerjoin(ShiftTemplate, ShiftTemplate.id == ShiftAssignment.shift_template_id)
                      .where(ShiftAssignment.roster_id == r.id)).all()
    errors, warnings = [], []
    members = set(db.scalars(select(EmployeeDepartment.employee_id).where(
        EmployeeDepartment.department_id == r.department_id, EmployeeDepartment.effective_to.is_(None))).all())
    competencies = {p.employee_id: set(p.clinical_competencies or []) for p in db.scalars(select(EmployeeProfile))}
    by_emp: dict[uuid.UUID, list] = {}
    for a, e, t in rows:
        name = f"{full_name(e)} on {a.work_date}"
        if e.status != "active":
            errors.append({"employee_id": e.id, "date": a.work_date, "issue": f"{name}: employee is {e.status}"})
        if e.id not in members:
            allocated = db.scalar(select(StaffAllocation.id).where(
                StaffAllocation.employee_id == e.id, StaffAllocation.department_id == r.department_id,
                StaffAllocation.work_date == a.work_date, StaffAllocation.status == "active"))
            if not allocated:
                warnings.append({"employee_id": e.id, "date": a.work_date,
                                 "issue": f"{name}: not a member of this department"})
        if t:
            leave = db.scalar(select(LeaveRequest).where(
                LeaveRequest.employee_id == e.id, LeaveRequest.status.in_(("approved", "pending")),
                LeaveRequest.start_date <= a.work_date, LeaveRequest.end_date >= a.work_date))
            if leave and leave.status == "approved" and leave.half_day is None:
                errors.append({"employee_id": e.id, "date": a.work_date, "issue": f"{name}: on approved leave"})
            elif leave:
                warnings.append({"employee_id": e.id, "date": a.work_date,
                                 "issue": f"{name}: leave request {leave.status}"})
            by_emp.setdefault(e.id, []).append((a.work_date, t, name))
    # Rest between consecutive shifts, including against already-published
    # shifts just outside the roster period.
    for emp_id, items in by_emp.items():
        outside = db.execute(select(ShiftAssignment.work_date, ShiftTemplate).join(
            ShiftTemplate, ShiftTemplate.id == ShiftAssignment.shift_template_id).where(
            ShiftAssignment.employee_id == emp_id, ShiftAssignment.status == "published",
            or_(ShiftAssignment.work_date == r.period_start - timedelta(days=1),
                ShiftAssignment.work_date == r.period_end + timedelta(days=1)))).all()
        spans = sorted([(shift_span(t, d), t, n) for d, t, n in items] +
                       [(shift_span(t, d), t, f"published shift on {d}") for d, t in outside], key=lambda x: x[0][0])
        for (s1, t1, n1), (s2, t2, n2) in zip(spans, spans[1:]):
            gap = (s2[0] - s1[1]).total_seconds() / 60
            if gap < 0:
                errors.append({"employee_id": emp_id, "issue": f"{n2}: overlaps {n1}"})
            elif gap < t2.min_rest_minutes:
                errors.append({"employee_id": emp_id,
                               "issue": f"{n2}: only {int(gap // 60)} h rest after {n1} (minimum {t2.min_rest_minutes // 60} h)"})
    # Staffing: requirements against what this roster provides.
    reqs = db.scalars(select(StaffingRequirement).where(
        StaffingRequirement.department_id == r.department_id, StaffingRequirement.effective_from <= r.period_end,
        or_(StaffingRequirement.effective_to.is_(None), StaffingRequirement.effective_to >= r.period_start))).all()
    d = r.period_start
    while d <= r.period_end:
        for req in reqs:
            cover = [e for a, e, t in rows if a.work_date == d and t and e.status == "active"
                     and e.employee_category == req.employee_category
                     and (req.shift_template_id is None or t.id == req.shift_template_id)]
            if req.required_competency:
                skilled = [e for e in cover if req.required_competency in competencies.get(e.id, set())]
                if len(skilled) < req.min_count:
                    warnings.append({"date": d, "issue": f"{d}: {len(skilled)}/{req.min_count} staff with "
                                                         f"{req.required_competency}"})
            if len(cover) < req.min_count:
                warnings.append({"date": d, "issue": f"{d}: {len(cover)}/{req.min_count} "
                                                     f"{req.employee_category.replace('_', ' ')} rostered"})
        d += timedelta(days=1)
    return {"roster_id": r.id, "errors": errors, "warnings": warnings, "assignments": len(rows)}


def publish_roster(db: Session, rid: uuid.UUID) -> dict:
    result = validate_roster(db, rid)
    if result["errors"]:
        raise Conflict("Roster has problems that must be fixed before publishing", result)
    r = _roster(db, rid)
    rows = db.scalars(select(ShiftAssignment).where(ShiftAssignment.roster_id == r.id)).all()
    for a in rows:
        a.status = "published"
    r.status, r.published_at, r.published_by = "published", datetime.now(timezone.utc), actor_of(db)
    db.flush()
    emp_ids = {a.employee_id for a in rows}
    for emp_id in emp_ids:
        emit(db, "workforce.shift.assigned", emp_id, {"employee_id": emp_id, "roster_id": r.id,
                                                      "from": r.period_start, "to": r.period_end})
    emit(db, "workforce.roster.published", r.id, {"roster_id": r.id, "department_id": r.department_id,
                                                  "from": r.period_start, "to": r.period_end,
                                                  "employees": len(emp_ids)})
    audit(db, "duty_roster", r.id, "published", {"assignments": len(rows), "warnings": len(result["warnings"])})
    today = datetime.now(engine.tz()).date()
    if emp_ids and r.period_start <= today:
        engine.recalculate(db, emp_ids, r.period_start, min(r.period_end, today), "roster published")
    notify_live(db, "roster", {"roster_id": r.id})
    return {**roster_out(db, r), "warnings": result["warnings"]}


# ── swaps / replacements ────────────────────────────────────────────────────


def request_swap(db: Session, data: dict, requester_username: str) -> ShiftSwapRequest:
    mine = _get(db, ShiftAssignment, data["requester_assignment_id"], "Shift assignment")
    if mine.status != "published" or mine.is_weekly_off:
        raise AppError("Only a published working shift can be swapped")
    if mine.work_date < datetime.now(engine.tz()).date():
        raise AppError("That shift is in the past")
    counterpart = _get(db, Employee, data["counterpart_employee_id"], "Colleague")
    if counterpart.id == mine.employee_id or counterpart.status != "active":
        raise AppError("Choose another active colleague")
    theirs = None
    if data["kind"] == "swap":
        theirs = _get(db, ShiftAssignment, data["counterpart_assignment_id"], "Colleague's shift")
        if theirs.employee_id != counterpart.id or theirs.status != "published":
            raise AppError("That shift does not belong to the colleague")
        # Same-day swaps only: across dates each person would need to be free
        # on the other's day, which is a replacement in each direction.
        if theirs.work_date != mine.work_date:
            raise AppError("Swap shifts on the same date; for different dates request a replacement")
    else:  # replacement: colleague takes my shift; they must be free that day
        other = db.scalar(select(ShiftAssignment).where(ShiftAssignment.employee_id == counterpart.id,
                                                        ShiftAssignment.work_date == mine.work_date))
        if other and not other.is_weekly_off:
            raise Conflict("The colleague already works that day")
    req = _new(db, ShiftSwapRequest, kind=data["kind"], requester_employee_id=mine.employee_id,
               requester_assignment_id=mine.id, counterpart_employee_id=counterpart.id,
               counterpart_assignment_id=theirs.id if theirs else None, reason=data["reason"])
    requester = db.get(Employee, mine.employee_id)
    inst = workflow.start(db, "shift_swap", "shift_swap", req.id,
                          f"{data['kind'].title()}: {full_name(requester)} ↔ {full_name(counterpart)} on {mine.work_date}",
                          requester, requester_username, {"kind": data["kind"]})
    req.approval_instance_id = inst.id
    return req


@workflow.on_decision("shift_swap")
def _swap_decided(db: Session, inst, outcome: str) -> None:
    req = db.get(ShiftSwapRequest, uuid.UUID(inst.entity_id))
    req.status = outcome
    if outcome != "approved":
        return
    mine = db.get(ShiftAssignment, req.requester_assignment_id)
    if req.kind == "swap":
        theirs = db.get(ShiftAssignment, req.counterpart_assignment_id)
        mine.shift_template_id, theirs.shift_template_id = theirs.shift_template_id, mine.shift_template_id
        mine.is_weekly_off, theirs.is_weekly_off = theirs.is_weekly_off, mine.is_weekly_off
        days = {mine.work_date}
    else:
        other = db.scalar(select(ShiftAssignment).where(ShiftAssignment.employee_id == req.counterpart_employee_id,
                                                        ShiftAssignment.work_date == mine.work_date))
        if other:
            db.delete(other)
            db.flush()
        db.add(StaffAllocation(tenant_id=req.tenant_id, employee_id=req.counterpart_employee_id,
                               department_id=mine.department_id, work_date=mine.work_date,
                               shift_template_id=mine.shift_template_id, allocation_type="replacement",
                               replaces_employee_id=mine.employee_id, reason=req.reason, created_by=actor_of(db)))
        mine.employee_id = req.counterpart_employee_id
        days = {mine.work_date}
    db.flush()
    emit(db, "workforce.shift.assigned", req.id, {"swap_id": req.id, "kind": req.kind})
    today = datetime.now(engine.tz()).date()
    past = [d for d in days if d <= today]
    if past:
        engine.recalculate(db, {req.requester_employee_id, req.counterpart_employee_id}, min(past), max(past),
                           "shift swap")


def list_swaps(db: Session, status: str | None):
    stmt = select(ShiftSwapRequest).order_by(ShiftSwapRequest.created_at.desc()).limit(200)
    if status:
        stmt = stmt.where(ShiftSwapRequest.status == status)
    out = []
    for s in db.scalars(stmt):
        a = db.get(ShiftAssignment, s.requester_assignment_id)
        out.append({"id": s.id, "kind": s.kind, "status": s.status, "reason": s.reason,
                    "work_date": a.work_date if a else None,
                    "requester": full_name(db.get(Employee, s.requester_employee_id)),
                    "counterpart": full_name(db.get(Employee, s.counterpart_employee_id)),
                    "approval_instance_id": s.approval_instance_id, "created_at": s.created_at})
    return out


# ── handovers ───────────────────────────────────────────────────────────────


def create_handover(db: Session, data: dict) -> ShiftHandover:
    _get(db, Department, data["department_id"], "Department")
    h = _new(db, ShiftHandover, **data)
    audit(db, "shift_handover", h.id, "created", {"department_id": data["department_id"]})
    return h


def list_handovers(db: Session, department_id=None, day: date | None = None):
    stmt = select(ShiftHandover).order_by(ShiftHandover.created_at.desc()).limit(200)
    if department_id:
        stmt = stmt.where(ShiftHandover.department_id == department_id)
    if day:
        stmt = stmt.where(ShiftHandover.work_date == day)
    out = []
    for h in db.scalars(stmt):
        out.append({**{c: getattr(h, c) for c in ("id", "department_id", "work_date", "shift_template_id", "notes",
                                                   "acknowledged_at", "created_at", "created_by")},
                    "from_name": full_name(db.get(Employee, h.from_employee_id)),
                    "to_name": full_name(db.get(Employee, h.to_employee_id)) if h.to_employee_id else None})
    return out


def acknowledge_handover(db: Session, hid: uuid.UUID) -> None:
    h = _get(db, ShiftHandover, hid, "Handover")
    h.acknowledged_at = datetime.now(timezone.utc)
    audit(db, "shift_handover", h.id, "acknowledged")

