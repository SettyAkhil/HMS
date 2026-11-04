"""Phase 2 routes: approvals, shifts/rosters/staffing, calculated attendance, leave."""

import uuid
from datetime import date, datetime

from fastapi import APIRouter, Body, Depends, Query, Response
from sqlalchemy.orm import Session

from app.errors import AppError, Forbidden, NotFound
from app.schemas.workforce import (
    AccrualIn, AllocationIn, ApprovalActionIn, BalanceAdjustIn, CorrectionIn, DismissIn, HandoverIn, HolidayIn,
    HolidayOut, LeaveApplyIn, LeaveCancelIn, LeavePolicyIn, LeavePolicyOut, LeaveTypeIn, LeaveTypeOut,
    LeaveTypeUpdate, RecalcIn, RequirementIn, RequirementOut, RosterIn, RotationIn, ShiftTemplateIn,
    ShiftTemplateUpdate, SwapIn, WorkflowIn, AssignmentCell,
)
from app.security import (
    ATTENDANCE_WRITE, LEAVES_WRITE, SHIFTS_WRITE, Principal, current_principal, get_db, require, require_hr_read,
)
from app.services import attendance_engine as engine
from app.services import attendance_ops, leave, shifts, staffing, workflow
from app.services.employees import employee_for_user, resolve_subject

approvals = APIRouter(prefix="/api/v1/hr", tags=["approvals"])
work = APIRouter(prefix="/api/v1/workforce", tags=["workforce"])
att = APIRouter(prefix="/api/v1/attendance", tags=["attendance-engine"])
lv = APIRouter(prefix="/api/v1/hr/leave", tags=["leave"])


def _today() -> date:
    return datetime.now(engine.tz()).date()


# ── approvals ──────────────────────────────────────────────────────────────


@approvals.get("/approvals")
def approval_inbox(status: str = "pending", mine: bool = False, principal: Principal = Depends(current_principal),
                   db: Session = Depends(get_db)):
    """Pending: what *you* can act on. mine=true: what you raised."""
    return workflow.inbox(db, principal, status, mine)


@approvals.get("/approvals/{instance_id}")
def approval_detail(instance_id: uuid.UUID, principal: Principal = Depends(current_principal),
                    db: Session = Depends(get_db)):
    from app.models.workforce import ApprovalInstance

    inst = db.get(ApprovalInstance, instance_id)
    if inst is None:
        raise NotFound("Approval request not found")
    out = workflow.instance_out(db, inst, principal)
    if not (out["can_act"] or inst.requester_username == principal.username or principal.can_read_hr()):
        raise NotFound("Approval request not found")
    return out


@approvals.post("/approvals/{instance_id}/act")
def approval_act(instance_id: uuid.UUID, body: ApprovalActionIn, principal: Principal = Depends(current_principal),
                 db: Session = Depends(get_db)):
    inst = workflow.act(db, instance_id, principal, body.action, body.comment, body.delegate_to)
    return workflow.instance_out(db, inst, principal)


@approvals.get("/workflows")
def list_workflows(_: Principal = Depends(require_hr_read), db: Session = Depends(get_db)):
    return workflow.list_workflows(db)


@approvals.put("/workflows/{code}")
def configure_workflow(code: str, body: WorkflowIn, principal: Principal = Depends(current_principal),
                       db: Session = Depends(get_db)):
    if not principal.is_admin:
        raise Forbidden("Only administrators can change approval rules")
    return workflow.replace_steps(db, code, body.model_dump())


# ── shift templates & holidays ─────────────────────────────────────────────


@work.get("/shifts")
def list_shifts(_: Principal = Depends(require_hr_read), db: Session = Depends(get_db)):
    return shifts.list_templates(db)


@work.post("/shifts", status_code=201)
def create_shift(body: ShiftTemplateIn, _: Principal = Depends(require(SHIFTS_WRITE)), db: Session = Depends(get_db)):
    return shifts.create_template(db, body.model_dump())


