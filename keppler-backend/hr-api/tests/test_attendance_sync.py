"""Integration -> device -> sync -> raw ledger -> mapping -> live board."""

import uuid
from datetime import date, datetime, timedelta, timezone
from zoneinfo import ZoneInfo

import pytest
from sqlalchemy import select, text

from app.db import tenant_session
from app.models import OutboxEvent, RawPunchLog

IST = ZoneInfo("Asia/Kolkata")


@pytest.fixture()
def sim(admin, org):
    client, _ = admin

    def _make(query="pins=1001,1002&unknown=9999&duplicates=1", serial=None):
        integ = client.post("/api/v1/attendance/integrations", json={
            "name": "Simulator", "provider": "simulator", "base_url": f"sim://?{query}",
        }).json()
        device = client.post("/api/v1/attendance/devices", json={
            "integration_id": integ["id"], "serial_number": serial or f"SIM{uuid.uuid4().hex[:6]}",
            "name": "Main gate", "branch_id": org["branch"]["id"],
        }).json()
        return integ, device

    return _make


def window(days_back=3):
    end = datetime.now(timezone.utc)
    return {"window_from": (end - timedelta(days=days_back)).isoformat(), "window_to": end.isoformat()}


def test_sync_is_idempotent_and_keeps_unmapped(admin, sim, employee_factory):
    client, principal = admin
    emp = employee_factory()
    integ, device = sim()
    client.post("/api/v1/attendance/mappings", json={
        "integration_id": integ["id"], "employee_id": emp["id"], "device_user_id": "1001",
        "effective_from": "2025-01-01",
    })
    w = window()
    first = client.post(f"/api/v1/attendance/integrations/{integ['id']}/sync", json=w).json()
    assert first["status"] == "success", first
    assert first["inserted"] > 0 and first["duplicates"] > 0  # simulator re-sends a punch per day
    assert first["unmapped"] > 0  # 1002 and 9999 have no mapping

    again = client.post(f"/api/v1/attendance/integrations/{integ['id']}/sync", json=w).json()
    assert again["inserted"] == 0 and again["duplicates"] == again["fetched"]

    unmapped = client.get("/api/v1/attendance/unmapped").json()
    assert {u["device_user_id"] for u in unmapped} == {"1002", "9999"}
    mine = client.get("/api/v1/attendance/punches", params={"employee_id": emp["id"]}).json()
    assert mine["total"] > 0 and all(p["employee_code"] == emp["employee_code"] for p in mine["items"])
    assert client.get("/api/v1/attendance/devices").json()[0]["status"] == "online"

    with tenant_session(principal.tenant_id) as db:
        events = db.scalars(select(OutboxEvent.event_type).where(
            OutboxEvent.event_type == "attendance.punch.received")).all()
        assert len(events) == first["inserted"]


def test_mapping_later_claims_earlier_unmapped_punches(admin, sim, employee_factory):
    client, _ = admin
    emp = employee_factory()
    integ, _ = sim("pins=2001")
    client.post(f"/api/v1/attendance/integrations/{integ['id']}/sync", json=window())
    before = client.get("/api/v1/attendance/unmapped").json()
    assert before[0]["device_user_id"] == "2001"
    mapping = client.post("/api/v1/attendance/mappings", json={
        "integration_id": integ["id"], "employee_id": emp["id"], "device_user_id": "2001",
        "effective_from": "2025-01-01",
    }).json()
    assert mapping["claimed_punches"] == before[0]["punch_count"]
    assert client.get("/api/v1/attendance/unmapped").json() == []


def test_reissued_pin_does_not_reattribute_old_punches(admin, sim, employee_factory):
    client, _ = admin
    leaver, joiner = employee_factory(), employee_factory()
    integ, _ = sim("pins=3001")
    today = datetime.now(IST).date()
    m = client.post("/api/v1/attendance/mappings", json={
        "integration_id": integ["id"], "employee_id": leaver["id"], "device_user_id": "3001",
        "effective_from": "2025-01-01",
    }).json()
    client.post(f"/api/v1/attendance/mappings/{m['id']}/end", json={"effective_to": str(today - timedelta(days=2))})
    dup = client.post("/api/v1/attendance/mappings", json={
        "integration_id": integ["id"], "employee_id": joiner["id"], "device_user_id": "3001",
        "effective_from": str(today - timedelta(days=1)),
    })
    assert dup.status_code == 201
    client.post(f"/api/v1/attendance/integrations/{integ['id']}/sync", json=window(5))
    for p in client.get("/api/v1/attendance/punches", params={"page_size": 200}).json()["items"]:
        day = datetime.fromisoformat(p["punch_time"]).astimezone(IST).date()
        if day <= today - timedelta(days=2):
            assert p["employee_id"] in (leaver["id"], None)
        else:
            assert p["employee_id"] == joiner["id"]


def test_pin_cannot_be_double_mapped(admin, sim, employee_factory):
    client, _ = admin
    a, b = employee_factory(), employee_factory()
    integ, _ = sim()
    body = {"integration_id": integ["id"], "device_user_id": "4001"}
    assert client.post("/api/v1/attendance/mappings", json={**body, "employee_id": a["id"]}).status_code == 201
    assert client.post("/api/v1/attendance/mappings", json={**body, "employee_id": b["id"]}).status_code == 409


