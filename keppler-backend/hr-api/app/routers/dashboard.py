"""HR dashboard figures, computed from records on every request (no cached
or seeded numbers). Areas that later phases own (leave, payroll, recruitment,
training) are absent from the response until their data exists, rather than
reported as zero."""

import uuid
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends
from sqlalchemy import case, exists, func, select
from sqlalchemy.orm import Session

from app.config import settings
from app.models import (
    BiometricDevice,
    AuditLog,
    Branch,
    Department,
    Employee,
    EmployeeCredential,
    EmployeeDepartment,
    EmployeeHistory,
)
from app.security import PAYROLL_WRITE, Principal, get_db, require_hr_read
from app.models.payroll import PayrollRun
from app.models.talent import Application, EmployeeCertification, ExpiryAlert, Vacancy
from app.models.workforce import ApprovalInstance, AttendanceException, AttendanceRecord, LeaveRequest
from app.services import attendance as att
from app.services import workflow
from app.services.talent import training_matrix
from app.services.employees import full_name

router = APIRouter(prefix="/api/v1/hr/dashboard", tags=["dashboard"])


@router.get("")
def dashboard(
    branch_id: uuid.UUID | None = None,
    department_id: uuid.UUID | None = None,
    employee_category: str | None = None,
    expiring_within_days: int = 60,
    principal: Principal = Depends(require_hr_read),
    db: Session = Depends(get_db),
):
    scope = [Employee.deleted_at.is_(None)]
    if branch_id:
        scope.append(Employee.branch_id == branch_id)
    if employee_category:
        scope.append(Employee.employee_category == employee_category)
    if department_id:
        scope.append(exists().where(EmployeeDepartment.employee_id == Employee.id,
                                    EmployeeDepartment.department_id == department_id,
                                    EmployeeDepartment.effective_to.is_(None)).correlate(Employee))

    by_status = dict(db.execute(select(Employee.status, func.count()).where(*scope).group_by(Employee.status)).all())
    active = [*scope, Employee.status == "active"]
    by_category = dict(db.execute(select(Employee.employee_category, func.count()).where(*active)
                                  .group_by(Employee.employee_category)).all())
    by_branch = [{"branch": name or "Unassigned", "count": n} for name, n in db.execute(
        select(Branch.name, func.count()).select_from(Employee).outerjoin(Branch, Branch.id == Employee.branch_id)
        .where(*active).group_by(Branch.name).order_by(func.count().desc())).all()]
    by_department = [{"department_id": did, "department": name, "count": n} for did, name, n in db.execute(
        select(Department.id, Department.name, func.count(func.distinct(Employee.id)))
        .join(EmployeeDepartment, EmployeeDepartment.department_id == Department.id)
        .join(Employee, Employee.id == EmployeeDepartment.employee_id)
        .where(*active, EmployeeDepartment.effective_to.is_(None), Department.deleted_at.is_(None))
        .group_by(Department.id, Department.name).order_by(func.count(func.distinct(Employee.id)).desc())).all()]

    today = datetime.now(ZoneInfo(settings.timezone)).date()
    horizon = today + timedelta(days=max(1, min(expiring_within_days, 365)))
    expiring = [{
        "employee_id": e.id, "employee_code": e.employee_code, "employee_name": full_name(e),
        "credential_type": c.credential_type, "number": c.number, "expires_on": c.expires_on,
        "days_left": (c.expires_on - today).days,
    } for c, e in db.execute(
        select(EmployeeCredential, Employee).join(Employee, Employee.id == EmployeeCredential.employee_id)
        .where(*active, EmployeeCredential.deleted_at.is_(None), EmployeeCredential.expires_on.is_not(None),
               EmployeeCredential.expires_on <= horizon)
        .order_by(EmployeeCredential.expires_on).limit(50)).all()]

    live = att.live_board(db, today, {"branch_id": branch_id, "department_id": department_id,
                                      "employee_category": employee_category})
    recent = [{
        "employee_id": h.employee_id, "employee_name": full_name(e), "event_type": h.event_type,
        "summary": h.summary, "occurred_at": h.occurred_at, "actor": h.created_by,
    } for h, e in db.execute(
        select(EmployeeHistory, Employee).join(Employee, Employee.id == EmployeeHistory.employee_id)
        .where(*scope).order_by(EmployeeHistory.occurred_at.desc()).limit(15)).all()]
    unverified = db.scalar(select(func.count()).select_from(EmployeeCredential).join(
        Employee, Employee.id == EmployeeCredential.employee_id).where(
        *active, EmployeeCredential.verification_status == "pending", EmployeeCredential.deleted_at.is_(None))) or 0

    result = {
        "as_of": today,
        "employees": {
            "total": sum(by_status.values()), "active": by_status.get("active", 0),
            "inactive": sum(v for k, v in by_status.items() if k != "active"), "by_status": by_status,
            "by_category": by_category, "by_branch": by_branch, "by_department": by_department,
        },
        "attendance_today": {**live["counts"], "devices": live["devices"], "last_sync_at": live["last_sync_at"]},
        "credentials": {"expiring": expiring, "pending_verification": unverified},
        "recent_activity": recent,
        "workforce": _workforce_figures(db, today),
        "attendance_trend": _trend(db, today, scope),
        "department_presence": _department_presence(db, today),
        "attention": _attention(db, today, principal),
        "audit_events_today": db.scalar(select(func.count()).select_from(AuditLog).where(
            AuditLog.created_at >= datetime.combine(today, datetime.min.time(), ZoneInfo(settings.timezone)))) or 0,
    }
    if result["workforce"]["last_payroll"] and not principal.can(PAYROLL_WRITE):
        result["workforce"]["last_payroll"].pop("net")
    return result