@work.patch("/shifts/{shift_id}")
def update_shift(shift_id: uuid.UUID, body: ShiftTemplateUpdate, _: Principal = Depends(require(SHIFTS_WRITE)),
                 db: Session = Depends(get_db)):
    return shifts.update_template(db, shift_id, body.model_dump(exclude_unset=True))


@work.delete("/shifts/{shift_id}", status_code=204)
def delete_shift(shift_id: uuid.UUID, _: Principal = Depends(require(SHIFTS_WRITE)), db: Session = Depends(get_db)):
    shifts.delete_template(db, shift_id)
    return Response(status_code=204)


@work.get("/holidays", response_model=list[HolidayOut])
def list_holidays(year: int | None = None, _: Principal = Depends(current_principal), db: Session = Depends(get_db)):
    return shifts.list_holidays(db, year)


@work.post("/holidays", response_model=HolidayOut, status_code=201)
def create_holiday(body: HolidayIn, _: Principal = Depends(require(SHIFTS_WRITE)), db: Session = Depends(get_db)):
    return shifts.create_holiday(db, body.model_dump())


@work.delete("/holidays/{holiday_id}", status_code=204)
def delete_holiday(holiday_id: uuid.UUID, _: Principal = Depends(require(SHIFTS_WRITE)), db: Session = Depends(get_db)):
    shifts.delete_holiday(db, holiday_id)
    return Response(status_code=204)


# ── rosters ────────────────────────────────────────────────────────────────


@work.get("/rosters")
def list_rosters(department_id: uuid.UUID | None = None, _: Principal = Depends(require_hr_read),
                 db: Session = Depends(get_db)):
    return shifts.list_rosters(db, department_id)


@work.post("/rosters", status_code=201)
def create_roster(body: RosterIn, _: Principal = Depends(require(SHIFTS_WRITE)), db: Session = Depends(get_db)):
    return shifts.create_roster(db, body.model_dump())


@work.put("/rosters/{roster_id}/assignments")
def set_cells(roster_id: uuid.UUID, body: list[AssignmentCell] = Body(..., max_length=5000),
              _: Principal = Depends(require(SHIFTS_WRITE)), db: Session = Depends(get_db)):
    return shifts.set_assignments(db, roster_id, [c.model_dump() for c in body])


@work.post("/rosters/{roster_id}/rotation")
def rotation(roster_id: uuid.UUID, body: RotationIn, _: Principal = Depends(require(SHIFTS_WRITE)),
             db: Session = Depends(get_db)):
    return shifts.generate_rotation(db, roster_id, body.employee_ids, body.pattern, body.stagger)


@work.get("/rosters/{roster_id}/validate")
def validate(roster_id: uuid.UUID, _: Principal = Depends(require_hr_read), db: Session = Depends(get_db)):
    return shifts.validate_roster(db, roster_id)


@work.post("/rosters/{roster_id}/publish")
def publish(roster_id: uuid.UUID, _: Principal = Depends(require(SHIFTS_WRITE)), db: Session = Depends(get_db)):
    return shifts.publish_roster(db, roster_id)


@work.get("/assignments")
def list_assignments(date_from: date, date_to: date, department_id: uuid.UUID | None = None,
                     employee_id: uuid.UUID | None = None, roster_id: uuid.UUID | None = None,
                     published_only: bool = False, _: Principal = Depends(require_hr_read),
                     db: Session = Depends(get_db)):
    if (date_to - date_from).days > 62:
        raise AppError("At most 62 days per request")
    return shifts.assignments(db, date_from, date_to, department_id, employee_id, roster_id, published_only)


@work.get("/swaps")
def list_swaps(status: str | None = None, _: Principal = Depends(require_hr_read), db: Session = Depends(get_db)):
    return shifts.list_swaps(db, status)


