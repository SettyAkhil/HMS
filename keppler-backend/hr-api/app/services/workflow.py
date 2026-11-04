"""Configurable approval engine shared by every HR request type.

A request snapshots the steps whose condition matches its context when it is
raised, so editing a workflow later never changes requests already in flight.
Each step names who may act: the requester's reporting manager, the head of
the requester's primary department, or anyone holding a permission. The
requester can never approve their own request (unless the workflow says so),
an approver may delegate the step to a named user, and a step that waits past
`escalate_after_hours` opens to holders of its fallback permission.

The domain that raised the request registers a callback per workflow code;
the engine calls it, in the same transaction, when the request is finally
approved, rejected or cancelled."""

import uuid
from datetime import datetime, timedelta, timezone
from typing import Callable

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.errors import AppError, Conflict, Forbidden, NotFound
from app.models import Department, Employee, EmployeeDepartment
from app.models.workforce import ApprovalAction, ApprovalInstance, ApprovalStep, ApprovalWorkflow
from app.security import Principal
from app.services.common import actor_of, audit, emit, tenant_of

# Defaults provisioned per tenant on first use; every one is editable via the API.
DEFAULT_WORKFLOWS: dict[str, tuple[str, list[dict]]] = {
    "leave": ("Leave request", [
        {"name": "Reporting manager", "approver_type": "reporting_manager", "permission": "hr.leaves.write"},
        {"name": "HR", "approver_type": "permission", "permission": "hr.leaves.write",
         "condition": {"field": "days", "op": "gte", "value": 3}},
    ]),
    "attendance_correction": ("Attendance correction", [
        {"name": "Reporting manager", "approver_type": "reporting_manager", "permission": "hr.attendance.write"},
    ]),
    "shift_swap": ("Shift swap / replacement", [
        {"name": "Department head", "approver_type": "department_head", "permission": "hr.shifts.write"},
    ]),
    "overtime": ("Overtime", [
        {"name": "Reporting manager", "approver_type": "reporting_manager", "permission": "hr.attendance.write"},
    ]),
    "transfer": ("Employee transfer", [
        {"name": "HR", "approver_type": "permission", "permission": "employees.profile.write"},
    ]),
    "requisition": ("Manpower requisition", [
        {"name": "Department head", "approver_type": "department_head", "permission": "hr.recruitment.write"},
        {"name": "HR", "approver_type": "permission", "permission": "hr.recruitment.write"},
    ]),
    "payroll": ("Payroll approval", [
        {"name": "Payroll approver", "approver_type": "permission", "permission": "hr.payroll.write"},
    ]),
    "exit": ("Employee exit", [
        {"name": "Reporting manager", "approver_type": "reporting_manager", "permission": "employees.profile.write"},
        {"name": "HR", "approver_type": "permission", "permission": "employees.profile.write"},
    ]),
    "grievance_closure": ("Grievance closure", [
        {"name": "Grievance committee", "approver_type": "permission", "permission": "hr.grievances.manage"},
    ]),
}

Callback = Callable[[Session, ApprovalInstance, str], None]
_callbacks: dict[str, Callback] = {}


def on_decision(code: str):
    def register(fn: Callback) -> Callback:
        _callbacks[code] = fn
        return fn
    return register


def ensure_defaults(db: Session) -> None:
    existing = set(db.scalars(select(ApprovalWorkflow.code)).all())
    for code, (name, steps) in DEFAULT_WORKFLOWS.items():
        if code in existing:
            continue
        wf = ApprovalWorkflow(tenant_id=tenant_of(db), code=code, name=name, created_by="system")
        db.add(wf)
        db.flush()
        for i, s in enumerate(steps, start=1):
            db.add(ApprovalStep(tenant_id=tenant_of(db), workflow_id=wf.id, sequence=i, created_by="system",
                                **{"condition": None, **s}))
    db.flush()


def _matches(condition: dict | None, context: dict) -> bool:
    if not condition:
        return True
    value = context.get(condition.get("field"))
    target = condition.get("value")
    if value is None:
        return False
    # Lambdas, not values: evaluating every comparison up front made a numeric
    # condition raise on the "in" entry and silently never match.
    ops = {
        "eq": lambda: value == target, "ne": lambda: value != target,
        "gte": lambda: float(value) >= float(target), "gt": lambda: float(value) > float(target),
        "lte": lambda: float(value) <= float(target), "lt": lambda: float(value) < float(target),
        "in": lambda: value in (target or []),
    }
    try:
        return bool(ops[condition.get("op", "eq")]())
    except (KeyError, TypeError, ValueError):
        return False


