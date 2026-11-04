"""Leave types, policies, balances, applications and the leave calendar.

Flow: apply -> policy & balance validation -> days held as `pending` ->
approval workflow (manager, then HR when long) -> on approval the days move to
`used` and the affected attendance days are recalculated; rejection or
cancellation releases them. Days exclude holidays and rostered weekly offs."""

import uuid
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal

from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from app.errors import AppError, Conflict, Forbidden, NotFound
from app.models import Employee
from app.models.workforce import LeaveBalance, LeavePolicy, LeaveRequest, LeaveType, ShiftAssignment
from app.services import attendance_engine as engine
from app.services import workflow
from app.services.common import actor_of, audit, diff, emit, notify_live, tenant_of
from app.services.employees import full_name

D0 = Decimal("0")


def _new(db: Session, model, **data):
    obj = model(tenant_id=tenant_of(db), created_by=actor_of(db), updated_by=actor_of(db), **data)
    db.add(obj)
    db.flush()
    return obj


# ── configuration ───────────────────────────────────────────────────────────


def list_types(db: Session):
    return db.scalars(select(LeaveType).where(LeaveType.deleted_at.is_(None)).order_by(LeaveType.name)).all()


def create_type(db: Session, data: dict) -> LeaveType:
    t = _new(db, LeaveType, **data)
    audit(db, "leave_type", t.id, "created", data)
    return t


def update_type(db: Session, tid: uuid.UUID, data: dict) -> LeaveType:
    t = db.get(LeaveType, tid)
    if t is None or t.deleted_at:
        raise NotFound("Leave type not found")
    changes = diff(t, data)
    if changes:
        audit(db, "leave_type", t.id, "updated", changes)
    return t


def list_policies(db: Session):
    return db.scalars(select(LeavePolicy).order_by(LeavePolicy.effective_from.desc())).all()


def create_policy(db: Session, data: dict) -> LeavePolicy:
    if db.get(LeaveType, data["leave_type_id"]) is None:
        raise NotFound("Leave type not found")
    p = _new(db, LeavePolicy, **data)
    audit(db, "leave_policy", p.id, "created", data)
    return p


def _policy(db: Session, emp: Employee, type_id: uuid.UUID, on: date) -> LeavePolicy | None:
    rows = db.scalars(select(LeavePolicy).where(
        LeavePolicy.leave_type_id == type_id, LeavePolicy.effective_from <= on,
        or_(LeavePolicy.employee_category.is_(None), LeavePolicy.employee_category == emp.employee_category),
    ).order_by(LeavePolicy.employee_category.is_(None), LeavePolicy.effective_from.desc())).all()
    return rows[0] if rows else None  # category-specific beats everyone; newest first


# ── balances ────────────────────────────────────────────────────────────────


def ensure_balance(db: Session, emp: Employee, lt: LeaveType, year: int) -> LeaveBalance:
    bal = db.scalar(select(LeaveBalance).where(LeaveBalance.employee_id == emp.id,
                                               LeaveBalance.leave_type_id == lt.id, LeaveBalance.year == year))
    if bal:
        return bal
    policy = _policy(db, emp, lt.id, date(year, 12, 31))
    bal = LeaveBalance(tenant_id=tenant_of(db), employee_id=emp.id, leave_type_id=lt.id, year=year,
                       allocated=D0, accrued=D0, carried_forward=D0, adjusted=D0, used=D0, pending=D0,
                       accrued_through_month=0, created_by="system")
    if policy and policy.accrual == "annual":
        alloc = Decimal(policy.annual_allocation)
        if emp.joining_date and emp.joining_date.year == year:  # pro-rate a mid-year joiner
            alloc = (alloc * (13 - emp.joining_date.month) / 12).quantize(Decimal("0.5"))
        bal.allocated = alloc
    prev = db.scalar(select(LeaveBalance).where(LeaveBalance.employee_id == emp.id,
                                                LeaveBalance.leave_type_id == lt.id, LeaveBalance.year == year - 1))
    if prev and policy and policy.carry_forward_max:
        bal.carried_forward = min(max(available(prev), D0), Decimal(policy.carry_forward_max))
    db.add(bal)
    db.flush()
    return bal


def available(b: LeaveBalance) -> Decimal:
    return b.allocated + b.accrued + b.carried_forward + b.adjusted - b.used - b.pending


def balance_out(b: LeaveBalance, lt: LeaveType) -> dict:
    return {"leave_type_id": lt.id, "code": lt.code, "name": lt.name, "paid": lt.paid, "year": b.year,
            "allocated": b.allocated, "accrued": b.accrued, "carried_forward": b.carried_forward,
            "adjusted": b.adjusted, "used": b.used, "pending": b.pending, "available": available(b),
            "color": lt.color}