@work.post("/swaps", status_code=201)
def request_swap(body: SwapIn, principal: Principal = Depends(current_principal), db: Session = Depends(get_db)):
    from app.models.workforce import ShiftAssignment

    a = db.get(ShiftAssignment, body.requester_assignment_id)
    if a is None:
        raise NotFound("Shift not found")
    resolve_subject(db, principal, a.employee_id, SHIFTS_WRITE)
    req = shifts.request_swap(db, body.model_dump(), principal.username)
    return {"id": req.id, "status": req.status, "approval_instance_id": req.approval_instance_id}


@work.get("/handovers")
def list_handovers(department_id: uuid.UUID | None = None, day: date | None = None,
                   _: Principal = Depends(require_hr_read), db: Session = Depends(get_db)):
    return shifts.list_handovers(db, department_id, day)


@work.post("/handovers", status_code=201)
def create_handover(body: HandoverIn, principal: Principal = Depends(current_principal), db: Session = Depends(get_db)):
    resolve_subject(db, principal, body.from_employee_id, SHIFTS_WRITE)
    return {"id": shifts.create_handover(db, body.model_dump()).id}


@work.post("/handovers/{handover_id}/acknowledge", status_code=204)
def ack_handover(handover_id: uuid.UUID, _: Principal = Depends(current_principal), db: Session = Depends(get_db)):
    shifts.acknowledge_handover(db, handover_id)
    return Response(status_code=204)


# ── staffing ───────────────────────────────────────────────────────────────


@work.get("/requirements", response_model=list[RequirementOut])
def list_requirements(department_id: uuid.UUID | None = None, _: Principal = Depends(require_hr_read),
                      db: Session = Depends(get_db)):
    return staffing.list_requirements(db, department_id)


@work.post("/requirements", response_model=RequirementOut, status_code=201)
def create_requirement(body: RequirementIn, _: Principal = Depends(require(SHIFTS_WRITE)),
                       db: Session = Depends(get_db)):
    return staffing.create_requirement(db, body.model_dump())


@work.delete("/requirements/{req_id}", status_code=204)
def end_requirement(req_id: uuid.UUID, _: Principal = Depends(require(SHIFTS_WRITE)), db: Session = Depends(get_db)):
    staffing.delete_requirement(db, req_id)
    return Response(status_code=204)


@work.get("/allocations")
def list_allocations(date_from: date, date_to: date, department_id: uuid.UUID | None = None,
                     _: Principal = Depends(require_hr_read), db: Session = Depends(get_db)):
    return staffing.list_allocations(db, date_from, date_to, department_id)


@work.post("/allocations", status_code=201)
def create_allocation(body: AllocationIn, _: Principal = Depends(require(SHIFTS_WRITE)),
                      db: Session = Depends(get_db)):
    return {"id": staffing.create_allocation(db, body.model_dump()).id}


@work.delete("/allocations/{alloc_id}", status_code=204)
def cancel_allocation(alloc_id: uuid.UUID, _: Principal = Depends(require(SHIFTS_WRITE)),
                      db: Session = Depends(get_db)):
    staffing.cancel_allocation(db, alloc_id)
    return Response(status_code=204)


@work.get("/coverage")
def coverage(date_from: date | None = None, date_to: date | None = None, department_id: uuid.UUID | None = None,
             census: str | None = Query(None, description="dept_id:patients,dept_id:patients"),
             _: Principal = Depends(require_hr_read), db: Session = Depends(get_db)):
    start = date_from or _today()
    counts = {}
    for part in (census or "").split(","):
        if ":" in part:
            k, v = part.split(":", 1)
            if v.strip().isdigit():
                counts[k.strip()] = int(v)
    return staffing.coverage(db, start, date_to or start, department_id, counts)


# ── calculated attendance ──────────────────────────────────────────────────


@att.get("/daily")
def daily(day: date | None = None, status: str | None = None, department_id: uuid.UUID | None = None,
          branch_id: uuid.UUID | None = None, late_only: bool = False, overtime_only: bool = False,
          page: int = 1, page_size: int = 50, _: Principal = Depends(require_hr_read), db: Session = Depends(get_db)):
    return attendance_ops.daily(db, day or _today(), {"status": status, "department_id": department_id,
                                                      "branch_id": branch_id, "late_only": late_only,
                                                      "overtime_only": overtime_only}, page, page_size)