def start(db: Session, code: str, entity_type: str, entity_id, title: str, requester: Employee | None,
          requester_username: str, context: dict) -> ApprovalInstance:
    ensure_defaults(db)
    wf = db.scalar(select(ApprovalWorkflow).where(ApprovalWorkflow.code == code))
    if wf is None or not wf.active:
        raise AppError(f"No active approval workflow for {code}")
    steps = db.scalars(select(ApprovalStep).where(ApprovalStep.workflow_id == wf.id)
                       .order_by(ApprovalStep.sequence)).all()
    snapshot = [
        {"name": s.name, "approver_type": s.approver_type, "permission": s.permission,
         "escalate_after_hours": s.escalate_after_hours}
        for s in steps if _matches(s.condition, context)
    ]
    now = datetime.now(timezone.utc)
    inst = ApprovalInstance(
        tenant_id=tenant_of(db), workflow_code=code, entity_type=entity_type, entity_id=str(entity_id),
        title=title, requester_employee_id=requester.id if requester else None,
        requester_username=requester_username, steps=snapshot, current_index=0, current_since=now,
        context={**context, "allow_self_approval": wf.allow_self_approval}, created_by=actor_of(db),
        status="pending" if snapshot else "approved", decided_at=None if snapshot else now,
    )
    db.add(inst)
    db.flush()
    audit(db, "approval", inst.id, "submitted", {"workflow": code, "entity": f"{entity_type}:{entity_id}"})
    emit(db, f"approval.{code}.submitted", inst.id, {"instance_id": inst.id, "entity_type": entity_type,
                                                     "entity_id": str(entity_id), "title": title})
    if not snapshot:  # no step applies: approved by policy
        _finish(db, inst, "approved")
    return inst


def _requester(db: Session, inst: ApprovalInstance) -> Employee | None:
    return db.get(Employee, inst.requester_employee_id) if inst.requester_employee_id else None


def _designated_usernames(db: Session, inst: ApprovalInstance, step: dict) -> set[str]:
    req = _requester(db, inst)
    if req is None:
        return set()
    if step["approver_type"] == "reporting_manager" and req.reporting_manager_id:
        mgr = db.get(Employee, req.reporting_manager_id)
        return {mgr.hms_username} if mgr and mgr.hms_username else set()
    if step["approver_type"] == "department_head":
        dept_id = db.scalar(select(EmployeeDepartment.department_id).where(
            EmployeeDepartment.employee_id == req.id, EmployeeDepartment.is_primary,
            EmployeeDepartment.effective_to.is_(None)))
        dept = db.get(Department, dept_id) if dept_id else None
        head = db.get(Employee, dept.head_employee_id) if dept and dept.head_employee_id else None
        return {head.hms_username} if head and head.hms_username else set()
    return set()


def can_act(db: Session, inst: ApprovalInstance, principal: Principal) -> tuple[bool, str]:
    if inst.status != "pending":
        return False, "This request is already decided"
    if principal.username == inst.requester_username and not inst.context.get("allow_self_approval"):
        return False, "You cannot approve your own request"
    step = inst.steps[inst.current_index]
    if inst.delegated_to:
        return (principal.username == inst.delegated_to, "This step was delegated to someone else")
    designated = _designated_usernames(db, inst, step)
    if principal.username in designated:
        return True, ""
    # Permission steps, steps with nobody designated (no manager on record),
    # and escalated steps fall to holders of the step's permission.
    if step.get("permission") and principal.can(step["permission"]):
        if step["approver_type"] == "permission" or not designated or inst.escalated or principal.is_admin:
            return True, ""
    return False, f"Waiting for {step['name']}"


def act(db: Session, instance_id: uuid.UUID, principal: Principal, action: str, comment: str | None,
        delegate_to: str | None = None) -> ApprovalInstance:
    inst = db.get(ApprovalInstance, instance_id)
    if inst is None:
        raise NotFound("Approval request not found")
    if action == "cancel":
        if principal.username != inst.requester_username and not principal.is_admin:
            raise Forbidden("Only the requester can withdraw a request")
        if inst.status != "pending":
            raise Conflict("Only pending requests can be withdrawn")
        _record(db, inst, action, comment)
        _finish(db, inst, "cancelled")
        return inst
    ok, why = can_act(db, inst, principal)
    if not ok:
        raise Forbidden(why)
    if action == "reject" and not (comment or "").strip():
        raise AppError("Give a reason when rejecting")
    if action == "delegate":
        if not delegate_to or delegate_to == inst.requester_username:
            raise AppError("Delegate to another named user")
        inst.delegated_to = delegate_to
        _record(db, inst, action, comment, delegate_to)
        return inst
    _record(db, inst, action, comment)
    if action == "reject":
        _finish(db, inst, "rejected")
    elif action == "approve":
        if inst.current_index + 1 < len(inst.steps):
            inst.current_index += 1
            inst.current_since = datetime.now(timezone.utc)
            inst.delegated_to = None
            inst.escalated = False
        else:
            _finish(db, inst, "approved")
    else:
        raise AppError("Unknown action")
    return inst