def _workforce_figures(db: Session, today) -> dict:
    """Leave, approvals, payroll, recruitment and training figures, each from
    its own records. Payroll totals only reach callers with payroll rights
    (stripped in the route)."""
    run = db.scalar(select(PayrollRun).where(PayrollRun.kind == "regular", PayrollRun.status != "reversed")
                    .order_by(PayrollRun.year.desc(), PayrollRun.month.desc()))
    return {
        "on_leave_today": db.scalar(select(func.count()).select_from(LeaveRequest).where(
            LeaveRequest.status == "approved", LeaveRequest.start_date <= today, LeaveRequest.end_date >= today)) or 0,
        "pending_leave": db.scalar(select(func.count()).select_from(LeaveRequest).where(LeaveRequest.status == "pending")) or 0,
        "pending_approvals": db.scalar(select(func.count()).select_from(ApprovalInstance).where(
            ApprovalInstance.status == "pending")) or 0,
        "open_exceptions": db.scalar(select(func.count()).select_from(AttendanceException).where(
            AttendanceException.status == "open", AttendanceException.work_date >= today - timedelta(days=7))) or 0,
        "open_vacancies": db.scalar(select(func.count()).select_from(Vacancy).where(Vacancy.status == "open")) or 0,
        "candidates_in_pipeline": db.scalar(select(func.count()).select_from(Application).where(
            Application.stage.in_(("applied", "screening", "interview", "selected", "offered")))) or 0,
        "training_gaps": training_matrix(db)["gaps"],
        "certificates_expiring_60d": db.scalar(select(func.count()).select_from(EmployeeCertification).where(
            EmployeeCertification.status == "valid", EmployeeCertification.expires_on <= today + timedelta(days=60))) or 0,
        "last_payroll": {"period": f"{run.year}-{run.month:02d}", "status": run.status, "employees": run.totals.get("employees"),
                         "net": run.totals.get("net")} if run else None,
    }


def _trend(db: Session, today, scope) -> list[dict]:
    """Last 14 days of calculated attendance, grouped for a stacked chart."""
    start = today - timedelta(days=13)
    rows = db.execute(select(AttendanceRecord.work_date, AttendanceRecord.status, func.count(),
                             func.sum(case((AttendanceRecord.late_minutes > 0, 1), else_=0)))
                      .join(Employee, Employee.id == AttendanceRecord.employee_id)
                      .where(*scope, AttendanceRecord.work_date >= start, AttendanceRecord.work_date <= today)
                      .group_by(AttendanceRecord.work_date, AttendanceRecord.status)).all()
    days = {start + timedelta(days=i): {"present": 0, "absent": 0, "leave": 0, "exceptions": 0, "late": 0} for i in range(14)}
    group = {"present": "present", "in_progress": "present", "half_day": "present", "absent": "absent",
             "on_leave": "leave", "half_day_leave": "leave", "missing_punch": "exceptions"}
    for d, status, n, late in rows:
        if status in group:
            days[d][group[status]] += n
        days[d]["late"] += late or 0
    return [{"date": d, **v} for d, v in sorted(days.items())]


