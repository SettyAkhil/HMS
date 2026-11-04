"""A department head's view of their own people. Scope comes from headship
(departments.head_employee_id), not from a permission: a head sees exactly
the departments they lead and nothing else."""

import uuid
from collections import Counter
from datetime import datetime, timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.errors import Forbidden
from app.models import Department, Designation, Employee, EmployeeDepartment
from app.models.talent import EmployeeCertification, TrainingProgram
from app.models.workforce import ApprovalInstance, AttendanceRecord, LeaveRequest
from app.services import attendance_engine as engine
from app.services.employees import employee_for_user, full_name

PRESENT = {"present", "in_progress", "half_day"}


def led_departments(db: Session, username: str) -> tuple[Employee | None, list[Department]]:
    me = employee_for_user(db, username)
    if me is None:
        return None, []
    return me, db.scalars(select(Department).where(Department.head_employee_id == me.id,
                                                   Department.deleted_at.is_(None))).all()


def members(db: Session, dept_ids: list[uuid.UUID]) -> list[Employee]:
    if not dept_ids:
        return []
    return db.scalars(select(Employee).join(EmployeeDepartment, EmployeeDepartment.employee_id == Employee.id).where(
        EmployeeDepartment.department_id.in_(dept_ids), EmployeeDepartment.effective_to.is_(None),
        Employee.status == "active", Employee.deleted_at.is_(None)).distinct()).all()


def overview(db: Session, username: str) -> dict:
    me, depts = led_departments(db, username)
    if not depts:
        raise Forbidden("You are not recorded as the head of any department")
    team = members(db, [d.id for d in depts])
    ids = [e.id for e in team]
    today = datetime.now(engine.tz()).date()
    recs = {r.employee_id: r for r in db.scalars(select(AttendanceRecord).where(
        AttendanceRecord.employee_id.in_(ids), AttendanceRecord.work_date == today))}
    on_leave = set(db.scalars(select(LeaveRequest.employee_id).where(
        LeaveRequest.employee_id.in_(ids), LeaveRequest.status == "approved",
        LeaveRequest.start_date <= today, LeaveRequest.end_date >= today)))
    desig = {d.id: d.title for d in db.scalars(select(Designation))}
    people = []
    for e in sorted(team, key=full_name):
        r = recs.get(e.id)
        status = "on_leave" if e.id in on_leave else (r.status if r else "no_record")
        people.append({"id": e.id, "code": e.employee_code, "name": full_name(e), "designation": desig.get(e.designation_id),
                       "category": e.employee_category, "status": status,
                       "first_in": r.first_in if r else None, "late_minutes": r.late_minutes if r else 0})
    window = db.scalars(select(AttendanceRecord).where(AttendanceRecord.employee_id.in_(ids),
                                                       AttendanceRecord.work_date >= today - timedelta(days=13),
                                                       AttendanceRecord.work_date < today)).all()
    days: dict = {}
    for r in window:
        d = days.setdefault(r.work_date, Counter())
        d["present" if r.status in PRESENT else r.status] += 1
        d["late"] += 1 if r.late_minutes > 0 else 0
    pending_leave = db.scalars(select(LeaveRequest).where(LeaveRequest.employee_id.in_(ids), LeaveRequest.status == "pending")
                               .order_by(LeaveRequest.start_date)).all()
    approvals = db.scalars(select(ApprovalInstance).where(ApprovalInstance.requester_employee_id.in_(ids),
                                                          ApprovalInstance.status == "pending")
                           .order_by(ApprovalInstance.created_at)).all()
    programs = {p.id: p.name for p in db.scalars(select(TrainingProgram))}
    expiring = db.scalars(select(EmployeeCertification).where(
        EmployeeCertification.employee_id.in_(ids), EmployeeCertification.status == "valid",
        EmployeeCertification.expires_on <= today + timedelta(days=60)).order_by(EmployeeCertification.expires_on)).all()
    names = {e.id: full_name(e) for e in team}
    tally = Counter(p["status"] for p in people)
    return {
        "head": {"id": me.id, "name": full_name(me)},
        "departments": [{"id": d.id, "name": d.name} for d in depts],
        "headcount": len(team),
        "today": {"present": sum(v for k, v in tally.items() if k in PRESENT), "absent": tally["absent"],
                  "on_leave": tally["on_leave"], "not_in_yet": tally["no_record"] + tally["scheduled"],
                  "late": sum(1 for p in people if p["late_minutes"] > 0)},
        "people": people,
        "trend": [{"date": d, "present": c["present"], "absent": c["absent"], "leave": c["leave"], "late": c["late"]}
                  for d, c in sorted(days.items())],
        "pending_leave": [{"id": r.id, "employee": names.get(r.employee_id), "start_date": r.start_date,
                           "end_date": r.end_date, "days": r.days, "reason": r.reason,
                           "approval_instance_id": r.approval_instance_id} for r in pending_leave],
        "approvals": [{"id": a.id, "title": a.title, "workflow_code": a.workflow_code, "since": a.created_at,
                       "requester": names.get(a.requester_employee_id)} for a in approvals],
        "expiring_certifications": [{"employee": names.get(c.employee_id), "program": programs.get(c.program_id),
                                     "expires_on": c.expires_on, "expired": c.expires_on < today} for c in expiring],
    }
