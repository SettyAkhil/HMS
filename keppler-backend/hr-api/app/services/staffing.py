"""Staffing requirements, temporary/replacement allocation and coverage.

Coverage for a department, day and shift = staff rostered there (published,
active, not on full-day leave) + allocated in - allocated out, against the
requirement: max(minimum, ceil(patients / patients_per_staff)) when a census
is supplied. HR staffing never writes into clinical schedules; clinical
modules read coverage from here."""

import math
import uuid
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal

from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from app.errors import AppError, Conflict, NotFound
from app.models import Department, Employee
from app.models.workforce import (
    LeaveRequest, ShiftAssignment, ShiftTemplate, StaffAllocation, StaffingRequirement,
)
from app.services.common import actor_of, audit, emit, tenant_of
from app.services.employees import full_name
from app.services.shifts import shift_span


def _new(db: Session, model, **data):
    obj = model(tenant_id=tenant_of(db), created_by=actor_of(db), updated_by=actor_of(db), **data)
    db.add(obj)
    db.flush()
    return obj


def list_requirements(db: Session, department_id=None):
    stmt = select(StaffingRequirement).order_by(StaffingRequirement.effective_from.desc())
    if department_id:
        stmt = stmt.where(StaffingRequirement.department_id == department_id)
    return db.scalars(stmt).all()


def create_requirement(db: Session, data: dict) -> StaffingRequirement:
    if db.get(Department, data["department_id"]) is None:
        raise NotFound("Department not found")
    r = _new(db, StaffingRequirement, **data)
    audit(db, "staffing_requirement", r.id, "created", data)
    return r


def delete_requirement(db: Session, rid: uuid.UUID) -> None:
    r = db.get(StaffingRequirement, rid)
    if r is None:
        raise NotFound("Requirement not found")
    r.effective_to = date.today()
    audit(db, "staffing_requirement", r.id, "ended")


def _on_leave(db: Session, emp_id: uuid.UUID, day: date) -> bool:
    return bool(db.scalar(select(LeaveRequest.id).where(
        LeaveRequest.employee_id == emp_id, LeaveRequest.status == "approved", LeaveRequest.half_day.is_(None),
        LeaveRequest.start_date <= day, LeaveRequest.end_date >= day)))


def create_allocation(db: Session, data: dict) -> StaffAllocation:
    emp = db.get(Employee, data["employee_id"])
    if emp is None or emp.status != "active":
        raise AppError("Only active employees can be allocated")
    if db.get(Department, data["department_id"]) is None:
        raise NotFound("Department not found")
    if _on_leave(db, emp.id, data["work_date"]):
        raise Conflict(f"{full_name(emp)} is on approved leave that day")
    if data.get("shift_template_id"):
        t = db.get(ShiftTemplate, data["shift_template_id"])
        own = db.scalar(select(ShiftAssignment).where(ShiftAssignment.employee_id == emp.id,
                                                      ShiftAssignment.work_date == data["work_date"],
                                                      ShiftAssignment.status == "published"))
        if own and own.shift_template_id and own.shift_template_id != t.id:
            s1, e1 = shift_span(db.get(ShiftTemplate, own.shift_template_id), own.work_date)
            s2, e2 = shift_span(t, data["work_date"])
            if s1 < e2 and s2 < e1:
                raise Conflict(f"{full_name(emp)} is rostered on an overlapping shift that day")
    a = _new(db, StaffAllocation, **data)
    audit(db, "staff_allocation", a.id, "created", data)
    emit(db, "workforce.allocation.created", a.id, {"employee_id": emp.id, "department_id": data["department_id"],
                                                    "work_date": data["work_date"], "type": data["allocation_type"]})
    return a


def cancel_allocation(db: Session, aid: uuid.UUID) -> None:
    a = db.get(StaffAllocation, aid)
    if a is None:
        raise NotFound("Allocation not found")
    a.status = "cancelled"
    audit(db, "staff_allocation", a.id, "cancelled")