def test_offline_provider_records_failure_and_event(admin, sim):
    client, principal = admin
    integ, _ = sim("pins=1&offline=1")
    result = client.post(f"/api/v1/attendance/integrations/{integ['id']}/sync").json()
    assert result["status"] == "failed" and "offline" in result["error"]
    listed = client.get("/api/v1/attendance/integrations").json()[0]
    assert listed["consecutive_failures"] == 1 and listed["synced_until"] is None
    logs = client.get("/api/v1/attendance/sync-logs").json()
    assert logs["items"][0]["status"] == "failed"
    with tenant_session(principal.tenant_id) as db:
        assert db.scalar(select(OutboxEvent).where(OutboxEvent.event_type == "attendance.sync.failed"))


def test_incremental_sync_advances_watermark_with_lookback(admin, sim):
    client, _ = admin
    integ, _ = sim("pins=5001")
    first = client.post(f"/api/v1/attendance/integrations/{integ['id']}/sync").json()
    assert first["status"] == "success"
    watermark = client.get("/api/v1/attendance/integrations").json()[0]["synced_until"]
    assert watermark is not None
    second = client.post(f"/api/v1/attendance/integrations/{integ['id']}/sync").json()
    # The second window re-reads 24h behind the watermark to catch late uploads.
    assert datetime.fromisoformat(second["window_from"]) < datetime.fromisoformat(watermark)
    assert second["inserted"] == 0


def test_delayed_backlog_is_recovered_by_window_resync(admin, sim):
    client, _ = admin
    integ, _ = sim("pins=6001")
    client.post(f"/api/v1/attendance/integrations/{integ['id']}/sync", json=window(1))
    later = client.post(f"/api/v1/attendance/integrations/{integ['id']}/sync", json=window(10)).json()
    assert later["inserted"] > 0  # days the short window never covered


def test_sync_without_devices_fails_clearly(admin):
    client, _ = admin
    integ = client.post("/api/v1/attendance/integrations", json={
        "name": "Empty", "provider": "simulator", "base_url": "sim://?pins=1"}).json()
    result = client.post(f"/api/v1/attendance/integrations/{integ['id']}/sync").json()
    assert result["status"] == "failed" and "No enabled devices" in result["error"]


def test_raw_punches_are_immutable(admin, sim):
    client, principal = admin
    integ, _ = sim("pins=7001")
    client.post(f"/api/v1/attendance/integrations/{integ['id']}/sync", json=window())
    with tenant_session(principal.tenant_id) as db:
        punch_id = db.scalar(select(RawPunchLog.id).limit(1))
    for sql in ("UPDATE raw_punch_logs SET punch_time = now() WHERE id = :i",
                "UPDATE raw_punch_logs SET raw_payload = 'x' WHERE id = :i",
                "DELETE FROM raw_punch_logs WHERE id = :i"):
        with pytest.raises(Exception, match="append-only|immutable"):
            with tenant_session(principal.tenant_id) as db:
                db.execute(text(sql), {"i": punch_id})


def test_rejected_rows_are_kept_in_sync_log(admin, org, employee_factory):
    from app.models import AttendanceIntegration
    from app.providers import PunchRecord
    from app.services.punch_ingestion import ingest

    client, principal = admin
    integ = client.post("/api/v1/attendance/integrations", json={
        "name": "x", "provider": "simulator", "base_url": "sim://?pins=1"}).json()
    with tenant_session(principal.tenant_id) as db:
        i = db.get(AttendanceIntegration, uuid.UUID(integ["id"]))
        result = ingest(db, i, [
            PunchRecord("", datetime.min, "SN", "corrupt\trow"),
            PunchRecord("8001", datetime(2026, 3, 1, 9, 0), "SN", "8001\t2026-03-01 09:00:00"),
        ], None)
    assert result["rejected"] == 1 and result["rejected_rows"] == ["corrupt\trow"] and result["inserted"] == 1


def test_live_board_reads_presence_from_punches(admin, sim, employee_factory):
    client, _ = admin
    present = employee_factory(first_name="Present")
    absent = employee_factory(first_name="Absent")
    integ, _ = sim("pins=1101")
    client.post("/api/v1/attendance/mappings", json={
        "integration_id": integ["id"], "employee_id": present["id"], "device_user_id": "1101",
        "effective_from": "2025-01-01",
    })
    client.post(f"/api/v1/attendance/integrations/{integ['id']}/sync", json=window(2))
    # Pick a past day the simulator definitely covered in full.
    yesterday = datetime.now(IST).date() - timedelta(days=1)
    board = client.get("/api/v1/attendance/live", params={"day": str(yesterday)}).json()
    rows = {r["employee_id"]: r for r in board["rows"]}
    assert rows[absent["id"]]["status"] == "not_arrived"
    p = rows[present["id"]]
    if p["punch_count"]:  # the simulator skips ~1 day in 11 for absence
        assert p["status"] == ("in" if p["punch_count"] % 2 else "out")
        assert p["first_check_in"] is not None
    filtered = client.get("/api/v1/attendance/live", params={"day": str(yesterday), "status": "not_arrived"}).json()
    assert all(r["status"] == "not_arrived" for r in filtered["rows"])


def test_terminating_employee_ends_biometric_mapping(admin, sim, employee_factory):
    client, _ = admin
    emp = employee_factory()
    integ, _ = sim()
    client.post("/api/v1/attendance/mappings", json={
        "integration_id": integ["id"], "employee_id": emp["id"], "device_user_id": "1201"})
    client.post(f"/api/v1/hr/employees/{emp['id']}/terminate", json={"reason": "resigned"})
    assert client.get("/api/v1/attendance/mappings", params={"employee_id": emp["id"]}).json() == []
    ended = client.get("/api/v1/attendance/mappings",
                       params={"employee_id": emp["id"], "include_ended": True}).json()
    assert ended[0]["effective_to"] == str(date.today())
