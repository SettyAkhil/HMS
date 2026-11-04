"""Turns provider records into raw punch rows, idempotently.

Every biometric event ends up in exactly one of three places, so none is lost:
  - raw_punch_logs, mapped to an employee;
  - raw_punch_logs with employee_id NULL (unmapped PIN), claimable later;
  - the sync log's `details.rejected` (a row the device sent that could not be
    parsed), kept verbatim for inspection.
A re-sent punch hits the unique dedupe key and is counted as a duplicate."""

import hashlib
import uuid
from datetime import date, datetime, timezone
from zoneinfo import ZoneInfo

from sqlalchemy import Date, cast, func, select, update
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session

from app.models import BiometricDevice, BiometricMapping, RawPunchLog
from app.providers import PunchRecord
from app.services.attendance_engine import recalc_for_punches
from app.services.common import emit, notify_live, tenant_of

MAX_REJECTED_KEPT = 200


def dedupe_key(integration_id: uuid.UUID, serial: str | None, pin: str, when_utc: datetime) -> str:
    # Second precision: devices that re-send a punch keep the same second.
    stamp = when_utc.astimezone(timezone.utc).replace(microsecond=0).isoformat()
    return hashlib.sha256(f"{integration_id}|{serial or ''}|{pin}|{stamp}".encode()).hexdigest()


def _mapping_lookup(db: Session, integration_id: uuid.UUID, pins: set[str]):
    rows = db.scalars(select(BiometricMapping).where(
        BiometricMapping.integration_id == integration_id, BiometricMapping.device_user_id.in_(pins)
    )).all()

    def resolve(pin: str, day: date) -> uuid.UUID | None:
        for m in rows:
            if m.device_user_id == pin and m.effective_from <= day and (m.effective_to is None or day <= m.effective_to):
                return m.employee_id
        return None

    return resolve


def ingest(db: Session, integration, records: list[PunchRecord], sync_log_id: uuid.UUID | None,
           source: str = "device") -> dict:
    tz = ZoneInfo(integration.device_timezone)
    tenant_id = tenant_of(db)
    valid = [r for r in records if r.device_user_id and r.local_time != datetime.min]
    rejected = [r.raw for r in records if not (r.device_user_id and r.local_time != datetime.min)]
    devices = {d.serial_number: d for d in db.scalars(select(BiometricDevice).where(
        BiometricDevice.integration_id == integration.id, BiometricDevice.deleted_at.is_(None)
    ))}
    resolve = _mapping_lookup(db, integration.id, {r.device_user_id for r in valid})

    inserted = duplicates = unmapped = 0
    latest_by_device: dict[str, datetime] = {}
    live_events = []
    mapped_new: list = []
    for r in valid:
        when = r.local_time.replace(tzinfo=tz)
        local_day = r.local_time.date()
        device = devices.get(r.device_serial or "")
        employee_id = resolve(r.device_user_id, local_day)
        stmt = insert(RawPunchLog).values(
            id=uuid.uuid4(), tenant_id=tenant_id, integration_id=integration.id,
            device_id=device.id if device else None, device_serial=r.device_serial,
            device_user_id=r.device_user_id, punch_time=when, direction=r.direction,
            verify_mode=r.verify_mode, source=source, raw_payload=r.raw[:2000],
            dedupe_key=dedupe_key(integration.id, r.device_serial, r.device_user_id, when),
            sync_log_id=sync_log_id, employee_id=employee_id,
        ).on_conflict_do_nothing(index_elements=["tenant_id", "dedupe_key"]).returning(RawPunchLog.id)
        new_id = db.execute(stmt).scalar_one_or_none()
        if new_id is None:
            duplicates += 1
            continue
        inserted += 1
        if employee_id is None:
            unmapped += 1
        if r.device_serial:
            latest_by_device[r.device_serial] = max(when, latest_by_device.get(r.device_serial, when))
        emit(db, "attendance.punch.received", new_id, {
            "punch_id": new_id, "employee_id": employee_id, "device_user_id": r.device_user_id,
            "device_serial": r.device_serial, "punch_time": when, "mapped": employee_id is not None,
        })
        if employee_id is not None:
            live_events.append({"employee_id": employee_id, "punch_time": when, "device_serial": r.device_serial})
            mapped_new.append((employee_id, when))

    for serial, latest in latest_by_device.items():
        device = devices.get(serial)
        if device and (device.last_punch_at is None or latest > device.last_punch_at):
            device.last_punch_at = latest
    if live_events:
        # One message per sync, not per punch: the board refetches its rows.
        notify_live(db, "punches", {"count": len(live_events), "latest": live_events[-20:]})
    db.flush()
    if mapped_new:
        recalc_for_punches(db, mapped_new)
    return {"fetched": len(records), "inserted": inserted, "duplicates": duplicates,
            "unmapped": unmapped, "rejected": len(rejected), "rejected_rows": rejected[:MAX_REJECTED_KEPT]}


def claim_unmapped(db: Session, mapping: BiometricMapping, device_timezone: str) -> int:
    """Attribute already-received unmapped punches whose local calendar day
    falls in the mapping's validity window. Only `employee_id` changes; the
    immutability trigger guards every other column."""
    local_day = cast(func.timezone(device_timezone, RawPunchLog.punch_time), Date)
    conditions = [
        RawPunchLog.integration_id == mapping.integration_id,
        RawPunchLog.device_user_id == mapping.device_user_id,
        RawPunchLog.employee_id.is_(None),
        local_day >= mapping.effective_from,
    ]
    if mapping.effective_to:
        conditions.append(local_day <= mapping.effective_to)
    result = db.execute(
        update(RawPunchLog).where(*conditions).values(employee_id=mapping.employee_id)
        .execution_options(synchronize_session=False)
    )
    return result.rowcount or 0
