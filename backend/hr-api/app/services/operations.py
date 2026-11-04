"""What the rest of the HMS asks HR: who is on duty in a department right
now, which doctors are rostered or on leave on a date, staffing against the
live bed census, and the workforce figures for the Command Center.

All read-only. HR never writes into appointment, OT or bed schedules; a
clinical module that wants to know whether a surgeon is rostered asks here."""

import uuid
from datetime import date, datetime, timedelta, timezone

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import BiometricDevice, Department, Designation, Employee, EmployeeCredential
from app.models.workforce import (
    ApprovalInstance, AttendanceRecord, LeaveRequest, ShiftAssignment, ShiftTemplate, StaffAllocation,
)
from app.services import attendance_engine as engine
from app.services import hms, staffing
from app.services.employees import full_name
from app.services.shifts import shift_span


def _depts(db: Session, hms_module: str | None, department_id: uuid.UUID | None):
    stmt = select(Department).where(Department.deleted_at.is_(None), Department.status == "active")
    if department_id:
        stmt = stmt.where(Department.id == department_id)
    if hms_module:
        stmt = stmt.where(Department.hms_module == hms_module)
    return db.scalars(stmt).all()


def _on_leave(db: Session, emp_id: uuid.UUID, day: date) -> bool:
    return bool(db.scalar(select(LeaveRequest.id).where(
        LeaveRequest.employee_id == emp_id, LeaveRequest.status == "approved", LeaveRequest.half_day.is_(None),
        LeaveRequest.start_date <= day, LeaveRequest.end_date >= day)))


def on_duty(db: Session, at: datetime | None = None, hms_module: str | None = None,
            department_id: uuid.UUID | None = None, category: str | None = None) -> dict:
    at = at or datetime.now(timezone.utc)
    local_day = at.astimezone(engine.tz()).date()
    depts = {d.id: d for d in _depts(db, hms_module, department_id)}
    if not depts:
        return {"at": at, "departments": [], "staff": []}
    staff = []
    # A shift started yesterday may still be running (overnight), so look at both days.
    rows = db.execute(select(ShiftAssignment, Employee, ShiftTemplate)
                      .join(Employee, Employee.id == ShiftAssignment.employee_id)
                      .join(ShiftTemplate, ShiftTemplate.id == ShiftAssignment.shift_template_id)
                      .where(ShiftAssignment.status == "published", ShiftAssignment.is_weekly_off.is_(False),
                             ShiftAssignment.work_date.in_((local_day, local_day - timedelta(days=1))),
                             ShiftAssignment.department_id.in_(depts), Employee.status == "active")).all()
    allocs = db.execute(select(StaffAllocation, Employee, ShiftTemplate)
                        .join(Employee, Employee.id == StaffAllocation.employee_id)
                        .outerjoin(ShiftTemplate, ShiftTemplate.id == StaffAllocation.shift_template_id)
                        .where(StaffAllocation.status == "active", StaffAllocation.department_id.in_(depts),
                               StaffAllocation.work_date.in_((local_day, local_day - timedelta(days=1))))).all()
    moved = set(db.scalars(select(StaffAllocation.employee_id).where(
        StaffAllocation.status == "active", StaffAllocation.work_date == local_day,
        StaffAllocation.allocation_type == "temporary", StaffAllocation.department_id.notin_(depts))).all())
    seen = set()
    for source, items in (("roster", rows), ("allocation", allocs)):
        for a, e, t in items:
            if t is None or e.id in seen or (source == "roster" and e.id in moved):
                continue
            if category and e.employee_category != category:
                continue
            start, end = shift_span(t, a.work_date)
            if not (start <= at < end) or _on_leave(db, e.id, a.work_date):
                continue
            rec = db.scalar(select(AttendanceRecord).where(AttendanceRecord.employee_id == e.id,
                                                           AttendanceRecord.work_date == a.work_date))
            des = db.get(Designation, e.designation_id) if e.designation_id else None
            seen.add(e.id)
            staff.append({"employee_id": e.id, "name": full_name(e), "employee_code": e.employee_code,
                          "category": e.employee_category, "designation": des.title if des else None,
                          "department_id": a.department_id, "department": depts[a.department_id].name,
                          "shift": t.name, "shift_start": start, "shift_end": end, "source": source,
                          "checked_in": bool(rec and rec.status in ("in_progress", "present", "half_day")),
                          "first_in": rec.first_in if rec else None})
    summary = []
    for d in depts.values():
        mine = [s for s in staff if s["department_id"] == d.id]
        summary.append({"department_id": d.id, "department": d.name, "hms_module": d.hms_module,
                        "rostered": len(mine), "checked_in": sum(1 for s in mine if s["checked_in"])})
    return {"at": at, "departments": summary, "staff": sorted(staff, key=lambda s: (s["department"], s["name"]))}


