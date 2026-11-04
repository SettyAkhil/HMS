"""Employee self-service: everything is resolved from the caller's own login,
never from an id in the request, so nobody can read a colleague's record by
changing a URL."""

from datetime import date, datetime, timedelta, timezone

from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from app.errors import NotFound
from app.models import Employee, EmployeeDepartment
from app.models.engagement import Announcement
from app.models.payroll import Payslip
from app.models.talent import ExpiryAlert
from app.models.workforce import AttendanceRecord, LeaveRequest, ShiftAssignment
from app.security import Principal
from app.services import attendance_engine as engine
from app.services import employees as employee_svc
from app.services import leave, shifts, talent, workflow
from app.services.common import actor_of, audit, tenant_of


def me(db: Session, principal: Principal) -> Employee:
    emp = employee_svc.employee_for_user(db, principal.username)
    if emp is None:
        raise NotFound("Your login is not linked to an employee record. Ask HR to add your HMS username to your profile.")
    return emp


def overview(db: Session, principal: Principal) -> dict:
    emp = me(db, principal)
    today = datetime.now(engine.tz()).date()
    rec = db.scalar(select(AttendanceRecord).where(AttendanceRecord.employee_id == emp.id,
                                                   AttendanceRecord.work_date == today))
    upcoming = shifts.assignments(db, today, today + timedelta(days=13), employee_id=emp.id, published_only=True)
    pending = db.scalars(select(LeaveRequest).where(LeaveRequest.employee_id == emp.id,
                                                    LeaveRequest.status == "pending")).all()
    return {
        "employee": employee_svc.employee_detail(db, emp.id, show_personal=True),
        "today": {"status": rec.status if rec else None, "first_in": rec.first_in if rec else None,
                  "worked_minutes": rec.worked_minutes if rec else 0},
        "upcoming_shifts": upcoming,
        "leave_balances": leave.balances_for(db, emp.id, today.year),
        "pending_leave": [leave.request_out(db, r) for r in pending],
        "my_requests": workflow.inbox(db, principal, status="pending", mine=True),
        "announcements": announcements_for(db, emp)[:5],
    }


def announcements_for(db: Session, emp: Employee) -> list[dict]:
    now = datetime.now(timezone.utc)
    depts = {str(d) for d in db.scalars(select(EmployeeDepartment.department_id).where(
        EmployeeDepartment.employee_id == emp.id, EmployeeDepartment.effective_to.is_(None)))}
    out = []
    for a in db.scalars(select(Announcement).where(Announcement.published_at <= now, or_(
            Announcement.expires_at.is_(None), Announcement.expires_at > now)).order_by(Announcement.published_at.desc())):
        aud = a.audience or {}
        if aud.get("all") or depts & set(aud.get("departments", [])) or emp.employee_category in aud.get("categories", []):
            out.append({"id": a.id, "title": a.title, "body": a.body, "priority": a.priority,
                        "published_at": a.published_at, "by": a.created_by})
    return out


