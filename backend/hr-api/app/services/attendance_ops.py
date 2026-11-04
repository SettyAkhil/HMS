"""Calculated-attendance views and the requests that change them:
corrections (become manual punches in the raw ledger once approved, so the
device record is never edited), overtime approval, exception review and
recalculation."""

import hashlib
import uuid
from datetime import date, datetime, timedelta, timezone

from sqlalchemy import func, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session

from app.errors import AppError, Conflict, NotFound
from app.models import AttendanceIntegration, Department, Employee, EmployeeDepartment, RawPunchLog
from app.models.workforce import (
    AttendanceCorrection, AttendanceException, AttendanceRecord, AttendanceSession, OvertimeRecord, ShiftTemplate,
)
from app.services import attendance_engine as engine
from app.services import workflow
from app.services.common import actor_of, audit, paginate, tenant_of
from app.services.employees import full_name


def record_out(rec: AttendanceRecord, emp: Employee, shift: ShiftTemplate | None, dept: str | None = None) -> dict:
    return {**{c: getattr(rec, c) for c in (
        "id", "employee_id", "work_date", "status", "first_in", "last_out", "worked_minutes", "late_minutes",
        "early_minutes", "overtime_minutes", "break_deducted_minutes", "punch_count", "scheduled_start",
        "scheduled_end", "is_night", "locked", "calculated_at", "leave_request_id")},
        "employee_name": full_name(emp), "employee_code": emp.employee_code, "department": dept,
        "shift_code": shift.code if shift else None, "shift_name": shift.name if shift else None}


def daily(db: Session, day: date, filters: dict, page: int, page_size: int) -> dict:
    primary = (select(EmployeeDepartment.employee_id, EmployeeDepartment.department_id)
               .where(EmployeeDepartment.is_primary, EmployeeDepartment.effective_to.is_(None)).subquery())
    stmt = (select(AttendanceRecord, Employee, ShiftTemplate, Department.name)
            .join(Employee, Employee.id == AttendanceRecord.employee_id)
            .outerjoin(ShiftTemplate, ShiftTemplate.id == AttendanceRecord.shift_template_id)
            .outerjoin(primary, primary.c.employee_id == Employee.id)
            .outerjoin(Department, Department.id == primary.c.department_id)
            .where(AttendanceRecord.work_date == day).order_by(Employee.first_name))
    if filters.get("status"):
        stmt = stmt.where(AttendanceRecord.status == filters["status"])
    if filters.get("department_id"):
        stmt = stmt.where(primary.c.department_id == filters["department_id"])
    if filters.get("branch_id"):
        stmt = stmt.where(Employee.branch_id == filters["branch_id"])
    if filters.get("late_only"):
        stmt = stmt.where(AttendanceRecord.late_minutes > 0)
    if filters.get("overtime_only"):
        stmt = stmt.where(AttendanceRecord.overtime_minutes > 0)
    summary = dict(db.execute(select(AttendanceRecord.status, func.count()).where(
        AttendanceRecord.work_date == day).group_by(AttendanceRecord.status)).all())
    late = db.scalar(select(func.count()).select_from(AttendanceRecord).where(
        AttendanceRecord.work_date == day, AttendanceRecord.late_minutes > 0)) or 0
    early = db.scalar(select(func.count()).select_from(AttendanceRecord).where(
        AttendanceRecord.work_date == day, AttendanceRecord.early_minutes > 0)) or 0
    ot = db.scalar(select(func.count()).select_from(AttendanceRecord).where(
        AttendanceRecord.work_date == day, AttendanceRecord.overtime_minutes > 0)) or 0
    result = paginate(db, stmt, page, page_size, lambda r: record_out(r[0], r[1], r[2], r[3]))
    return {**result, "summary": {**summary, "late": late, "early": early, "overtime": ot}}


