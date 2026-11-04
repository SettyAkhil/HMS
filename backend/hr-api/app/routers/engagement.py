"""Phase 5 routes: employee self-service, announcements, reports, Command
Center and the read APIs other HMS modules use."""

import uuid
from datetime import date, datetime
from typing import Literal

from fastapi import APIRouter, Depends, Request
from fastapi.responses import Response
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.errors import Forbidden
from app.models.employee import EMPLOYEE_CATEGORIES
from app.security import EMPLOYEES_WRITE, REPORTS_READ, Principal, current_principal, get_db, require, require_hr_read
from app.services import attendance, attendance_ops, hms, leave, operations, payroll, reports, selfservice, shifts, staffing
from app.services.common import _jsonable, audit

me = APIRouter(prefix="/api/v1/me", tags=["self-service"])
ann = APIRouter(prefix="/api/v1/hr/announcements", tags=["announcements"])
rep = APIRouter(prefix="/api/v1/reports/hr", tags=["reports"])
ops = APIRouter(prefix="/api/v1/workforce", tags=["hms-integration"])
cc = APIRouter(prefix="/api/v1/hr/command-center", tags=["command-center"])


# ── self-service ───────────────────────────────────────────────────────────


@me.get("")
def overview(principal: Principal = Depends(current_principal), db: Session = Depends(get_db)):
    return selfservice.overview(db, principal)


@me.get("/attendance")
def my_attendance(year: int, month: int, principal: Principal = Depends(current_principal),
                  db: Session = Depends(get_db)):
    return attendance_ops.monthly(db, selfservice.me(db, principal).id, year, month)


@me.get("/punches")
def my_punches(date_from: date, date_to: date, page: int = 1, principal: Principal = Depends(current_principal),
               db: Session = Depends(get_db)):
    emp = selfservice.me(db, principal)
    return attendance.list_punches(db, {"employee_id": emp.id, "date_from": date_from, "date_to": date_to}, page, 50)


@me.get("/shifts")
def my_shifts(date_from: date, date_to: date, principal: Principal = Depends(current_principal),
              db: Session = Depends(get_db)):
    return shifts.assignments(db, date_from, date_to, employee_id=selfservice.me(db, principal).id, published_only=True)


@me.get("/leave")
def my_leave(year: int | None = None, principal: Principal = Depends(current_principal), db: Session = Depends(get_db)):
    emp = selfservice.me(db, principal)
    return {"balances": leave.balances_for(db, emp.id, year or date.today().year),
            "requests": leave.list_requests(db, {"employee_id": emp.id})}


@me.get("/payslips")
def my_payslips(principal: Principal = Depends(current_principal), db: Session = Depends(get_db)):
    emp = selfservice.me(db, principal)
    return [{"id": p.id, "number": p.number, "year": p.year, "month": p.month, "net": p.snapshot.get("net"),
             "period": p.snapshot.get("period")} for p in payroll.payslips_for(db, emp.id)]


@me.get("/corrections")
def my_corrections(principal: Principal = Depends(current_principal), db: Session = Depends(get_db)):
    return attendance_ops.list_corrections(db, None, selfservice.me(db, principal).id)


@me.get("/training")
def my_training(principal: Principal = Depends(current_principal), db: Session = Depends(get_db)):
    return selfservice.my_training(db, principal)


@me.get("/announcements")
def my_announcements(principal: Principal = Depends(current_principal), db: Session = Depends(get_db)):
    return selfservice.announcements_for(db, selfservice.me(db, principal))


@me.get("/colleagues")
def my_colleagues(day: date, principal: Principal = Depends(current_principal), db: Session = Depends(get_db)):
    return selfservice.colleagues(db, principal, day)


@me.get("/notifications")
def my_notifications(principal: Principal = Depends(current_principal), db: Session = Depends(get_db)):
    return selfservice.notifications(db, principal)


# ── announcements ──────────────────────────────────────────────────────────


class AnnouncementIn(BaseModel):
    title: str = Field(min_length=3, max_length=200)
    body: str = Field(min_length=3, max_length=10000)
    audience: dict = Field(default_factory=lambda: {"all": True})
    priority: Literal["normal", "important"] = "normal"
    published_at: datetime | None = None
    expires_at: datetime | None = None


@ann.get("")
def announcements(_: Principal = Depends(require_hr_read), db: Session = Depends(get_db)):
    return [{"id": a.id, "title": a.title, "body": a.body, "audience": a.audience, "priority": a.priority,
             "published_at": a.published_at, "expires_at": a.expires_at, "created_by": a.created_by}
            for a in selfservice.list_announcements(db)]


