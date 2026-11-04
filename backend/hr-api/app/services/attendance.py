"""Integrations, devices, PIN mappings, sync orchestration and the live board."""

import logging
import uuid
from datetime import date, datetime, time, timedelta, timezone
from zoneinfo import ZoneInfo

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.config import settings
from app.crypto import encrypt
from app.db import tenant_session
from app.errors import AppError, Conflict, NotFound
from app.models import (
    AttendanceIntegration,
    AttendanceSyncLog,
    BiometricDevice,
    BiometricMapping,
    Branch,
    Department,
    Designation,
    Employee,
    EmployeeDepartment,
    RawPunchLog,
)
from app.providers import ProviderError, Unsupported, build_provider
from app.services import attendance_engine as engine
from app.services.common import actor_of, audit, diff, emit, notify_live, paginate, tenant_of
from app.services.employees import full_name
from app.services.punch_ingestion import claim_unmapped, ingest

log = logging.getLogger("hr.attendance")

# Re-read this far behind the watermark on every poll: a device that was
# offline uploads its backlog late, and deduplication makes the overlap free.
LOOKBACK = timedelta(hours=24)
INITIAL_BACKFILL = timedelta(days=7)
MAX_WINDOW = timedelta(days=31)


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _get(db: Session, model, obj_id, label):
    obj = db.get(model, obj_id)
    if obj is None or getattr(obj, "deleted_at", None):
        raise NotFound(f"{label} not found")
    return obj


# --- integrations ------------------------------------------------------------


def integration_out(i: AttendanceIntegration) -> dict:
    return {
        **{c: getattr(i, c) for c in ("id", "name", "provider", "base_url", "username", "branch_id", "enabled",
                                       "poll_interval_seconds", "device_timezone", "synced_until",
                                       "last_success_at", "last_error", "consecutive_failures", "created_at")},
        "has_password": bool(i.password_encrypted),
        "operations": (i.capabilities or {}).get("operations", []),
        "verified_at": (i.capabilities or {}).get("verified_at"),
        "is_simulator": i.provider == "simulator",
    }


def list_integrations(db: Session):
    return db.scalars(select(AttendanceIntegration).where(AttendanceIntegration.deleted_at.is_(None))
                      .order_by(AttendanceIntegration.name)).all()


def create_integration(db: Session, data: dict) -> AttendanceIntegration:
    password = data.pop("password", None)
    ZoneInfo(data.get("device_timezone") or "Asia/Kolkata")  # raises on a bad zone
    i = AttendanceIntegration(tenant_id=tenant_of(db), created_by=actor_of(db), updated_by=actor_of(db), **data)
    if password:
        i.password_encrypted = encrypt(password)
    db.add(i)
    db.flush()
    audit(db, "attendance_integration", i.id, "created",
          {k: v for k, v in data.items()} | {"password": "set" if password else "none"})
    return i


def update_integration(db: Session, integration_id: uuid.UUID, data: dict) -> AttendanceIntegration:
    i = _get(db, AttendanceIntegration, integration_id, "Integration")
    password = data.pop("password", None)
    if "device_timezone" in data:
        ZoneInfo(data["device_timezone"])
    changes = diff(i, data)
    if {"base_url", "provider"} & changes.keys():
        i.capabilities = {}  # a different server must be verified again
    if password:
        i.password_encrypted = encrypt(password)
        changes["password"] = "changed"
    if changes:
        i.updated_by = actor_of(db)
        audit(db, "attendance_integration", i.id, "updated", changes)
    db.flush()
    return i


def delete_integration(db: Session, integration_id: uuid.UUID) -> None:
    i = _get(db, AttendanceIntegration, integration_id, "Integration")
    i.deleted_at = _now()
    i.enabled = False
    audit(db, "attendance_integration", i.id, "deleted")


def test_integration(db: Session, integration_id: uuid.UUID) -> dict:
    i = _get(db, AttendanceIntegration, integration_id, "Integration")
    result = build_provider(i).test_connection()
    if result.ok:
        i.capabilities = {"operations": result.operations, "product": result.product,
                          "verified_at": _now().isoformat()}
        i.last_error = None
    else:
        i.last_error = result.message
    audit(db, "attendance_integration", i.id, "connection_tested", {"ok": result.ok, "message": result.message})
    db.flush()
    return {"ok": result.ok, "message": result.message, "operations": result.operations, "product": result.product}