def monthly(db: Session, employee_id: uuid.UUID, year: int, month: int) -> dict:
    emp = db.get(Employee, employee_id)
    if emp is None:
        raise NotFound("Employee not found")
    start = date(year, month, 1)
    end = (start + timedelta(days=32)).replace(day=1) - timedelta(days=1)
    rows = db.execute(select(AttendanceRecord, ShiftTemplate).outerjoin(
        ShiftTemplate, ShiftTemplate.id == AttendanceRecord.shift_template_id).where(
        AttendanceRecord.employee_id == emp.id, AttendanceRecord.work_date >= start,
        AttendanceRecord.work_date <= end).order_by(AttendanceRecord.work_date)).all()
    days = [record_out(r, emp, t) for r, t in rows]
    totals = {"present": 0, "half_day": 0, "absent": 0, "on_leave": 0, "half_day_leave": 0, "holiday": 0,
              "weekly_off": 0, "missing_punch": 0}
    for d in days:
        if d["status"] in totals:
            totals[d["status"]] += 1
    return {"employee_id": emp.id, "employee_name": full_name(emp), "year": year, "month": month, "days": days,
            "totals": {**totals, "worked_minutes": sum(d["worked_minutes"] for d in days),
                       "late_days": sum(1 for d in days if d["late_minutes"]),
                       "late_minutes": sum(d["late_minutes"] for d in days),
                       "overtime_minutes": sum(d["overtime_minutes"] for d in days)}}


def record_detail(db: Session, record_id: uuid.UUID) -> dict:
    rec = db.get(AttendanceRecord, record_id)
    if rec is None:
        raise NotFound("Attendance record not found")
    emp = db.get(Employee, rec.employee_id)
    sessions = db.scalars(select(AttendanceSession).where(AttendanceSession.record_id == rec.id)
                          .order_by(AttendanceSession.check_in)).all()
    exceptions = db.scalars(select(AttendanceException).where(AttendanceException.record_id == rec.id)).all()
    return {**record_out(rec, emp, db.get(ShiftTemplate, rec.shift_template_id) if rec.shift_template_id else None),
            "sessions": [{"check_in": s.check_in, "check_out": s.check_out, "minutes": s.minutes} for s in sessions],
            "exceptions": [{"id": x.id, "kind": x.kind, "detail": x.detail, "status": x.status} for x in exceptions]}


def exceptions(db: Session, filters: dict, page: int, page_size: int) -> dict:
    stmt = (select(AttendanceException, Employee).join(Employee, Employee.id == AttendanceException.employee_id)
            .order_by(AttendanceException.work_date.desc(), Employee.first_name))
    stmt = stmt.where(AttendanceException.status == (filters.get("status") or "open"))
    for key in ("kind", "employee_id"):
        if filters.get(key):
            stmt = stmt.where(getattr(AttendanceException, key) == filters[key])
    if filters.get("date_from"):
        stmt = stmt.where(AttendanceException.work_date >= filters["date_from"])
    if filters.get("date_to"):
        stmt = stmt.where(AttendanceException.work_date <= filters["date_to"])
    return paginate(db, stmt, page, page_size, lambda r: {
        "id": r[0].id, "record_id": r[0].record_id, "employee_id": r[1].id, "employee_name": full_name(r[1]),
        "employee_code": r[1].employee_code, "work_date": r[0].work_date, "kind": r[0].kind,
        "detail": r[0].detail, "status": r[0].status})


def dismiss_exception(db: Session, exc_id: uuid.UUID, reason: str) -> None:
    x = db.get(AttendanceException, exc_id)
    if x is None:
        raise NotFound("Exception not found")
    x.status = "dismissed"
    x.detail = f"{x.detail or ''} — dismissed: {reason}".strip(" —")
    audit(db, "attendance_exception", x.id, "dismissed", {"reason": reason})


# ── corrections ─────────────────────────────────────────────────────────────


def request_correction(db: Session, data: dict, requester_username: str) -> AttendanceCorrection:
    emp = db.get(Employee, data["employee_id"])
    if emp is None:
        raise NotFound("Employee not found")
    today = datetime.now(engine.tz()).date()
    if data["work_date"] > today or data["work_date"] < today - timedelta(days=45):
        raise AppError("Corrections are for the last 45 days")
    rec = db.scalar(select(AttendanceRecord).where(AttendanceRecord.employee_id == emp.id,
                                                   AttendanceRecord.work_date == data["work_date"]))
    if rec and rec.locked:
        raise Conflict("That day is in a finalized payroll; raise a payroll adjustment instead")
    times = sorted(data["punch_times"])
    plan, start, end = engine.window(db, emp.id, data["work_date"])
    for t in times:
        if t.tzinfo is None:
            raise AppError("Punch times need a time zone offset")
        if not (start <= t < end):
            raise AppError(f"{t.isoformat()} is outside the attendance window for {data['work_date']}")
    corr = AttendanceCorrection(tenant_id=tenant_of(db), employee_id=emp.id, work_date=data["work_date"],
                                punch_times=[t.isoformat() for t in times], reason=data["reason"],
                                created_by=actor_of(db))
    db.add(corr)
    db.flush()
    inst = workflow.start(db, "attendance_correction", "attendance_correction", corr.id,
                          f"Attendance correction: {full_name(emp)} on {data['work_date']}", emp,
                          requester_username, {"punches": len(times)})
    corr.approval_instance_id = inst.id
    return corr