def _department_presence(db: Session, today) -> list[dict]:
    rows = db.execute(select(Department.id, Department.name, AttendanceRecord.status, func.count())
                      .join(EmployeeDepartment, EmployeeDepartment.department_id == Department.id)
                      .join(AttendanceRecord, (AttendanceRecord.employee_id == EmployeeDepartment.employee_id)
                            & (AttendanceRecord.work_date == today))
                      .where(EmployeeDepartment.is_primary, EmployeeDepartment.effective_to.is_(None),
                             Department.deleted_at.is_(None))
                      .group_by(Department.id, Department.name, AttendanceRecord.status)).all()
    out: dict = {}
    bucket = {"present": "present", "in_progress": "present", "half_day": "present", "missing_punch": "present",
              "absent": "absent", "scheduled": "not_arrived", "on_leave": "leave", "half_day_leave": "leave"}
    for did, name, status, n in rows:
        d = out.setdefault(did, {"department_id": did, "department": name, "scheduled": 0, "present": 0,
                                 "absent": 0, "not_arrived": 0, "leave": 0})
        if status in bucket:
            d[bucket[status]] += n
            if bucket[status] != "leave":
                d["scheduled"] += n
    return sorted(out.values(), key=lambda x: -x["scheduled"])


def _attention(db: Session, today, principal: Principal) -> list[dict]:
    """The few things worth acting on today, most urgent first."""
    items = []
    mine = workflow.inbox(db, principal, "pending")
    if mine:
        items.append({"kind": "approvals", "severity": "warning", "count": len(mine),
                      "title": f"{len(mine)} request{'s' if len(mine) != 1 else ''} waiting for your approval",
                      "detail": mine[0]["title"], "section": "approvals"})
    missing = db.scalar(select(func.count()).select_from(AttendanceException).where(
        AttendanceException.status == "open", AttendanceException.kind == "missing_out",
        AttendanceException.work_date >= today - timedelta(days=7))) or 0
    if missing:
        items.append({"kind": "missing_punch", "severity": "warning", "count": missing,
                      "title": f"{missing} missing check-outs this week", "detail": "Ask staff to raise corrections",
                      "section": "attendance"})
    expired = db.scalar(select(func.count()).select_from(EmployeeCredential).join(Employee).where(
        Employee.status == "active", EmployeeCredential.deleted_at.is_(None), EmployeeCredential.expires_on < today)) or 0
    soon = db.scalar(select(func.count()).select_from(EmployeeCredential).join(Employee).where(
        Employee.status == "active", EmployeeCredential.deleted_at.is_(None), EmployeeCredential.expires_on >= today,
        EmployeeCredential.expires_on <= today + timedelta(days=30))) or 0
    if expired or soon:
        items.append({"kind": "credentials", "severity": "critical" if expired else "warning", "count": expired + soon,
                      "title": ", ".join(p for p in (
                          f"{expired} registration{'s' if expired != 1 else ''} expired" if expired else "",
                          f"{soon} expiring in 30 days" if soon else "") if p),
                      "detail": "Clinical staff must hold a current registration", "section": "compliance"})
    gaps = training_matrix(db)["gaps"]
    if gaps:
        items.append({"kind": "training", "severity": "info", "count": gaps, "title": f"{gaps} mandatory training gaps",
                      "detail": "Missing or expired BLS, fire safety and similar", "section": "training"})
    contracts = db.scalar(select(func.count()).select_from(Employee).where(
        Employee.status == "active", Employee.contract_end_date.is_not(None),
        Employee.contract_end_date <= today + timedelta(days=30))) or 0
    if contracts:
        items.append({"kind": "contracts", "severity": "info", "count": contracts,
                      "title": f"{contracts} contract{'s' if contracts != 1 else ''} ending within 30 days",
                      "detail": "Renew or plan replacements", "section": "employees"})
    offline = db.scalar(select(func.count()).select_from(BiometricDevice).where(
        BiometricDevice.deleted_at.is_(None), BiometricDevice.enabled, BiometricDevice.status == "offline")) or 0
    if offline:
        items.append({"kind": "devices", "severity": "critical", "count": offline,
                      "title": f"{offline} biometric device{'s' if offline != 1 else ''} offline",
                      "detail": "Punches from them are not arriving", "section": "attendance"})
    order = {"critical": 0, "warning": 1, "info": 2}
    return sorted(items, key=lambda i: order[i["severity"]])


@router.get("/badges")
def badges(principal: Principal = Depends(require_hr_read), db: Session = Depends(get_db)):
    """Small counts for the HR navigation."""
    today = datetime.now(ZoneInfo(settings.timezone)).date()
    return {
        "approvals": len(workflow.inbox(db, principal, "pending")),
        "attendance": db.scalar(select(func.count()).select_from(AttendanceException).where(
            AttendanceException.status == "open", AttendanceException.kind.in_(("missing_out", "missing_in")),
            AttendanceException.work_date >= today - timedelta(days=7))) or 0,
        "compliance": db.scalar(select(func.count()).select_from(ExpiryAlert).where(ExpiryAlert.status == "open")) or 0,
        "leave": db.scalar(select(func.count()).select_from(LeaveRequest).where(LeaveRequest.status == "pending")) or 0,
    }