def discover_devices(db: Session, integration_id: uuid.UUID) -> list[BiometricDevice]:
    i = _get(db, AttendanceIntegration, integration_id, "Integration")
    try:
        found = build_provider(i).fetch_devices()
    except Unsupported as exc:
        raise AppError(str(exc)) from exc
    except ProviderError as exc:
        raise AppError(f"Device discovery failed: {exc}") from exc
    existing = {d.serial_number for d in db.scalars(select(BiometricDevice).where(BiometricDevice.deleted_at.is_(None)))}
    created = []
    for d in found:
        if d.serial_number in existing:
            continue
        created.append(create_device(db, {"integration_id": i.id, "serial_number": d.serial_number,
                                          "name": d.name or d.serial_number, "location": d.location}))
    return created


# --- devices -----------------------------------------------------------------


def list_devices(db: Session, integration_id: uuid.UUID | None = None):
    stmt = select(BiometricDevice).where(BiometricDevice.deleted_at.is_(None)).order_by(BiometricDevice.name)
    if integration_id:
        stmt = stmt.where(BiometricDevice.integration_id == integration_id)
    return db.scalars(stmt).all()


def create_device(db: Session, data: dict) -> BiometricDevice:
    _get(db, AttendanceIntegration, data["integration_id"], "Integration")
    if data.get("branch_id"):
        _get(db, Branch, data["branch_id"], "Branch")
    if data.get("department_id"):
        _get(db, Department, data["department_id"], "Department")
    d = BiometricDevice(tenant_id=tenant_of(db), created_by=actor_of(db), updated_by=actor_of(db), **data)
    db.add(d)
    db.flush()
    audit(db, "biometric_device", d.id, "registered", data)
    return d


def update_device(db: Session, device_id: uuid.UUID, data: dict) -> BiometricDevice:
    d = _get(db, BiometricDevice, device_id, "Device")
    changes = diff(d, data)
    if changes:
        d.updated_by = actor_of(db)
        audit(db, "biometric_device", d.id, "updated", changes)
    db.flush()
    return d


def retire_device(db: Session, device_id: uuid.UUID) -> None:
    d = _get(db, BiometricDevice, device_id, "Device")
    d.deleted_at = _now()
    d.enabled = False
    audit(db, "biometric_device", d.id, "retired")


def refresh_device_health(db: Session) -> list[BiometricDevice]:
    """Mark devices offline when the server has not returned data for them
    within the threshold. Returns devices that just went offline."""
    cutoff = _now() - timedelta(minutes=settings.device_offline_minutes)
    went_offline = []
    for d in db.scalars(select(BiometricDevice).where(BiometricDevice.deleted_at.is_(None), BiometricDevice.enabled)):
        stale = d.last_seen_at is None or d.last_seen_at < cutoff
        if stale and d.status == "online":
            d.status = "offline"
            went_offline.append(d)
            emit(db, "attendance.device.offline", d.id, {"device_id": d.id, "serial_number": d.serial_number,
                                                         "name": d.name, "last_seen_at": d.last_seen_at})
            notify_live(db, "device", {"device_id": d.id, "status": "offline"})
    return went_offline


# --- mappings ----------------------------------------------------------------


def mapping_out(m: BiometricMapping, emp: Employee | None) -> dict:
    return {
        **{c: getattr(m, c) for c in ("id", "integration_id", "employee_id", "device_user_id", "effective_from",
                                       "effective_to", "provisioning_status", "created_at", "created_by")},
        "employee_code": emp.employee_code if emp else None,
        "employee_name": full_name(emp) if emp else None,
    }


def list_mappings(db: Session, integration_id=None, employee_id=None, include_ended=False):
    stmt = (select(BiometricMapping, Employee).join(Employee, Employee.id == BiometricMapping.employee_id)
            .order_by(BiometricMapping.device_user_id))
    if integration_id:
        stmt = stmt.where(BiometricMapping.integration_id == integration_id)
    if employee_id:
        stmt = stmt.where(BiometricMapping.employee_id == employee_id)
    if not include_ended:
        stmt = stmt.where(BiometricMapping.effective_to.is_(None))
    return [mapping_out(m, e) for m, e in db.execute(stmt).all()]