@workflow.on_decision("attendance_correction")
def _correction_decided(db: Session, inst, outcome: str) -> None:
    corr = db.get(AttendanceCorrection, uuid.UUID(inst.entity_id))
    corr.status = outcome
    if outcome != "approved":
        return
    integration = db.scalar(select(AttendanceIntegration).order_by(AttendanceIntegration.created_at))
    if integration is None:
        raise AppError("Configure an attendance integration before applying corrections")
    for iso in corr.punch_times:
        when = datetime.fromisoformat(iso)
        key = hashlib.sha256(f"manual|{corr.id}|{iso}".encode()).hexdigest()
        db.execute(insert(RawPunchLog).values(
            id=uuid.uuid4(), tenant_id=corr.tenant_id, integration_id=integration.id, device_user_id="MANUAL",
            punch_time=when, source="manual", employee_id=corr.employee_id, dedupe_key=key,
            raw_payload=f"manual correction {corr.id} approved by {actor_of(db)}: {corr.reason}"[:2000],
        ).on_conflict_do_nothing(index_elements=["tenant_id", "dedupe_key"]))
    corr.applied_at = datetime.now(timezone.utc)
    engine.recalculate(db, [corr.employee_id], corr.work_date, corr.work_date, "correction approved")


def list_corrections(db: Session, status: str | None, employee_id=None):
    stmt = select(AttendanceCorrection).order_by(AttendanceCorrection.created_at.desc()).limit(300)
    if status:
        stmt = stmt.where(AttendanceCorrection.status == status)
    if employee_id:
        stmt = stmt.where(AttendanceCorrection.employee_id == employee_id)
    return [{**{c: getattr(c_, c) for c in ("id", "employee_id", "work_date", "punch_times", "reason", "status",
                                             "approval_instance_id", "applied_at", "created_at", "created_by")},
             "employee_name": full_name(db.get(Employee, c_.employee_id))} for c_ in db.scalars(stmt)]


# ── overtime ────────────────────────────────────────────────────────────────


def list_overtime(db: Session, status: str | None, start: date | None, end: date | None):
    stmt = select(OvertimeRecord, Employee).join(Employee, Employee.id == OvertimeRecord.employee_id).order_by(
        OvertimeRecord.work_date.desc()).limit(500)
    if status:
        stmt = stmt.where(OvertimeRecord.status == status)
    if start:
        stmt = stmt.where(OvertimeRecord.work_date >= start)
    if end:
        stmt = stmt.where(OvertimeRecord.work_date <= end)
    return [{**{c: getattr(o, c) for c in ("id", "employee_id", "work_date", "minutes", "approved_minutes",
                                           "status", "approval_instance_id")},
             "employee_name": full_name(e), "employee_code": e.employee_code} for o, e in db.execute(stmt).all()]


def submit_overtime(db: Session, ot_id: uuid.UUID, requester_username: str) -> OvertimeRecord:
    ot = db.get(OvertimeRecord, ot_id)
    if ot is None:
        raise NotFound("Overtime record not found")
    if ot.approval_instance_id and ot.status == "pending":
        raise Conflict("Already awaiting approval")
    emp = db.get(Employee, ot.employee_id)
    inst = workflow.start(db, "overtime", "overtime", ot.id,
                          f"Overtime: {full_name(emp)}, {ot.minutes} min on {ot.work_date}", emp,
                          requester_username, {"minutes": ot.minutes})
    ot.approval_instance_id, ot.status = inst.id, "pending"
    return ot


@workflow.on_decision("overtime")
def _overtime_decided(db: Session, inst, outcome: str) -> None:
    ot = db.get(OvertimeRecord, uuid.UUID(inst.entity_id))
    ot.status = outcome
    ot.approved_minutes = ot.minutes if outcome == "approved" else None


def recalc(db: Session, employee_ids: list[uuid.UUID] | None, start: date, end: date) -> int:
    ids = employee_ids or list(db.scalars(select(Employee.id).where(Employee.status == "active")))
    try:
        return engine.recalculate(db, ids, start, end, "manual recalculation")
    except ValueError as exc:
        raise AppError(str(exc)) from exc

