"""Builds calculated attendance (records, sessions, exceptions, overtime) from
the raw punch ledger. Deterministic: recalculating any day from the same
punches, roster, holidays and leave gives the same result, so it is safe to
run after every sync, correction, leave decision or roster change.

Which punches belong to which day. Each day gets a window: its shift
[start-4h, end+6h] (end on the next calendar day for an overnight shift), or
[04:00, next 04:00) when unscheduled. Where two neighbouring windows overlap,
the scheduled side wins; if both are scheduled the boundary is the midpoint
between one shift's end and the next one's start. So a night shift's 07:58
check-out belongs to the night before, never to today's absence.

Never first-IN minus last-OUT: punches are debounced (re-taps within 60 s are
one event), paired into sessions (device direction when every punch has one,
otherwise alternating), and only closed sessions count as worked time."""

import uuid
from dataclasses import dataclass
from datetime import date, datetime, time, timedelta, timezone
from zoneinfo import ZoneInfo

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.config import settings
from app.models import Employee, RawPunchLog
from app.models.workforce import (
    AttendanceException, AttendanceRecord, AttendanceSession, Holiday, LeaveRequest, LeaveType,
    OvertimeRecord, ShiftAssignment, ShiftTemplate,
)
from app.services.common import emit, notify_live, tenant_of

DEBOUNCE = timedelta(seconds=60)
BEFORE, AFTER = timedelta(hours=4), timedelta(hours=6)
DAY_START = time(4, 0)


def tz() -> ZoneInfo:
    return ZoneInfo(settings.timezone)


@dataclass
class DayPlan:
    day: date
    template: ShiftTemplate | None
    weekly_off: bool
    sched_start: datetime | None
    sched_end: datetime | None
    win_start: datetime
    win_end: datetime


def _plan(db: Session, employee_id: uuid.UUID, day: date, cache: dict) -> DayPlan:
    key = (employee_id, day)
    if key in cache:
        return cache[key]
    a = db.scalar(select(ShiftAssignment).where(ShiftAssignment.employee_id == employee_id,
                                                ShiftAssignment.work_date == day,
                                                ShiftAssignment.status == "published"))
    t = db.get(ShiftTemplate, a.shift_template_id) if a and a.shift_template_id and not a.is_weekly_off else None
    z = tz()
    if t:
        s = datetime.combine(day, t.start_time, z)
        e = datetime.combine(day + timedelta(days=1) if t.end_time <= t.start_time else day, t.end_time, z)
        plan = DayPlan(day, t, False, s, e, s - BEFORE, e + AFTER)
    else:
        ws = datetime.combine(day, DAY_START, z)
        plan = DayPlan(day, None, bool(a and a.is_weekly_off), None, None, ws, ws + timedelta(days=1))
    cache[key] = plan
    return plan


def _boundary(a: DayPlan, b: DayPlan) -> datetime:
    """Where day `a`'s window stops and the following day `b`'s starts."""
    if a.win_end <= b.win_start:
        return a.win_end
    if a.template and b.template:
        return a.sched_end + (b.sched_start - a.sched_end) / 2
    return a.win_end if a.template else b.win_start


def window(db: Session, employee_id: uuid.UUID, day: date, cache: dict | None = None) -> tuple[DayPlan, datetime, datetime]:
    cache = {} if cache is None else cache
    prev, cur, nxt = (_plan(db, employee_id, day + timedelta(days=d), cache) for d in (-1, 0, 1))
    start = max(cur.win_start, _boundary(prev, cur)) if prev.win_end > cur.win_start else cur.win_start
    end = min(cur.win_end, _boundary(cur, nxt)) if cur.win_end > nxt.win_start else cur.win_end
    return cur, start, end


def _sessions(punches: list[RawPunchLog]) -> tuple[list[tuple], list[str]]:
    """[(in_punch, out_punch|None)], exception kinds."""
    kept: list[RawPunchLog] = []
    for p in punches:
        if kept and p.punch_time - kept[-1].punch_time < DEBOUNCE:
            continue
        kept.append(p)
    issues: list[str] = []
    pairs: list[tuple] = []
    if kept and all(p.direction in ("in", "out") for p in kept):
        open_in = None
        for p in kept:
            if p.direction == "in":
                if open_in is not None:
                    pairs.append((open_in, None))
                    issues.append("missing_out")
                open_in = p
            elif open_in is None:
                issues.append("missing_in")
            else:
                pairs.append((open_in, p))
                open_in = None
        if open_in is not None:
            pairs.append((open_in, None))
    else:
        for i in range(0, len(kept), 2):
            pairs.append((kept[i], kept[i + 1] if i + 1 < len(kept) else None))
    return pairs, issues