def create_mapping(db: Session, data: dict) -> dict:
    integration = _get(db, AttendanceIntegration, data["integration_id"], "Integration")
    emp = _get(db, Employee, data["employee_id"], "Employee")
    if emp.status in ("terminated", "archived"):
        raise Conflict("Cannot map a biometric ID to a former employee")
    pin = data["device_user_id"].strip()
    taken = db.scalar(select(BiometricMapping).where(
        BiometricMapping.integration_id == integration.id, BiometricMapping.device_user_id == pin,
        BiometricMapping.effective_to.is_(None),
    ))
    if taken:
        raise Conflict(f"Device user {pin} is already mapped; end that mapping first",
                       {"mapping_id": str(taken.id), "employee_id": str(taken.employee_id)})
    start = data.get("effective_from") or emp.joining_date or date.today()
    m = BiometricMapping(tenant_id=tenant_of(db), created_by=actor_of(db), updated_by=actor_of(db),
                         integration_id=integration.id, employee_id=emp.id, device_user_id=pin,
                         effective_from=start)
    db.add(m)
    db.flush()
    claimed = claim_unmapped(db, m, integration.device_timezone)
    if claimed:
        today = datetime.now(engine.tz()).date()
        engine.recalculate(db, [emp.id], max(start, today - timedelta(days=62)), today, "mapping claimed punches")
    audit(db, "biometric_mapping", m.id, "created",
          {"employee_id": emp.id, "device_user_id": pin, "effective_from": start, "claimed_punches": claimed})
    if claimed:
        notify_live(db, "punches", {"count": claimed, "claimed_for": emp.id})
    return {**mapping_out(m, emp), "claimed_punches": claimed}


def end_mapping(db: Session, mapping_id: uuid.UUID, end: date | None) -> dict:
    m = db.get(BiometricMapping, mapping_id)
    if m is None:
        raise NotFound("Mapping not found")
    if m.effective_to is not None:
        raise Conflict("Mapping already ended")
    end = end or date.today()
    if end < m.effective_from:
        raise AppError("End date is before the mapping started")
    m.effective_to = end
    m.updated_by = actor_of(db)
    audit(db, "biometric_mapping", m.id, "ended", {"effective_to": end})
    db.flush()
    return mapping_out(m, db.get(Employee, m.employee_id))


def unmapped_summary(db: Session, integration_id: uuid.UUID | None = None) -> list[dict]:
    stmt = (
        select(RawPunchLog.integration_id, RawPunchLog.device_user_id, func.count(),
               func.min(RawPunchLog.punch_time), func.max(RawPunchLog.punch_time),
               func.array_agg(func.distinct(RawPunchLog.device_serial)))
        .where(RawPunchLog.employee_id.is_(None))
        .group_by(RawPunchLog.integration_id, RawPunchLog.device_user_id)
        .order_by(func.max(RawPunchLog.punch_time).desc())
    )
    if integration_id:
        stmt = stmt.where(RawPunchLog.integration_id == integration_id)
    return [{"integration_id": i, "device_user_id": pin, "punch_count": n, "first_punch": first,
             "last_punch": last, "devices": [s for s in serials if s]}
            for i, pin, n, first, last, serials in db.execute(stmt).all()]


# --- sync ----------------------------------------------------------------------


