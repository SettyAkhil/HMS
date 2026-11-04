"""HR report catalogue. Each report declares the permission it needs beyond
report access (payroll figures need payroll rights, grievance figures need
grievance rights) and returns columns + rows computed from live records.
Scheduled runs write their CSV to private storage for the named recipients."""

import calendar
import csv
import io
import uuid
from collections import Counter, defaultdict
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from typing import Callable

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.config import settings
from app.errors import AppError, Forbidden, NotFound
from app.models import Branch, Department, Designation, Employee, EmployeeCredential, EmployeeDepartment
from app.models.engagement import ReportRun, ReportSchedule
from app.models.payroll import PayrollItem, PayrollRun
from app.models.talent import Application, ComplianceRecord, GrievanceCase, PerformanceReview, ReviewCycle, Vacancy
from app.models.workforce import AttendanceRecord, LeaveBalance, LeaveRequest, LeaveType, OvertimeRecord, ShiftAssignment, ShiftTemplate
from app.security import GRIEVANCES_MANAGE, PAYROLL_WRITE, REPORTS_READ, Principal
from app.services.common import actor_of, audit, tenant_of
from app.services.employees import full_name

Report = tuple[list[tuple[str, str]], list[dict]]


def _range(f: dict) -> tuple[date, date]:
    end = f.get("date_to") or date.today()
    start = f.get("date_from") or end.replace(day=1)
    if (end - start).days > 400:
        raise AppError("Reports cover at most 400 days")
    return start, end


def _employees(db: Session, f: dict, active_only=True):
    stmt = select(Employee).where(Employee.deleted_at.is_(None))
    if active_only:
        stmt = stmt.where(Employee.status == "active")
    if f.get("branch_id"):
        stmt = stmt.where(Employee.branch_id == f["branch_id"])
    if f.get("employee_category"):
        stmt = stmt.where(Employee.employee_category == f["employee_category"])
    if f.get("department_id"):
        stmt = stmt.where(Employee.id.in_(select(EmployeeDepartment.employee_id).where(
            EmployeeDepartment.department_id == f["department_id"], EmployeeDepartment.effective_to.is_(None))))
    return db.scalars(stmt.order_by(Employee.first_name)).all()


def _primary_depts(db: Session) -> dict:
    return dict(db.execute(select(EmployeeDepartment.employee_id, Department.name).join(
        Department, Department.id == EmployeeDepartment.department_id).where(
        EmployeeDepartment.is_primary, EmployeeDepartment.effective_to.is_(None))).all())


def employee_register(db: Session, f: dict) -> Report:
    depts = _primary_depts(db)
    des = {d.id: d.title for d in db.scalars(select(Designation))}
    br = {b.id: b.name for b in db.scalars(select(Branch))}
    rows = [{"code": e.employee_code, "name": full_name(e), "category": e.employee_category, "designation": des.get(e.designation_id),
             "department": depts.get(e.id), "branch": br.get(e.branch_id), "type": e.employment_type, "status": e.status,
             "joining_date": e.joining_date} for e in _employees(db, f, active_only=f.get("status") != "all")]
    return [("code", "Code"), ("name", "Name"), ("category", "Category"), ("designation", "Designation"),
            ("department", "Department"), ("branch", "Branch"), ("type", "Type"), ("status", "Status"),
            ("joining_date", "Joined")], rows


def headcount(db: Session, f: dict) -> Report:
    depts = _primary_depts(db)
    counts = Counter((depts.get(e.id) or "Unassigned", e.employee_category) for e in _employees(db, f))
    rows = [{"department": d, "category": c, "headcount": n} for (d, c), n in sorted(counts.items())]
    return [("department", "Department"), ("category", "Category"), ("headcount", "Headcount")], rows


def attendance_summary(db: Session, f: dict) -> Report:
    start, end = _range(f)
    emps = {e.id: e for e in _employees(db, f)}
    agg: dict = defaultdict(lambda: Counter())
    for r in db.scalars(select(AttendanceRecord).where(AttendanceRecord.work_date >= start, AttendanceRecord.work_date <= end,
                                                       AttendanceRecord.employee_id.in_(emps))):
        a = agg[r.employee_id]
        a[r.status] += 1
        a["late_days"] += r.late_minutes > 0
        a["late_minutes"] += r.late_minutes
        a["early_days"] += r.early_minutes > 0
        a["worked_minutes"] += r.worked_minutes
        a["overtime_minutes"] += r.overtime_minutes
    rows = []
    for eid, e in emps.items():
        a = agg[eid]
        rows.append({"code": e.employee_code, "name": full_name(e), "present": a["present"], "half_day": a["half_day"],
                     "absent": a["absent"], "on_leave": a["on_leave"] + a["half_day_leave"], "missing_punch": a["missing_punch"],
                     "late_days": a["late_days"], "late_minutes": a["late_minutes"], "early_days": a["early_days"],
                     "worked_hours": round(a["worked_minutes"] / 60, 1), "overtime_hours": round(a["overtime_minutes"] / 60, 1)})
    return [("code", "Code"), ("name", "Name"), ("present", "Present"), ("half_day", "Half day"), ("absent", "Absent"),
            ("on_leave", "Leave"), ("missing_punch", "Missing punch"), ("late_days", "Late days"),
            ("late_minutes", "Late min"), ("early_days", "Early exits"), ("worked_hours", "Hours worked"),
            ("overtime_hours", "Overtime h")], rows