def notifications(db: Session, principal: Principal) -> list[dict]:
    """Derived on every read from the records themselves (the same way the
    HMS notification bell derives its other items), so nothing is stored
    twice and nothing can go stale."""
    items = []
    for inst in workflow.inbox(db, principal, status="pending"):
        items.append({"id": f"approval-{inst['id']}", "kind": "approval", "severity": "warning",
                      "title": "Waiting for your approval", "body": inst["title"], "at": inst["created_at"],
                      "target": "approvals"})
    emp = employee_svc.employee_for_user(db, principal.username)
    if emp is None:
        return items
    since = datetime.now(timezone.utc) - timedelta(days=7)
    for r in db.scalars(select(LeaveRequest).where(LeaveRequest.employee_id == emp.id, LeaveRequest.decided_at >= since)):
        items.append({"id": f"leave-{r.id}-{r.status}", "kind": "leave", "severity": "info",
                      "title": f"Leave {r.status}", "body": f"{r.start_date} – {r.end_date}", "at": r.decided_at,
                      "target": "my_leave"})
    for a in db.scalars(select(ExpiryAlert).where(ExpiryAlert.employee_id == emp.id, ExpiryAlert.status == "open")):
        items.append({"id": f"expiry-{a.id}", "kind": "expiry", "severity": "warning",
                      "title": f"{a.title} expires {a.due_date}", "body": "Renew it and upload the new copy",
                      "at": a.created_at, "target": "my_documents"})
    for s in db.scalars(select(ShiftAssignment).where(ShiftAssignment.employee_id == emp.id,
                                                      ShiftAssignment.status == "published",
                                                      ShiftAssignment.updated_at >= since,
                                                      ShiftAssignment.work_date >= date.today())).all()[:5]:
        items.append({"id": f"shift-{s.id}-{s.updated_at.timestamp():.0f}", "kind": "shift", "severity": "info",
                      "title": "Roster updated", "body": f"Your duty on {s.work_date} changed", "at": s.updated_at,
                      "target": "my_shifts"})
    for p in db.scalars(select(Payslip).where(Payslip.employee_id == emp.id, Payslip.created_at >= since,
                                              Payslip.void.is_(False))):
        items.append({"id": f"payslip-{p.id}", "kind": "payslip", "severity": "info", "title": "Payslip available",
                      "body": p.snapshot.get("period"), "at": p.created_at, "target": "my_payslips"})
    for a in announcements_for(db, emp):
        if a["published_at"] >= since:
            items.append({"id": f"announcement-{a['id']}", "kind": "announcement",
                          "severity": "warning" if a["priority"] == "important" else "info",
                          "title": a["title"], "body": a["body"][:140], "at": a["published_at"], "target": "my_hr"})
    return sorted(items, key=lambda i: i["at"] or since, reverse=True)


def create_announcement(db: Session, data: dict) -> Announcement:
    a = Announcement(tenant_id=tenant_of(db), created_by=actor_of(db),
                     published_at=data.pop("published_at", None) or datetime.now(timezone.utc), **data)
    db.add(a)
    db.flush()
    audit(db, "announcement", a.id, "published", {"title": a.title, "audience": a.audience})
    return a


def list_announcements(db: Session):
    return db.scalars(select(Announcement).order_by(Announcement.published_at.desc()).limit(200)).all()


def my_training(db: Session, principal: Principal):
    emp = me(db, principal)
    return talent.certifications(db, emp.id)



def colleagues(db: Session, principal: Principal, day: date) -> list[dict]:
    """Department colleagues and whether they are free on `day` -- names and
    roster state only, enough to ask someone to cover a shift."""
    emp = me(db, principal)
    depts = select(EmployeeDepartment.department_id).where(EmployeeDepartment.employee_id == emp.id,
                                                           EmployeeDepartment.effective_to.is_(None))
    peers = db.scalars(select(Employee).where(Employee.status == "active", Employee.id != emp.id, Employee.id.in_(
        select(EmployeeDepartment.employee_id).where(EmployeeDepartment.department_id.in_(depts),
                                                     EmployeeDepartment.effective_to.is_(None))))
        .order_by(Employee.first_name)).all()
    out = []
    for p in peers:
        a = db.scalar(select(ShiftAssignment).where(ShiftAssignment.employee_id == p.id, ShiftAssignment.work_date == day,
                                                    ShiftAssignment.status == "published"))
        on_leave = db.scalar(select(LeaveRequest.id).where(LeaveRequest.employee_id == p.id,
                                                           LeaveRequest.status == "approved",
                                                           LeaveRequest.start_date <= day, LeaveRequest.end_date >= day))
        state = "on_leave" if on_leave else "working" if a and not a.is_weekly_off else "free"
        out.append({"employee_id": p.id, "name": employee_svc.full_name(p), "category": p.employee_category, "state": state})
    return out