@att.get("/monthly/{employee_id}")
def monthly(employee_id: uuid.UUID, year: int, month: int = Query(ge=1, le=12),
            principal: Principal = Depends(current_principal), db: Session = Depends(get_db)):
    me = employee_for_user(db, principal.username)
    if not (principal.can_read_hr() or (me and me.id == employee_id)):
        raise Forbidden("You can only see your own attendance")
    return attendance_ops.monthly(db, employee_id, year, month)


@att.get("/records/{record_id}")
def record(record_id: uuid.UUID, _: Principal = Depends(require_hr_read), db: Session = Depends(get_db)):
    return attendance_ops.record_detail(db, record_id)


@att.get("/exceptions")
def list_exceptions(status: str = "open", kind: str | None = None, employee_id: uuid.UUID | None = None,
                    date_from: date | None = None, date_to: date | None = None, page: int = 1, page_size: int = 50,
                    _: Principal = Depends(require_hr_read), db: Session = Depends(get_db)):
    return attendance_ops.exceptions(db, {"status": status, "kind": kind, "employee_id": employee_id,
                                          "date_from": date_from, "date_to": date_to}, page, page_size)


@att.post("/exceptions/{exc_id}/dismiss", status_code=204)
def dismiss(exc_id: uuid.UUID, body: DismissIn, _: Principal = Depends(require(ATTENDANCE_WRITE)),
            db: Session = Depends(get_db)):
    attendance_ops.dismiss_exception(db, exc_id, body.reason)
    return Response(status_code=204)


@att.get("/corrections")
def list_corrections(status: str | None = None, employee_id: uuid.UUID | None = None,
                     _: Principal = Depends(require_hr_read), db: Session = Depends(get_db)):
    return attendance_ops.list_corrections(db, status, employee_id)


@att.post("/corrections", status_code=201)
def request_correction(body: CorrectionIn, principal: Principal = Depends(current_principal),
                       db: Session = Depends(get_db)):
    emp = resolve_subject(db, principal, body.employee_id, ATTENDANCE_WRITE)
    corr = attendance_ops.request_correction(db, {**body.model_dump(), "employee_id": emp.id}, principal.username)
    return {"id": corr.id, "status": corr.status, "approval_instance_id": corr.approval_instance_id}


@att.get("/overtime")
def list_overtime(status: str | None = None, date_from: date | None = None, date_to: date | None = None,
                  _: Principal = Depends(require_hr_read), db: Session = Depends(get_db)):
    return attendance_ops.list_overtime(db, status, date_from, date_to)


@att.post("/overtime/{ot_id}/submit")
def submit_overtime(ot_id: uuid.UUID, principal: Principal = Depends(current_principal), db: Session = Depends(get_db)):
    from app.models.workforce import OvertimeRecord

    ot = db.get(OvertimeRecord, ot_id)
    if ot is None:
        raise NotFound("Overtime record not found")
    resolve_subject(db, principal, ot.employee_id, ATTENDANCE_WRITE)
    ot = attendance_ops.submit_overtime(db, ot_id, principal.username)
    return {"id": ot.id, "status": ot.status, "approval_instance_id": ot.approval_instance_id}


@att.post("/recalculate")
def recalculate(body: RecalcIn, _: Principal = Depends(require(ATTENDANCE_WRITE)), db: Session = Depends(get_db)):
    return {"records": attendance_ops.recalc(db, body.employee_ids, body.date_from, body.date_to)}


# ── leave ──────────────────────────────────────────────────────────────────


@lv.get("/types", response_model=list[LeaveTypeOut])
def leave_types(_: Principal = Depends(current_principal), db: Session = Depends(get_db)):
    return leave.list_types(db)