def overtime(db: Session, f: dict) -> Report:
    start, end = _range(f)
    rows = [{"date": o.work_date, "code": e.employee_code, "name": full_name(e), "minutes": o.minutes,
             "approved_minutes": o.approved_minutes, "status": o.status}
            for o, e in db.execute(select(OvertimeRecord, Employee).join(Employee, Employee.id == OvertimeRecord.employee_id)
                                   .where(OvertimeRecord.work_date >= start, OvertimeRecord.work_date <= end)
                                   .order_by(OvertimeRecord.work_date)).all()]
    return [("date", "Date"), ("code", "Code"), ("name", "Name"), ("minutes", "Overtime min"),
            ("approved_minutes", "Approved min"), ("status", "Status")], rows


def leave_register(db: Session, f: dict) -> Report:
    start, end = _range(f)
    rows = [{"code": e.employee_code, "name": full_name(e), "type": t.name, "from": r.start_date, "to": r.end_date,
             "days": r.days, "status": r.status, "reason": r.reason}
            for r, e, t in db.execute(select(LeaveRequest, Employee, LeaveType).join(Employee, Employee.id == LeaveRequest.employee_id)
                                      .join(LeaveType, LeaveType.id == LeaveRequest.leave_type_id)
                                      .where(LeaveRequest.end_date >= start, LeaveRequest.start_date <= end)
                                      .order_by(LeaveRequest.start_date)).all()]
    return [("code", "Code"), ("name", "Name"), ("type", "Leave type"), ("from", "From"), ("to", "To"),
            ("days", "Days"), ("status", "Status"), ("reason", "Reason")], rows


def leave_balances(db: Session, f: dict) -> Report:
    year = int(f.get("year") or date.today().year)
    emps = {e.id: e for e in _employees(db, f)}
    rows = []
    for b, t in db.execute(select(LeaveBalance, LeaveType).join(LeaveType, LeaveType.id == LeaveBalance.leave_type_id)
                           .where(LeaveBalance.year == year, LeaveBalance.employee_id.in_(emps))).all():
        e = emps[b.employee_id]
        avail = b.allocated + b.accrued + b.carried_forward + b.adjusted - b.used - b.pending
        rows.append({"code": e.employee_code, "name": full_name(e), "type": t.name,
                     "entitled": b.allocated + b.accrued + b.carried_forward + b.adjusted, "used": b.used,
                     "pending": b.pending, "available": avail})
    return [("code", "Code"), ("name", "Name"), ("type", "Leave type"), ("entitled", "Entitled"), ("used", "Used"),
            ("pending", "Pending"), ("available", "Available")], rows


def payroll_register(db: Session, f: dict) -> Report:
    year, month = int(f.get("year") or date.today().year), int(f.get("month") or date.today().month)
    run = db.scalar(select(PayrollRun).where(PayrollRun.year == year, PayrollRun.month == month,
                                             PayrollRun.kind == "regular", PayrollRun.status != "reversed"))
    if run is None:
        return [("note", "Note")], [{"note": f"No payroll run for {calendar.month_name[month]} {year}"}]
    rows = []
    for i, e in db.execute(select(PayrollItem, Employee).join(Employee, Employee.id == PayrollItem.employee_id)
                           .where(PayrollItem.run_id == run.id).order_by(Employee.first_name)).all():
        ded = {l["code"]: l["amount"] for l in i.deductions}
        rows.append({"code": e.employee_code, "name": full_name(e), "payable_days": i.payable_days, "lop": i.lop_days,
                     "gross": i.gross, "pf": ded.get("PF", 0), "esi": ded.get("ESI", 0), "pt": ded.get("PT", 0),
                     "deductions": i.total_deductions, "net": i.net, "run_status": run.status})
    return [("code", "Code"), ("name", "Name"), ("payable_days", "Paid days"), ("lop", "LOP"), ("gross", "Gross"),
            ("pf", "PF"), ("esi", "ESI"), ("pt", "PT"), ("deductions", "Deductions"), ("net", "Net"),
            ("run_status", "Run status")], rows