def list_allocations(db: Session, start: date, end: date, department_id=None):
    stmt = select(StaffAllocation).where(StaffAllocation.work_date >= start, StaffAllocation.work_date <= end,
                                         StaffAllocation.status == "active").order_by(StaffAllocation.work_date)
    if department_id:
        stmt = stmt.where(StaffAllocation.department_id == department_id)
    out = []
    for a in db.scalars(stmt):
        e = db.get(Employee, a.employee_id)
        out.append({**{c: getattr(a, c) for c in ("id", "employee_id", "department_id", "unit_id", "work_date",
                                                   "shift_template_id", "allocation_type", "replaces_employee_id",
                                                   "reason", "status", "created_by")},
                    "employee_name": full_name(e), "category": e.employee_category,
                    "department_name": db.get(Department, a.department_id).name})
    return out


def coverage(db: Session, start: date, end: date, department_id=None, census: dict[str, int] | None = None) -> dict:
    """census: {department_id: patients} applied to every day in range."""
    if (end - start).days > 31:
        raise AppError("Coverage is limited to 31 days per request")
    depts = [db.get(Department, department_id)] if department_id else db.scalars(
        select(Department).where(Department.deleted_at.is_(None))).all()
    templates = {t.id: t for t in db.scalars(select(ShiftTemplate))}
    rows, shortages = [], 0
    for dept in depts:
        if dept is None:
            raise NotFound("Department not found")
        reqs = db.scalars(select(StaffingRequirement).where(
            StaffingRequirement.department_id == dept.id, StaffingRequirement.effective_from <= end,
            or_(StaffingRequirement.effective_to.is_(None), StaffingRequirement.effective_to >= start))).all()
        if not reqs:
            continue
        d = start
        while d <= end:
            rostered = db.execute(select(ShiftAssignment, Employee).join(
                Employee, Employee.id == ShiftAssignment.employee_id).where(
                ShiftAssignment.department_id == dept.id, ShiftAssignment.work_date == d,
                ShiftAssignment.status == "published", ShiftAssignment.is_weekly_off.is_(False),
                Employee.status == "active")).all()
            allocated_in = db.execute(select(StaffAllocation, Employee).join(
                Employee, Employee.id == StaffAllocation.employee_id).where(
                StaffAllocation.department_id == dept.id, StaffAllocation.work_date == d,
                StaffAllocation.status == "active")).all()
            moved_out = set(db.scalars(select(StaffAllocation.employee_id).where(
                StaffAllocation.department_id != dept.id, StaffAllocation.work_date == d,
                StaffAllocation.status == "active", StaffAllocation.allocation_type == "temporary")).all())
            for req in reqs:
                if not (req.effective_from <= d and (req.effective_to is None or d <= req.effective_to)):
                    continue
                staff = {}
                for a, e in rostered:
                    if (e.employee_category == req.employee_category and e.id not in moved_out
                            and (req.shift_template_id is None or a.shift_template_id == req.shift_template_id)
                            and not _on_leave(db, e.id, d)):
                        staff[e.id] = {"employee_id": e.id, "name": full_name(e), "source": "roster"}
                for a, e in allocated_in:
                    if (e.employee_category == req.employee_category
                            and (req.shift_template_id is None or a.shift_template_id in (None, req.shift_template_id))):
                        staff[e.id] = {"employee_id": e.id, "name": full_name(e), "source": a.allocation_type}
                needed = req.min_count
                patients = (census or {}).get(str(dept.id))
                if patients is not None and req.patients_per_staff:
                    needed = max(needed, math.ceil(Decimal(patients) / req.patients_per_staff))
                short = max(0, needed - len(staff))
                shortages += short
                t = templates.get(req.shift_template_id)
                rows.append({"department_id": dept.id, "department": dept.name, "date": d,
                             "shift_template_id": req.shift_template_id, "shift": t.name if t else "Any shift",
                             "category": req.employee_category, "required": needed, "assigned": len(staff),
                             "shortage": short, "patients": patients, "staff": list(staff.values())})
            d += timedelta(days=1)
    return {"from": start, "to": end, "rows": rows, "total_shortage": shortages}


def shortage_alerts(db: Session, days_ahead: int = 2) -> int:
    today = datetime.now(timezone.utc).date()
    cov = coverage(db, today, today + timedelta(days=days_ahead))
    for r in cov["rows"]:
        if r["shortage"]:
            emit(db, "workforce.shortage.detected", f"{r['department_id']}:{r['date']}:{r['shift_template_id']}",
                 {k: r[k] for k in ("department_id", "department", "date", "shift", "category", "required",
                                    "assigned", "shortage")})
    return sum(1 for r in cov["rows"] if r["shortage"])