def balances_for(db: Session, employee_id: uuid.UUID, year: int) -> list[dict]:
    emp = db.get(Employee, employee_id)
    if emp is None:
        raise NotFound("Employee not found")
    return [balance_out(ensure_balance(db, emp, lt, year), lt) for lt in list_types(db)]


def adjust_balance(db: Session, employee_id: uuid.UUID, type_id: uuid.UUID, year: int, delta: Decimal,
                   reason: str) -> dict:
    emp, lt = db.get(Employee, employee_id), db.get(LeaveType, type_id)
    if not emp or not lt:
        raise NotFound("Employee or leave type not found")
    b = ensure_balance(db, emp, lt, year)
    b.adjusted += delta
    audit(db, "leave_balance", b.id, "adjusted", {"delta": delta, "reason": reason, "employee_id": emp.id})
    return balance_out(b, lt)


def run_monthly_accrual(db: Session, year: int, month: int) -> int:
    """Idempotent: each balance remembers the last month it accrued."""
    credited = 0
    for emp in db.scalars(select(Employee).where(Employee.status == "active")):
        for lt in list_types(db):
            policy = _policy(db, emp, lt.id, date(year, month, 1))
            if not policy or policy.accrual != "monthly":
                continue
            if emp.joining_date and emp.joining_date > date(year, month, 28):
                continue
            b = ensure_balance(db, emp, lt, year)
            if b.accrued_through_month >= month:
                continue
            months = month - b.accrued_through_month
            b.accrued += (Decimal(policy.annual_allocation) / 12 * months).quantize(Decimal("0.01"))
            b.accrued_through_month = month
            credited += 1
    audit(db, "leave_accrual", f"{year}-{month:02d}", "run", {"balances": credited})
    return credited


# ── applications ────────────────────────────────────────────────────────────


def count_days(db: Session, emp: Employee, start: date, end: date, half_day: str | None) -> Decimal:
    if half_day:
        return Decimal("0.5")
    offs = {a.work_date for a in db.scalars(select(ShiftAssignment).where(
        ShiftAssignment.employee_id == emp.id, ShiftAssignment.work_date >= start, ShiftAssignment.work_date <= end,
        ShiftAssignment.is_weekly_off, ShiftAssignment.status == "published"))}
    n, d = 0, start
    while d <= end:
        if d not in offs and not engine.is_holiday(db, d, emp.branch_id):
            n += 1
        d += timedelta(days=1)
    return Decimal(n)


def apply(db: Session, data: dict, requester_username: str, on_behalf: bool) -> LeaveRequest:
    emp = db.get(Employee, data["employee_id"])
    if emp is None or emp.status != "active":
        raise AppError("Leave can only be applied for an active employee")
    lt = db.get(LeaveType, data["leave_type_id"])
    if lt is None or lt.deleted_at:
        raise NotFound("Leave type not found")
    start, end, half = data["start_date"], data["end_date"], data.get("half_day")
    if end < start:
        raise AppError("End date is before start date")
    if start.year != end.year:
        raise AppError("Split leave that crosses a year end into two requests")
    if half and (start != end or not lt.allow_half_day):
        raise AppError("Half-day leave is a single day, on a leave type that allows it")
    if lt.gender and emp.gender and emp.gender != lt.gender:
        raise AppError(f"{lt.name} does not apply to this employee")
    today = datetime.now(engine.tz()).date()
    if start < today - timedelta(days=30) and not on_behalf:
        raise AppError("Leave more than 30 days in the past must be entered by HR")
    if start < today and not (lt.is_emergency or on_behalf or data.get("emergency")):
        raise AppError("Past dates need an emergency leave type or HR entry")
    policy = _policy(db, emp, lt.id, start)
    if policy and emp.joining_date and (start - emp.joining_date).days < policy.min_service_days:
        raise AppError(f"{lt.name} needs {policy.min_service_days} days of service")
    days = count_days(db, emp, start, end, half)
    if days <= 0:
        raise AppError("The selected dates are all holidays or weekly offs")
    if lt.max_consecutive_days and days > lt.max_consecutive_days:
        raise AppError(f"{lt.name} allows at most {lt.max_consecutive_days} consecutive days")
    if lt.document_required_after_days and days > lt.document_required_after_days and not data.get("document_id"):
        raise AppError(f"Attach a supporting document for {lt.name} longer than "
                       f"{lt.document_required_after_days} days")
    clash = db.scalar(select(LeaveRequest).where(
        LeaveRequest.employee_id == emp.id, LeaveRequest.status.in_(("pending", "approved")),
        LeaveRequest.start_date <= end, LeaveRequest.end_date >= start))
    if clash and not (half and clash.half_day and clash.half_day != half):
        raise Conflict(f"Overlaps an existing {clash.status} request ({clash.start_date} – {clash.end_date})")
    bal = ensure_balance(db, emp, lt, start.year)
    if lt.paid and not lt.allow_negative_balance and available(bal) < days:
        raise AppError(f"Insufficient {lt.name} balance: {available(bal)} available, {days} requested")
    req = _new(db, LeaveRequest, employee_id=emp.id, leave_type_id=lt.id, start_date=start, end_date=end,
               half_day=half, days=days, reason=data["reason"], emergency=bool(data.get("emergency")),
               document_id=data.get("document_id"))
    bal.pending += days
    inst = workflow.start(db, "leave", "leave_request", req.id,
                          f"{lt.name}: {full_name(emp)}, {start}{'' if start == end else f' – {end}'} ({days} d)",
                          emp, requester_username, {"days": float(days), "leave_type": lt.code,
                                                    "emergency": bool(data.get("emergency"))})
    req.approval_instance_id = inst.id
    emit(db, "leave.request.submitted", req.id, {"request_id": req.id, "employee_id": emp.id,
                                                  "leave_type": lt.code, "start": start, "end": end, "days": days})
    return req