@lv.post("/types", response_model=LeaveTypeOut, status_code=201)
def create_leave_type(body: LeaveTypeIn, _: Principal = Depends(require(LEAVES_WRITE)), db: Session = Depends(get_db)):
    return leave.create_type(db, body.model_dump())


@lv.patch("/types/{type_id}", response_model=LeaveTypeOut)
def update_leave_type(type_id: uuid.UUID, body: LeaveTypeUpdate, _: Principal = Depends(require(LEAVES_WRITE)),
                      db: Session = Depends(get_db)):
    return leave.update_type(db, type_id, body.model_dump(exclude_unset=True))


@lv.get("/policies", response_model=list[LeavePolicyOut])
def leave_policies(_: Principal = Depends(require_hr_read), db: Session = Depends(get_db)):
    return leave.list_policies(db)


@lv.post("/policies", response_model=LeavePolicyOut, status_code=201)
def create_leave_policy(body: LeavePolicyIn, _: Principal = Depends(require(LEAVES_WRITE)),
                        db: Session = Depends(get_db)):
    return leave.create_policy(db, body.model_dump())


@lv.get("/balances/{employee_id}")
def balances(employee_id: uuid.UUID, year: int | None = None, principal: Principal = Depends(current_principal),
             db: Session = Depends(get_db)):
    me = employee_for_user(db, principal.username)
    if not (principal.can_read_hr() or (me and me.id == employee_id)):
        raise Forbidden("You can only see your own balances")
    return leave.balances_for(db, employee_id, year or _today().year)


@lv.post("/balances/adjust")
def adjust(body: BalanceAdjustIn, _: Principal = Depends(require(LEAVES_WRITE)), db: Session = Depends(get_db)):
    return leave.adjust_balance(db, body.employee_id, body.leave_type_id, body.year, body.delta, body.reason)


@lv.post("/accrual")
def accrual(body: AccrualIn, _: Principal = Depends(require(LEAVES_WRITE)), db: Session = Depends(get_db)):
    return {"balances_credited": leave.run_monthly_accrual(db, body.year, body.month)}


@lv.get("/requests")
def leave_requests(employee_id: uuid.UUID | None = None, status: str | None = None,
                   leave_type_id: uuid.UUID | None = None, department_id: uuid.UUID | None = None,
                   date_from: date | None = None, date_to: date | None = None,
                   principal: Principal = Depends(current_principal), db: Session = Depends(get_db)):
    if not principal.can_read_hr():
        me = employee_for_user(db, principal.username)
        if me is None:
            raise AppError("Your login is not linked to an employee record")
        employee_id, department_id = me.id, None
    return leave.list_requests(db, {"employee_id": employee_id, "status": status, "leave_type_id": leave_type_id,
                                    "department_id": department_id, "date_from": date_from, "date_to": date_to})


@lv.post("/requests", status_code=201)
def apply_leave(body: LeaveApplyIn, principal: Principal = Depends(current_principal), db: Session = Depends(get_db)):
    emp = resolve_subject(db, principal, body.employee_id, LEAVES_WRITE)
    req = leave.apply(db, {**body.model_dump(), "employee_id": emp.id}, principal.username,
                      on_behalf=emp.hms_username != principal.username)
    return leave.request_out(db, req)


@lv.post("/requests/{request_id}/cancel")
def cancel_leave(request_id: uuid.UUID, body: LeaveCancelIn, principal: Principal = Depends(current_principal),
                 db: Session = Depends(get_db)):
    req = leave.cancel(db, request_id, principal.username, principal.can(LEAVES_WRITE), body.reason)
    return leave.request_out(db, req)


@lv.get("/calendar")
def leave_calendar(date_from: date, date_to: date, department_id: uuid.UUID | None = None,
                   _: Principal = Depends(require_hr_read), db: Session = Depends(get_db)):
    if (date_to - date_from).days > 92:
        raise AppError("At most 92 days per request")
    rows = leave.list_requests(db, {"department_id": department_id, "date_from": date_from, "date_to": date_to})
    return [r for r in rows if r["status"] in ("approved", "pending")]