def recruitment_funnel(db: Session, f: dict) -> Report:
    rows = []
    for v in db.scalars(select(Vacancy).order_by(Vacancy.created_at.desc())):
        c = dict(db.execute(select(Application.stage, func.count()).where(Application.vacancy_id == v.id)
                            .group_by(Application.stage)).all())
        rows.append({"vacancy": v.title, "status": v.status, "applied": sum(c.values()),
                     "interview": c.get("interview", 0), "selected": c.get("selected", 0), "offered": c.get("offered", 0),
                     "hired": c.get("hired", 0), "rejected": c.get("rejected", 0)})
    return [("vacancy", "Vacancy"), ("status", "Status"), ("applied", "Applications"), ("interview", "Interview"),
            ("selected", "Selected"), ("offered", "Offered"), ("hired", "Hired"), ("rejected", "Rejected")], rows


def compliance(db: Session, f: dict) -> Report:
    rows = [{"name": full_name(e), "code": e.employee_code, "requirement": c.requirement, "status": c.status,
             "detail": c.detail, "due": c.due_date, "checked": c.checked_at}
            for c, e in db.execute(select(ComplianceRecord, Employee).join(Employee, Employee.id == ComplianceRecord.employee_id)
                                   .order_by(ComplianceRecord.status.desc(), Employee.first_name)).all()]
    return [("code", "Code"), ("name", "Name"), ("requirement", "Requirement"), ("status", "Status"),
            ("detail", "Detail"), ("due", "Due"), ("checked", "Checked")], rows


def credential_expiry(db: Session, f: dict) -> Report:
    horizon = date.today() + timedelta(days=int(f.get("days") or 90))
    rows = [{"code": e.employee_code, "name": full_name(e), "type": c.credential_type, "number": c.number,
             "expires": c.expires_on, "days_left": (c.expires_on - date.today()).days, "verified": c.verification_status}
            for c, e in db.execute(select(EmployeeCredential, Employee).join(Employee, Employee.id == EmployeeCredential.employee_id)
                                   .where(EmployeeCredential.deleted_at.is_(None), Employee.status == "active",
                                          EmployeeCredential.expires_on <= horizon)
                                   .order_by(EmployeeCredential.expires_on)).all()]
    return [("code", "Code"), ("name", "Name"), ("type", "Credential"), ("number", "Number"), ("expires", "Expires"),
            ("days_left", "Days left"), ("verified", "Verification")], rows


def performance(db: Session, f: dict) -> Report:
    rows = [{"cycle": c.name, "code": e.employee_code, "name": full_name(e), "status": r.status,
             "overall": r.overall_rating, "final": r.final_rating}
            for r, e, c in db.execute(select(PerformanceReview, Employee, ReviewCycle)
                                      .join(Employee, Employee.id == PerformanceReview.employee_id)
                                      .join(ReviewCycle, ReviewCycle.id == PerformanceReview.cycle_id)
                                      .order_by(ReviewCycle.period_start.desc(), Employee.first_name)).all()]
    return [("cycle", "Cycle"), ("code", "Code"), ("name", "Name"), ("status", "Status"), ("overall", "Manager rating"),
            ("final", "Final rating")], rows


def shift_coverage(db: Session, f: dict) -> Report:
    start, end = _range(f)
    rows = [{"date": d, "department": dept, "shift": t, "staff": n}
            for d, dept, t, n in db.execute(select(ShiftAssignment.work_date, Department.name, ShiftTemplate.name, func.count())
                                            .join(Department, Department.id == ShiftAssignment.department_id)
                                            .join(ShiftTemplate, ShiftTemplate.id == ShiftAssignment.shift_template_id)
                                            .where(ShiftAssignment.status == "published", ShiftAssignment.work_date >= start,
                                                   ShiftAssignment.work_date <= end)
                                            .group_by(ShiftAssignment.work_date, Department.name, ShiftTemplate.name)
                                            .order_by(ShiftAssignment.work_date)).all()]
    return [("date", "Date"), ("department", "Department"), ("shift", "Shift"), ("staff", "Staff rostered")], rows


def grievance_summary(db: Session, f: dict) -> Report:
    """Aggregates only -- never case contents or names."""
    counts = Counter((c.category, c.status) for c in db.scalars(select(GrievanceCase)))
    rows = [{"category": cat, "status": st, "cases": n} for (cat, st), n in sorted(counts.items())]
    return [("category", "Category"), ("status", "Status"), ("cases", "Cases")], rows