def _leave_for(db: Session, employee_id: uuid.UUID, day: date) -> tuple[LeaveRequest, LeaveType] | None:
    row = db.execute(select(LeaveRequest, LeaveType).join(LeaveType, LeaveType.id == LeaveRequest.leave_type_id).where(
        LeaveRequest.employee_id == employee_id, LeaveRequest.status == "approved",
        LeaveRequest.start_date <= day, LeaveRequest.end_date >= day)).first()
    return (row[0], row[1]) if row else None


def is_holiday(db: Session, day: date, branch_id: uuid.UUID | None) -> Holiday | None:
    for h in db.scalars(select(Holiday).where(Holiday.holiday_date == day, Holiday.optional.is_(False))):
        if h.branch_id is None or h.branch_id == branch_id:
            return h
    return None


def calculate_day(db: Session, employee_id: uuid.UUID, day: date, cache: dict | None = None,
                  now: datetime | None = None) -> AttendanceRecord | None:
    now = now or datetime.now(timezone.utc)
    emp = db.get(Employee, employee_id)
    if emp is None:
        return None
    existing = db.scalar(select(AttendanceRecord).where(AttendanceRecord.employee_id == employee_id,
                                                        AttendanceRecord.work_date == day))
    if existing and existing.locked:
        return existing
    plan, start, end = window(db, employee_id, day, cache)
    if start > now:  # nothing can have happened yet
        if existing:
            db.delete(existing)
        return None
    punches = db.scalars(select(RawPunchLog).where(
        RawPunchLog.employee_id == employee_id, RawPunchLog.punch_time >= start, RawPunchLog.punch_time < end
    ).order_by(RawPunchLog.punch_time, RawPunchLog.id)).all()
    pairs, issues = _sessions(punches)
    t = plan.template
    window_over = end <= now

    worked = 0
    closed = [(i, o) for i, o in pairs if o is not None]
    for i, o in closed:
        worked += int((o.punch_time - i.punch_time).total_seconds() // 60)
    has_open = any(o is None for _, o in pairs)
    if has_open and window_over:
        issues.append("missing_out")
    gaps = sum(int((closed[k + 1][0].punch_time - closed[k][1].punch_time).total_seconds() // 60)
               for k in range(len(closed) - 1))
    break_deducted = 0
    if t and worked >= 300:
        break_deducted = max(0, min(t.break_minutes, worked) - gaps)
        worked -= break_deducted

    first_in = pairs[0][0].punch_time if pairs else None
    last_out = closed[-1][1].punch_time if closed else None
    late = early = overtime = 0
    if t and first_in:
        delta = int((first_in - plan.sched_start).total_seconds() // 60)
        late = delta if delta > t.grace_in_minutes else 0
    if t and last_out and not has_open:
        delta = int((plan.sched_end - last_out).total_seconds() // 60)
        early = delta if delta > t.grace_out_minutes else 0
    holiday = is_holiday(db, day, emp.branch_id)
    leave = _leave_for(db, employee_id, day)
    if t:
        scheduled = int((plan.sched_end - plan.sched_start).total_seconds() // 60) - t.break_minutes
        extra = worked - scheduled
        overtime = extra if extra >= t.overtime_after_minutes else 0
    if (holiday or plan.weekly_off) and worked >= (t.overtime_after_minutes if t else 30):
        overtime = worked  # work on a day off is all extra time

    if leave and leave[0].half_day is None:
        status = "on_leave"
        if worked:
            issues.append("unscheduled_work")
    elif not punches:
        if holiday:
            status = "holiday"
        elif plan.weekly_off:
            status = "weekly_off"
        elif leave:  # half-day leave and nothing else
            status = "half_day_leave"
        elif t:
            status = "absent" if now >= plan.sched_start + timedelta(minutes=t.half_day_minutes) else "scheduled"
            if status == "absent" and window_over:
                issues.append("absent")
        else:
            status = "not_scheduled"
    elif has_open and not window_over:
        status = "in_progress"
    elif "missing_out" in issues or "missing_in" in issues:
        status = "missing_punch"
    elif leave:  # half-day leave plus a worked half
        status = "half_day_leave"
    elif holiday or plan.weekly_off:
        status = "present"
    else:
        full = t.full_day_minutes if t else 480
        half = t.half_day_minutes if t else 240
        status = "present" if worked >= full else "half_day" if worked >= half else "absent"
        if status == "absent":
            issues.append("short_hours")
    if late:
        issues.append("late")
    if early:
        issues.append("early")
    if t and first_in:
        prev = db.scalar(select(AttendanceRecord).where(AttendanceRecord.employee_id == employee_id,
                                                        AttendanceRecord.work_date == day - timedelta(days=1)))
        if prev and prev.last_out and (first_in - prev.last_out) < timedelta(minutes=t.min_rest_minutes):
            issues.append("insufficient_rest")

    rec = existing or AttendanceRecord(tenant_id=tenant_of(db), employee_id=employee_id, work_date=day,
                                       created_by="engine")
    rec.shift_template_id = t.id if t else None
    rec.scheduled_start, rec.scheduled_end = plan.sched_start, plan.sched_end
    rec.status, rec.first_in, rec.last_out = status, first_in, last_out
    rec.worked_minutes, rec.break_deducted_minutes = max(worked, 0), break_deducted
    rec.late_minutes, rec.early_minutes, rec.overtime_minutes = late, early, overtime
    rec.punch_count = len(punches)
    rec.leave_request_id = leave[0].id if leave else None
    rec.is_night = bool(t and t.is_night and status in ("present", "half_day", "missing_punch"))
    rec.calculated_at = now
    if existing is None:
        db.add(rec)
    db.flush()

    db.execute(delete(AttendanceSession).where(AttendanceSession.record_id == rec.id))
    db.execute(delete(AttendanceException).where(AttendanceException.record_id == rec.id,
                                                 AttendanceException.status == "open"))
    for i, o in pairs:
        db.add(AttendanceSession(tenant_id=rec.tenant_id, record_id=rec.id, check_in=i.punch_time,
                                 check_out=o.punch_time if o else None, in_punch_id=i.id,
                                 out_punch_id=o.id if o else None, created_by="engine",
                                 minutes=int((o.punch_time - i.punch_time).total_seconds() // 60) if o else 0))
    details = {"late": f"{late} min late", "early": f"left {early} min early", "missing_out": "No check-out punch",
               "missing_in": "Check-out without check-in", "absent": "Scheduled but no punches",
               "short_hours": f"Only {worked} min worked", "unscheduled_work": "Punched in on approved leave",
               "insufficient_rest": "Less than the configured rest since the previous shift"}
    for kind in dict.fromkeys(issues):
        db.add(AttendanceException(tenant_id=rec.tenant_id, record_id=rec.id, employee_id=employee_id,
                                   work_date=day, kind=kind, detail=details.get(kind), created_by="engine"))
    _sync_overtime(db, rec)
    return rec


def _sync_overtime(db: Session, rec: AttendanceRecord) -> None:
    ot = db.scalar(select(OvertimeRecord).where(OvertimeRecord.employee_id == rec.employee_id,
                                                OvertimeRecord.work_date == rec.work_date))
    if rec.overtime_minutes <= 0:
        if ot and ot.status == "pending" and ot.approval_instance_id is None:
            db.delete(ot)
        return
    if ot is None:
        db.add(OvertimeRecord(tenant_id=rec.tenant_id, employee_id=rec.employee_id, work_date=rec.work_date,
                              minutes=rec.overtime_minutes, created_by="engine"))
    elif ot.minutes != rec.overtime_minutes and ot.status in ("pending", "rejected"):
        ot.minutes = rec.overtime_minutes


def recalculate(db: Session, employee_ids: list[uuid.UUID] | set[uuid.UUID], start: date, end: date,
                reason: str = "recalculation") -> int:
    if (end - start).days > 62:
        raise ValueError("Recalculate at most 62 days at a time")
    today = datetime.now(tz()).date()
    end = min(end, today + timedelta(days=1))
    count = 0
    for emp_id in employee_ids:
        cache: dict = {}
        day = start
        while day <= end:
            if calculate_day(db, emp_id, day, cache) is not None:
                count += 1
            day += timedelta(days=1)
    if count:
        emit(db, "attendance.record.updated", f"{start}:{end}",
             {"employees": [str(e) for e in employee_ids][:200], "from": start, "to": end, "reason": reason})
        notify_live(db, "attendance", {"from": start, "to": end})
    return count


def recalc_for_punches(db: Session, punches: list[tuple[uuid.UUID, datetime]]) -> int:
    """After ingestion: each punch can belong to its local day or the day
    before (an overnight shift), so both are rebuilt."""
    by_emp: dict[uuid.UUID, set[date]] = {}
    for emp_id, when in punches:
        d = when.astimezone(tz()).date()
        by_emp.setdefault(emp_id, set()).update({d, d - timedelta(days=1)})
    total = 0
    for emp_id, days in by_emp.items():
        total += recalculate(db, [emp_id], min(days), max(days), "punches received")
    return total