@ann.post("", status_code=201)
def create_announcement(body: AnnouncementIn, _: Principal = Depends(require(EMPLOYEES_WRITE)),
                        db: Session = Depends(get_db)):
    aud = body.audience
    if not aud.get("all") and not (aud.get("departments") or aud.get("categories")):
        raise Forbidden("Choose everyone, or at least one department or category")
    bad = [c for c in aud.get("categories", []) if c not in EMPLOYEE_CATEGORIES]
    if bad:
        raise Forbidden(f"Unknown categories: {', '.join(bad)}")
    return {"id": selfservice.create_announcement(db, body.model_dump()).id}


# ── reports ────────────────────────────────────────────────────────────────


class ReportFilters(BaseModel):
    date_from: date | None = None
    date_to: date | None = None
    department_id: uuid.UUID | None = None
    branch_id: uuid.UUID | None = None
    employee_category: str | None = None
    year: int | None = None
    month: int | None = Field(None, ge=1, le=12)
    status: str | None = None
    days: int | None = Field(None, ge=1, le=365)


class ScheduleIn(BaseModel):
    report: str
    filters: dict = Field(default_factory=dict)
    frequency: Literal["daily", "weekly", "monthly"]
    recipients: list[str] = Field(min_length=1, max_length=20)


@rep.get("")
def report_catalog(principal: Principal = Depends(current_principal)):
    return reports.catalog(principal)


@rep.get("/runs")
def report_runs(principal: Principal = Depends(current_principal), db: Session = Depends(get_db)):
    return [{"id": r.id, "report": r.report, "rows": r.rows, "status": r.status, "error": r.error,
             "created_at": r.created_at, "has_file": bool(r.storage_key)} for r in reports.runs_for(db, principal)]


@rep.get("/runs/{run_id}/download")
def report_run_download(run_id: uuid.UUID, principal: Principal = Depends(current_principal),
                        db: Session = Depends(get_db)):
    r, data = reports.run_file(db, run_id, principal)
    return Response(data, media_type="text/csv",
                    headers={"Content-Disposition": f'attachment; filename="{r.report}-{r.created_at:%Y%m%d}.csv"'})


@rep.post("/schedules", status_code=201)
def create_schedule(body: ScheduleIn, principal: Principal = Depends(require(REPORTS_READ)),
                    db: Session = Depends(get_db)):
    s = reports.create_schedule(db, body.model_dump(), principal)
    return {"id": s.id, "next_run_at": s.next_run_at}


@rep.get("/{key}")
def report(key: str, filters: ReportFilters = Depends(), principal: Principal = Depends(current_principal),
           db: Session = Depends(get_db)):
    return reports.run(db, key, filters.model_dump(exclude_none=True), principal)


@rep.get("/{key}/export.csv")
def report_csv(key: str, filters: ReportFilters = Depends(), principal: Principal = Depends(current_principal),
               db: Session = Depends(get_db)):
    data = reports.run(db, key, filters.model_dump(exclude_none=True), principal)
    audit(db, "report", key, "exported", _jsonable(filters.model_dump(exclude_none=True)))
    return Response(reports.to_csv(data), media_type="text/csv",
                    headers={"Content-Disposition": f'attachment; filename="{key}-{date.today()}.csv"'})


# ── HMS integration (read-only) ────────────────────────────────────────────


@ops.get("/on-duty")
def on_duty(at: datetime | None = None, hms_module: str | None = None, department_id: uuid.UUID | None = None,
            category: str | None = None, _: Principal = Depends(current_principal), db: Session = Depends(get_db)):
    """Names, roles and shift times only -- what a ward or OT needs to see."""
    return operations.on_duty(db, at, hms_module, department_id, category)


@ops.get("/availability")
def availability(date_from: date, date_to: date, category: str | None = None, department_id: uuid.UUID | None = None,
                 _: Principal = Depends(current_principal), db: Session = Depends(get_db)):
    if (date_to - date_from).days > 31:
        raise Forbidden("At most 31 days per request")
    return operations.availability(db, date_from, date_to, category, department_id)


@ops.get("/coverage/live")
def live_coverage(request: Request, department_id: uuid.UUID | None = None, _: Principal = Depends(require_hr_read),
                  db: Session = Depends(get_db)):
    census, error = operations.census_from_beds(db, hms.CallerContext.from_request(request))
    today = date.today()
    return {**staffing.coverage(db, today, today, department_id, census), "census_error": error}


@cc.get("")
def command_center(request: Request, _: Principal = Depends(require_hr_read), db: Session = Depends(get_db)):
    return operations.command_center(db, hms.CallerContext.from_request(request))