CATALOG: dict[str, tuple[str, str | None, Callable[[Session, dict], Report]]] = {
    "employees": ("Employee register", None, employee_register),
    "headcount": ("Headcount by department & category", None, headcount),
    "attendance_summary": ("Attendance summary", None, attendance_summary),
    "overtime": ("Overtime register", None, overtime),
    "leave_register": ("Leave register", None, leave_register),
    "leave_balances": ("Leave balances", None, leave_balances),
    "shift_coverage": ("Shift coverage", None, shift_coverage),
    "payroll_register": ("Payroll register", PAYROLL_WRITE, payroll_register),
    "recruitment_funnel": ("Recruitment funnel", None, recruitment_funnel),
    "performance": ("Performance ratings", None, performance),
    "compliance": ("Compliance status", None, compliance),
    "credential_expiry": ("Credential expiry", None, credential_expiry),
    "grievance_summary": ("Grievance summary (counts only)", GRIEVANCES_MANAGE, grievance_summary),
}


def catalog(principal: Principal) -> list[dict]:
    return [{"key": k, "title": t, "available": principal.can(REPORTS_READ) and (p is None or principal.can(p))}
            for k, (t, p, _) in CATALOG.items()]


def run(db: Session, key: str, filters: dict, principal: Principal | None) -> dict:
    if key not in CATALOG:
        raise NotFound("Unknown report")
    title, perm, fn = CATALOG[key]
    if principal is not None and not (principal.can(REPORTS_READ) and (perm is None or principal.can(perm))):
        raise Forbidden("You do not have access to this report")
    columns, rows = fn(db, filters)
    return {"key": key, "title": title, "filters": filters, "columns": [{"key": k, "label": l} for k, l in columns],
            "rows": rows, "generated_at": datetime.now(timezone.utc)}


def to_csv(report: dict) -> str:
    out = io.StringIO()
    w = csv.writer(out)
    w.writerow([c["label"] for c in report["columns"]])
    for r in report["rows"]:
        vals = []
        for c in report["columns"]:
            v = r.get(c["key"])
            v = "" if v is None else str(v)
            vals.append("'" + v if v[:1] in "=+-@" else v)  # spreadsheet formula injection
        w.writerow(vals)
    return out.getvalue()


# ── schedules ──────────────────────────────────────────────────────────────


def _next(frequency: str, after: datetime) -> datetime:
    if frequency == "daily":
        return after + timedelta(days=1)
    if frequency == "weekly":
        return after + timedelta(days=7)
    y, m = divmod(after.month, 12)
    return after.replace(year=after.year + y, month=m + 1, day=1)


def create_schedule(db: Session, data: dict, principal: Principal) -> ReportSchedule:
    run(db, data["report"], {}, principal)  # authorisation check (and a dry run)
    s = ReportSchedule(tenant_id=tenant_of(db), created_by=actor_of(db), next_run_at=datetime.now(timezone.utc), **data)
    db.add(s)
    db.flush()
    audit(db, "report_schedule", s.id, "created", data)
    return s


def run_due(db: Session) -> int:
    now = datetime.now(timezone.utc)
    done = 0
    for s in db.scalars(select(ReportSchedule).where(ReportSchedule.active, ReportSchedule.next_run_at <= now)):
        r = ReportRun(tenant_id=s.tenant_id, schedule_id=s.id, report=s.report, filters=s.filters,
                      recipients=s.recipients, created_by=s.created_by)
        try:
            report = run(db, s.report, _parse(s.filters), None)
            key = f"reports/{uuid.uuid4().hex}.csv"
            path = Path(settings.document_root) / str(s.tenant_id) / key
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(to_csv(report))
            r.storage_key, r.rows = key, len(report["rows"])
        except Exception as exc:  # recorded on the run, the schedule continues
            r.status, r.error = "failed", str(exc)[:500]
        db.add(r)
        s.next_run_at = _next(s.frequency, now)
        done += 1
    return done


def _parse(filters: dict) -> dict:
    out = dict(filters)
    for k in ("date_from", "date_to"):
        if isinstance(out.get(k), str):
            out[k] = date.fromisoformat(out[k])
    return out


def runs_for(db: Session, principal: Principal):
    stmt = select(ReportRun).order_by(ReportRun.created_at.desc()).limit(200)
    return [r for r in db.scalars(stmt)
            if principal.username in (r.recipients or []) or r.created_by == principal.username or principal.is_admin]


def run_file(db: Session, run_id: uuid.UUID, principal: Principal) -> tuple[ReportRun, bytes]:
    r = db.get(ReportRun, run_id)
    if r is None or r not in runs_for(db, principal) or not r.storage_key:
        raise NotFound("Report run not found")
    return r, (Path(settings.document_root) / str(r.tenant_id) / r.storage_key).read_bytes()