def _record(db: Session, inst: ApprovalInstance, action: str, comment: str | None, delegated_to: str | None = None):
    db.add(ApprovalAction(tenant_id=inst.tenant_id, instance_id=inst.id, step_index=inst.current_index,
                          actor=actor_of(db), action=action, comment=comment, delegated_to=delegated_to,
                          created_by=actor_of(db)))
    audit(db, "approval", inst.id, action, {"step": inst.current_index, "comment": comment})


def _finish(db: Session, inst: ApprovalInstance, outcome: str) -> None:
    inst.status = outcome
    inst.decided_at = datetime.now(timezone.utc)
    db.flush()
    callback = _callbacks.get(inst.workflow_code)
    if callback:
        callback(db, inst, outcome)
    emit(db, f"approval.{inst.workflow_code}.{outcome}", inst.id,
         {"instance_id": inst.id, "entity_type": inst.entity_type, "entity_id": inst.entity_id})


def escalate_overdue(db: Session) -> int:
    now = datetime.now(timezone.utc)
    count = 0
    for inst in db.scalars(select(ApprovalInstance).where(ApprovalInstance.status == "pending",
                                                          ApprovalInstance.escalated.is_(False))):
        hours = inst.steps[inst.current_index].get("escalate_after_hours")
        if hours and inst.current_since and now - inst.current_since > timedelta(hours=hours):
            inst.escalated = True
            emit(db, "approval.escalated", inst.id, {"instance_id": inst.id, "title": inst.title,
                                                     "step": inst.steps[inst.current_index]["name"]})
            count += 1
    return count


def instance_out(db: Session, inst: ApprovalInstance, principal: Principal | None = None) -> dict:
    actions = db.scalars(select(ApprovalAction).where(ApprovalAction.instance_id == inst.id)
                         .order_by(ApprovalAction.created_at)).all()
    can, why = can_act(db, inst, principal) if principal else (False, "")
    req = _requester(db, inst)
    return {
        "id": inst.id, "workflow_code": inst.workflow_code, "entity_type": inst.entity_type,
        "entity_id": inst.entity_id, "title": inst.title, "status": inst.status,
        "requester_username": inst.requester_username,
        "requester_name": " ".join(p for p in (req.first_name, req.last_name) if p) if req else None,
        "steps": inst.steps, "current_index": inst.current_index, "current_since": inst.current_since,
        "delegated_to": inst.delegated_to, "escalated": inst.escalated, "context": inst.context,
        "created_at": inst.created_at, "decided_at": inst.decided_at,
        "can_act": can, "waiting_reason": None if can else why,
        "actions": [{"actor": a.actor, "action": a.action, "comment": a.comment, "step_index": a.step_index,
                     "delegated_to": a.delegated_to, "at": a.created_at} for a in actions],
    }


def inbox(db: Session, principal: Principal, status: str = "pending", mine: bool = False) -> list[dict]:
    stmt = select(ApprovalInstance).order_by(ApprovalInstance.created_at.desc()).limit(300)
    if status:
        stmt = stmt.where(ApprovalInstance.status == status)
    if mine:
        stmt = stmt.where(ApprovalInstance.requester_username == principal.username)
    rows = [instance_out(db, i, principal) for i in db.scalars(stmt)]
    return rows if mine or status != "pending" else [r for r in rows if r["can_act"]]


# --- workflow configuration ------------------------------------------------


def list_workflows(db: Session) -> list[dict]:
    ensure_defaults(db)
    out = []
    for wf in db.scalars(select(ApprovalWorkflow).order_by(ApprovalWorkflow.code)):
        steps = db.scalars(select(ApprovalStep).where(ApprovalStep.workflow_id == wf.id)
                           .order_by(ApprovalStep.sequence)).all()
        out.append({"id": wf.id, "code": wf.code, "name": wf.name, "active": wf.active,
                    "allow_self_approval": wf.allow_self_approval,
                    "steps": [{"sequence": s.sequence, "name": s.name, "approver_type": s.approver_type,
                               "permission": s.permission, "condition": s.condition,
                               "escalate_after_hours": s.escalate_after_hours} for s in steps]})
    return out


def replace_steps(db: Session, code: str, data: dict) -> dict:
    ensure_defaults(db)
    wf = db.scalar(select(ApprovalWorkflow).where(ApprovalWorkflow.code == code))
    if wf is None:
        raise NotFound("Workflow not found")
    for key in ("active", "allow_self_approval", "name"):
        if data.get(key) is not None:
            setattr(wf, key, data[key])
    for s in db.scalars(select(ApprovalStep).where(ApprovalStep.workflow_id == wf.id)):
        db.delete(s)
    db.flush()
    for i, s in enumerate(data["steps"], start=1):
        db.add(ApprovalStep(tenant_id=tenant_of(db), workflow_id=wf.id, sequence=i, created_by=actor_of(db), **s))
    audit(db, "approval_workflow", wf.id, "configured", {"steps": data["steps"]})
    db.flush()
    return next(w for w in list_workflows(db) if w["code"] == code)