def availability(db: Session, start: date, end: date, category: str | None = None,
                 department_id: uuid.UUID | None = None) -> list[dict]:
    """Per person and day: rostered shift, weekly off, or leave. For OP/OT
    scheduling to consult; it does not block or change their bookings."""
    stmt = select(Employee).where(Employee.status == "active", Employee.deleted_at.is_(None))
    if category:
        stmt = stmt.where(Employee.employee_category == category)
    out = []
    for e in db.scalars(stmt.order_by(Employee.first_name)):
        assigns = {a.work_date: a for a in db.scalars(select(ShiftAssignment).where(
            ShiftAssignment.employee_id == e.id, ShiftAssignment.status == "published",
            ShiftAssignment.work_date >= start, ShiftAssignment.work_date <= end))}
        if department_id and not any(a.department_id == department_id for a in assigns.values()):
            continue
        leaves = db.scalars(select(LeaveRequest).where(
            LeaveRequest.employee_id == e.id, LeaveRequest.status == "approved",
            LeaveRequest.start_date <= end, LeaveRequest.end_date >= start)).all()
        days = []
        d = start
        while d <= end:
            leave = next((l for l in leaves if l.start_date <= d <= l.end_date), None)
            a = assigns.get(d)
            t = db.get(ShiftTemplate, a.shift_template_id) if a and a.shift_template_id else None
            if leave and leave.half_day is None:
                state = "on_leave"
            elif a and a.is_weekly_off:
                state = "off"
            elif t:
                state = "rostered"
            else:
                state = "not_rostered"
            days.append({"date": d, "state": state, "half_day_leave": leave.half_day if leave else None,
                         "shift": t.name if t else None, "start": t.start_time if t else None,
                         "end": t.end_time if t else None})
            d += timedelta(days=1)
        out.append({"employee_id": e.id, "name": full_name(e), "category": e.employee_category,
                    "hms_username": e.hms_username, "days": days})
    return out


def census_from_beds(db: Session, ctx: hms.CallerContext | None) -> tuple[dict[str, int], str | None]:
    """Occupied beds per department, via the bed board API as the caller."""
    result = hms.call(ctx, "GET", "/api/beds")
    if not result.ok:
        return {}, f"Bed census unavailable: {result.error}"
    by_ward: dict[str, int] = {}
    for bed in (result.data or {}).get("beds", []):
        if bed.get("status") == "Occupied":
            ward = (bed.get("ward") or "").strip().lower()
            by_ward[ward] = by_ward.get(ward, 0) + 1
    census = {}
    for d in db.scalars(select(Department).where(Department.deleted_at.is_(None))):
        wards = [w.strip().lower() for w in (d.census_wards or [])]
        if wards:
            census[str(d.id)] = sum(by_ward.get(w, 0) for w in wards)
    return census, None


def command_center(db: Session, ctx: hms.CallerContext | None) -> dict:
    today = datetime.now(engine.tz()).date()
    duty = on_duty(db)
    census, census_error = census_from_beds(db, ctx)
    cov = staffing.coverage(db, today, today, None, census)
    statuses = dict(db.execute(select(AttendanceRecord.status, func.count()).where(
        AttendanceRecord.work_date == today).group_by(AttendanceRecord.status)).all())
    scheduled = sum(statuses.get(s, 0) for s in ("present", "half_day", "absent", "missing_punch", "in_progress",
                                                 "scheduled"))
    present = sum(statuses.get(s, 0) for s in ("present", "half_day", "in_progress", "missing_punch"))
    devices = dict(db.execute(select(BiometricDevice.status, func.count()).where(
        BiometricDevice.deleted_at.is_(None), BiometricDevice.enabled).group_by(BiometricDevice.status)).all())
    return {
        "as_of": datetime.now(timezone.utc),
        "workforce": {"active": db.scalar(select(func.count()).select_from(Employee).where(Employee.status == "active")) or 0,
                      "on_duty_now": len(duty["staff"]), "checked_in_now": sum(1 for s in duty["staff"] if s["checked_in"])},
        "attendance_today": {"scheduled": scheduled, "present": present, "absent": statuses.get("absent", 0),
                             "on_leave": statuses.get("on_leave", 0),
                             "rate": round(present * 100 / scheduled, 1) if scheduled else None},
        "by_department": duty["departments"],
        "shortages": [r for r in cov["rows"] if r["shortage"]],
        "census": census, "census_error": census_error,
        "pending_approvals": db.scalar(select(func.count()).select_from(ApprovalInstance).where(
            ApprovalInstance.status == "pending")) or 0,
        "expiring_credentials": db.scalar(select(func.count()).select_from(EmployeeCredential).where(
            EmployeeCredential.deleted_at.is_(None), EmployeeCredential.expires_on <= today + timedelta(days=30))) or 0,
        "devices": devices,
    }