def run_sync(tenant_id: uuid.UUID, integration_id: uuid.UUID, trigger: str, actor: str,
             window: tuple[datetime, datetime] | None = None) -> dict:
    """Pull punches for one integration. Runs in three short transactions so a
    failure still leaves a sync log and a failure counter behind."""
    started = _now()
    with tenant_session(tenant_id) as db:
        db.info["actor"] = actor
        # SKIP LOCKED: a poll that overlaps a manual sync simply stands down.
        integration = db.scalar(select(AttendanceIntegration).where(
            AttendanceIntegration.id == integration_id, AttendanceIntegration.deleted_at.is_(None)
        ).with_for_update(skip_locked=True))
        if integration is None:
            exists = db.get(AttendanceIntegration, integration_id)
            if exists is None or exists.deleted_at:
                raise NotFound("Integration not found")
            raise Conflict("A sync for this integration is already running")
        if not integration.enabled and trigger == "poll":
            return {"status": "skipped", "reason": "disabled"}
        tz = ZoneInfo(integration.device_timezone)
        if window:
            win_from, win_to = window
        else:
            win_to = started
            win_from = (integration.synced_until - LOOKBACK) if integration.synced_until else started - INITIAL_BACKFILL
        if win_to - win_from > MAX_WINDOW:
            raise AppError("Sync window is limited to 31 days per run")
        integration.last_attempt_at = started
        sync_log = AttendanceSyncLog(tenant_id=tenant_id, integration_id=integration.id, trigger=trigger,
                                     started_at=started, window_from=win_from, window_to=win_to, created_by=actor)
        db.add(sync_log)
        db.flush()

        provider = build_provider(integration)
        devices = [d for d in list_devices(db, integration.id) if d.enabled]
        totals = {"fetched": 0, "inserted": 0, "duplicates": 0, "unmapped": 0, "rejected": 0}
        per_device, rejected_rows, failures = [], [], 0
        local_from = win_from.astimezone(tz).replace(tzinfo=None)
        local_to = win_to.astimezone(tz).replace(tzinfo=None)
        if not devices:
            failures = -1  # nothing to poll is a configuration problem, not a device failure
        for device in devices:
            try:
                records = provider.fetch_transactions(device.serial_number, local_from, local_to)
            except ProviderError as exc:
                failures += 1
                per_device.append({"serial": device.serial_number, "ok": False, "error": str(exc)[:500]})
                continue
            except Exception as exc:  # a parser bug must not lose the sync log
                log.exception("provider crashed for %s", device.serial_number)
                failures += 1
                per_device.append({"serial": device.serial_number, "ok": False,
                                   "error": f"Internal error ({exc.__class__.__name__})"})
                continue
            result = ingest(db, integration, records, sync_log.id)
            for k in totals:
                totals[k] += result[k]
            rejected_rows += result["rejected_rows"]
            device.last_seen_at = _now()
            if device.status != "online":
                device.status = "online"
                notify_live(db, "device", {"device_id": device.id, "status": "online"})
            per_device.append({"serial": device.serial_number, "ok": True, **{k: result[k] for k in totals}})

        all_failed = bool(devices) and failures == len(devices)
        sync_log.finished_at = _now()
        for k, v in totals.items():
            setattr(sync_log, k, v)
        sync_log.details = {"devices": per_device, "rejected": rejected_rows[:200]}
        if failures == -1:
            sync_log.status, sync_log.error = "failed", "No enabled devices registered for this integration"
        elif all_failed:
            sync_log.status, sync_log.error = "failed", per_device[0]["error"]
        else:
            sync_log.status = "partial" if failures else "success"

        if sync_log.status == "failed":
            integration.consecutive_failures += 1
            integration.last_error = sync_log.error
            emit(db, "attendance.sync.failed", integration.id, {
                "integration_id": integration.id, "name": integration.name, "error": sync_log.error,
                "consecutive_failures": integration.consecutive_failures,
            })
        else:
            # Only advance the watermark when every device answered; a partial
            # run is re-read next time thanks to the look-back anyway.
            if not failures and not window:
                integration.synced_until = win_to
            integration.last_success_at = _now()
            integration.consecutive_failures = 0
            integration.last_error = per_device[0]["error"] if failures else None
        notify_live(db, "sync", {"integration_id": integration.id, "status": sync_log.status, **totals})
        out = {"sync_log_id": sync_log.id, "status": sync_log.status, "error": sync_log.error,
               "window_from": win_from, "window_to": win_to, **totals, "devices": per_device}
    return out


def sync_logs(db: Session, integration_id: uuid.UUID | None, page: int, page_size: int) -> dict:
    stmt = select(AttendanceSyncLog).order_by(AttendanceSyncLog.started_at.desc())
    if integration_id:
        stmt = stmt.where(AttendanceSyncLog.integration_id == integration_id)
    cols = ("id", "integration_id", "trigger", "status", "started_at", "finished_at", "window_from", "window_to",
            "fetched", "inserted", "duplicates", "unmapped", "rejected", "error", "details", "created_by")
    return paginate(db, stmt, page, page_size, lambda r: {c: getattr(r[0], c) for c in cols})


# --- punches & live board ----------------------------------------------------


def business_day_bounds(day: date) -> tuple[datetime, datetime]:
    tz = ZoneInfo(settings.timezone)
    start = datetime.combine(day, time.min, tzinfo=tz)
    return start, start + timedelta(days=1)


def list_punches(db: Session, filters: dict, page: int, page_size: int) -> dict:
    stmt = (select(RawPunchLog, Employee, BiometricDevice.name)
            .outerjoin(Employee, Employee.id == RawPunchLog.employee_id)
            .outerjoin(BiometricDevice, BiometricDevice.id == RawPunchLog.device_id)
            .order_by(RawPunchLog.punch_time.desc(), RawPunchLog.id))
    if filters.get("employee_id"):
        stmt = stmt.where(RawPunchLog.employee_id == filters["employee_id"])
    if filters.get("device_id"):
        stmt = stmt.where(RawPunchLog.device_id == filters["device_id"])
    if filters.get("device_user_id"):
        stmt = stmt.where(RawPunchLog.device_user_id == filters["device_user_id"])
    if filters.get("mapped") is not None:
        stmt = stmt.where(RawPunchLog.employee_id.is_not(None) if filters["mapped"] else RawPunchLog.employee_id.is_(None))
    if filters.get("date_from"):
        stmt = stmt.where(RawPunchLog.punch_time >= business_day_bounds(filters["date_from"])[0])
    if filters.get("date_to"):
        stmt = stmt.where(RawPunchLog.punch_time < business_day_bounds(filters["date_to"])[1])

    def row(r):
        p, emp, device_name = r
        return {
            **{c: getattr(p, c) for c in ("id", "integration_id", "device_id", "device_serial", "device_user_id",
                                           "punch_time", "direction", "verify_mode", "source", "raw_payload",
                                           "received_at", "employee_id")},
            "device_name": device_name,
            "employee_code": emp.employee_code if emp else None,
            "employee_name": full_name(emp) if emp else None,
        }

    return paginate(db, stmt, page, page_size, row)