@workflow.on_decision("leave")
def _leave_decided(db: Session, inst, outcome: str) -> None:
    req = db.get(LeaveRequest, uuid.UUID(inst.entity_id))
    emp, lt = db.get(Employee, req.employee_id), db.get(LeaveType, req.leave_type_id)
    bal = ensure_balance(db, emp, lt, req.start_date.year)
    bal.pending -= req.days
    req.status, req.decided_at = outcome, datetime.now(timezone.utc)
    if outcome == "approved":
        bal.used += req.days
        _recalc(db, req)
    emit(db, f"leave.request.{outcome}", req.id, {"request_id": req.id, "employee_id": req.employee_id,
                                                   "start": req.start_date, "end": req.end_date, "days": req.days})


def _recalc(db: Session, req: LeaveRequest) -> None:
    today = datetime.now(engine.tz()).date()
    if req.start_date <= today:
        engine.recalculate(db, [req.employee_id], req.start_date, min(req.end_date, today), "leave decision")
    notify_live(db, "leave", {"employee_id": req.employee_id})


def cancel(db: Session, request_id: uuid.UUID, principal_username: str, is_hr: bool, reason: str) -> LeaveRequest:
    req = db.get(LeaveRequest, request_id)
    if req is None:
        raise NotFound("Leave request not found")
    emp = db.get(Employee, req.employee_id)
    if not is_hr and emp.hms_username != principal_username:
        raise Forbidden("You can only cancel your own leave")
    if req.status == "pending":
        workflow.act(db, req.approval_instance_id, _Proxy(principal_username, is_hr), "cancel", reason)
        return req
    if req.status != "approved":
        raise Conflict(f"A {req.status} request cannot be cancelled")
    today = datetime.now(engine.tz()).date()
    if req.start_date <= today and not is_hr:
        raise AppError("Leave that has started can only be cancelled by HR")
    lt = db.get(LeaveType, req.leave_type_id)
    bal = ensure_balance(db, emp, lt, req.start_date.year)
    bal.used -= req.days
    req.status = "cancelled"
    audit(db, "leave_request", req.id, "cancelled", {"reason": reason})
    emit(db, "leave.request.cancelled", req.id, {"request_id": req.id, "employee_id": req.employee_id})
    _recalc(db, req)
    return req


class _Proxy:
    """Minimal principal for withdrawing a pending request on someone's behalf."""

    def __init__(self, username: str, is_admin: bool):
        self.username, self.is_admin = username, is_admin


def request_out(db: Session, r: LeaveRequest) -> dict:
    emp, lt = db.get(Employee, r.employee_id), db.get(LeaveType, r.leave_type_id)
    return {**{c: getattr(r, c) for c in ("id", "employee_id", "leave_type_id", "start_date", "end_date",
                                          "half_day", "days", "reason", "emergency", "document_id", "status",
                                          "approval_instance_id", "created_at", "decided_at", "created_by")},
            "employee_name": full_name(emp), "employee_code": emp.employee_code,
            "leave_type": lt.name, "leave_code": lt.code, "color": lt.color}


def list_requests(db: Session, filters: dict) -> list[dict]:
    stmt = select(LeaveRequest).order_by(LeaveRequest.start_date.desc()).limit(500)
    for key in ("employee_id", "status", "leave_type_id"):
        if filters.get(key):
            stmt = stmt.where(getattr(LeaveRequest, key) == filters[key])
    if filters.get("date_from"):
        stmt = stmt.where(LeaveRequest.end_date >= filters["date_from"])
    if filters.get("date_to"):
        stmt = stmt.where(LeaveRequest.start_date <= filters["date_to"])
    if filters.get("department_id"):
        from app.models import EmployeeDepartment
        stmt = stmt.where(LeaveRequest.employee_id.in_(select(EmployeeDepartment.employee_id).where(
            EmployeeDepartment.department_id == filters["department_id"], EmployeeDepartment.effective_to.is_(None))))
    return [request_out(db, r) for r in db.scalars(stmt)]