def live_board(db: Session, day: date, filters: dict) -> dict:
    start, end = business_day_bounds(day)
    punch_stats = (
        select(RawPunchLog.employee_id.label("employee_id"),
               func.min(RawPunchLog.punch_time).label("first_in"),
               func.max(RawPunchLog.punch_time).label("last_punch"),
               func.count().label("punches"),
               func.max(RawPunchLog.received_at).label("last_received"))
        .where(RawPunchLog.employee_id.is_not(None), RawPunchLog.punch_time >= start, RawPunchLog.punch_time < end)
        .group_by(RawPunchLog.employee_id).subquery()
    )
    primary = (select(EmployeeDepartment.employee_id, EmployeeDepartment.department_id)
               .where(EmployeeDepartment.is_primary, EmployeeDepartment.effective_to.is_(None)).subquery())
    stmt = (
        select(Employee, Department.name, Designation.title, Branch.name, punch_stats.c.first_in,
               punch_stats.c.last_punch, punch_stats.c.punches, punch_stats.c.last_received)
        .outerjoin(punch_stats, punch_stats.c.employee_id == Employee.id)
        .outerjoin(primary, primary.c.employee_id == Employee.id)
        .outerjoin(Department, Department.id == primary.c.department_id)
        .outerjoin(Designation, Designation.id == Employee.designation_id)
        .outerjoin(Branch, Branch.id == Employee.branch_id)
        .where(Employee.status == "active", Employee.deleted_at.is_(None))
        .order_by(punch_stats.c.last_punch.desc().nulls_last(), Employee.first_name)
    )
    for key, col in (("branch_id", Employee.branch_id), ("designation_id", Employee.designation_id),
                     ("employee_category", Employee.employee_category)):
        if filters.get(key):
            stmt = stmt.where(col == filters[key])
    if filters.get("department_id"):
        stmt = stmt.where(primary.c.department_id == filters["department_id"])

    rows, counts = [], {"in": 0, "out": 0, "not_arrived": 0}
    for emp, dept, desig, branch, first_in, last_punch, n, received in db.execute(stmt).all():
        # Pull-mode devices here report no direction, so presence is read from
        # punch parity: an odd count means the last punch opened a session.
        # This is a checkpoint reading, not location tracking -- the board says so.
        if not n:
            status = "not_arrived"
        else:
            status = "in" if n % 2 == 1 else "out"
        counts[status] += 1
        rows.append({
            "employee_id": emp.id, "employee_code": emp.employee_code, "full_name": full_name(emp),
            "department": dept, "designation": desig, "branch": branch, "category": emp.employee_category,
            "first_check_in": first_in, "last_punch": last_punch,
            "last_check_out": last_punch if status == "out" else None,
            "punch_count": n or 0, "status": status, "last_synced_at": received,
        })
    status_filter = filters.get("status")
    if status_filter:
        rows = [r for r in rows if r["status"] == status_filter]
    last_sync = db.scalar(select(func.max(AttendanceSyncLog.finished_at)).where(
        AttendanceSyncLog.status.in_(("success", "partial"))))
    unmapped_today = db.scalar(select(func.count()).select_from(RawPunchLog).where(
        RawPunchLog.employee_id.is_(None), RawPunchLog.punch_time >= start, RawPunchLog.punch_time < end)) or 0
    devices = db.execute(select(BiometricDevice.status, func.count()).where(
        BiometricDevice.deleted_at.is_(None), BiometricDevice.enabled).group_by(BiometricDevice.status)).all()
    return {
        "date": day, "rows": rows, "counts": {**counts, "total": sum(counts.values()), "unmapped_punches": unmapped_today},
        "devices": dict(devices), "last_sync_at": last_sync,
    }


def integration_due(i: AttendanceIntegration, now: datetime) -> bool:
    last = i.last_attempt_at
    if i.consecutive_failures:
        # Back off on repeated failure: 1x, 2x, 4x ... capped at 1 hour.
        delay = min(i.poll_interval_seconds * (2 ** min(i.consecutive_failures, 6)), 3600)
    else:
        delay = i.poll_interval_seconds
    return last is None or (now - last).total_seconds() >= delay

