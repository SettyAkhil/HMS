"""Tests run against a real PostgreSQL database built by the real migrations,
connected as the real runtime role, so RLS and triggers are exercised rather
than mocked. Point HR_TEST_ADMIN_URL at a server where the owner may create
databases; the suite creates and drops `hospai_hr_test` on it."""

import os
import uuid
from urllib.parse import urlparse, urlunparse

import pytest

ADMIN_URL = os.environ.get("HR_TEST_ADMIN_URL")
if not ADMIN_URL:
    pytest.exit("HR_TEST_ADMIN_URL is required (owner URL of a scratch PostgreSQL server)", returncode=2)

APP_PASSWORD = "hr-app-test-password"


def _with_db(url: str, db: str, user: str | None = None, password: str | None = None) -> str:
    parts = urlparse(url)
    netloc = parts.netloc
    if user:
        host = netloc.split("@", 1)[1]
        netloc = f"{user}:{password}@{host}"
    return urlunparse(parts._replace(netloc=netloc, path=f"/{db}"))


OWNER_URL = _with_db(ADMIN_URL, "hospai_hr_test")
APP_URL = _with_db(ADMIN_URL, "hospai_hr_test", "hr_app", APP_PASSWORD)

# Settings are read at import time: set them before anything imports `app`.
os.environ.update({
    "HR_DATABASE_URL": APP_URL,
    "HR_DATABASE_OWNER_URL": OWNER_URL,
    "HR_APP_DB_PASSWORD": APP_PASSWORD,
    "HR_CSRF_ENABLED": "false",
    "HR_SECRETS_KEY": os.environ.get("HR_TEST_SECRETS_KEY", "q2e3Mt1fV7tHc2rB8vH9z3D2s0s6n7rGx0q0b1c2d3E="),
    "REDIS_URL": os.environ.get("HR_TEST_REDIS_URL", "redis://127.0.0.1:1/0"),
    "HR_DOCUMENT_ROOT": "/tmp/hr-test-documents",
})


def _recreate_database() -> None:
    from sqlalchemy import create_engine, text

    admin = create_engine(ADMIN_URL, isolation_level="AUTOCOMMIT")
    with admin.connect() as conn:
        conn.execute(text("DROP DATABASE IF EXISTS hospai_hr_test WITH (FORCE)"))
        conn.execute(text("CREATE DATABASE hospai_hr_test"))
    admin.dispose()


@pytest.fixture(scope="session", autouse=True)
def database():
    _recreate_database()
    from app import bootstrap

    assert bootstrap.main() == 0
    yield
    from app.db import engine

    engine.dispose()


@pytest.fixture()
def make_principal():
    from app.security import Principal, resolve_tenant

    def _make(perms=(), admin=False, tenant="hosp-a", username=None):
        return Principal(
            username=username or f"user-{uuid.uuid4().hex[:6]}",
            display_name="Test User",
            tenant_id=resolve_tenant(tenant),
            tenant_code=tenant,
            permissions=frozenset(perms),
            is_admin=admin,
        )

    return _make


@pytest.fixture()
def client_for():
    """client_for(principal) -> TestClient authenticated as that principal.
    Each client carries its own identity header, so several users can act
    in one test without overriding each other."""
    from fastapi import Request
    from fastapi.testclient import TestClient

    from app.main import app
    from app.security import current_principal

    registry = {}

    def resolve(request: Request):
        principal = registry[request.headers["X-Test-Principal"]]
        request.state.principal = principal
        return principal

    app.dependency_overrides[current_principal] = resolve

    def _client(principal):
        key = uuid.uuid4().hex
        registry[key] = principal
        return TestClient(app, headers={"X-Test-Principal": key})

    yield _client
    app.dependency_overrides.clear()


@pytest.fixture()
def admin(make_principal, client_for):
    # A fresh tenant per test keeps tests independent without truncation.
    principal = make_principal(admin=True, tenant=f"t-{uuid.uuid4().hex[:8]}")
    return client_for(principal), principal


def unique(prefix: str) -> str:
    return f"{prefix}{uuid.uuid4().hex[:6].upper()}"


@pytest.fixture()
def org(admin):
    """A hospital, branch, two departments and two designations."""
    client, _ = admin
    h = client.post("/api/v1/hr/hospitals", json={"code": "MAIN", "name": "Main Hospital"}).json()
    b = client.post("/api/v1/hr/branches", json={"hospital_id": h["id"], "code": "BLR", "name": "Bengaluru"}).json()
    icu = client.post("/api/v1/hr/departments", json={"code": "ICU", "name": "Intensive Care", "branch_id": b["id"]}).json()
    er = client.post("/api/v1/hr/departments", json={"code": "ER", "name": "Emergency", "branch_id": b["id"]}).json()
    nurse = client.post("/api/v1/hr/designations", json={
        "code": "SN", "title": "Staff Nurse", "job_category": "nurse", "is_clinical": True,
    }).json()
    doc = client.post("/api/v1/hr/designations", json={
        "code": "CONS", "title": "Consultant", "job_category": "consultant", "is_clinical": True,
        "requires_registration": True,
    }).json()
    return {"hospital": h, "branch": b, "icu": icu, "er": er, "nurse": nurse, "consultant": doc}


@pytest.fixture()
def employee_factory(admin, org):
    client, _ = admin

    def _make(**overrides):
        body = {
            "first_name": unique("Asha"), "last_name": "Rao", "employee_category": "nurse",
            "joining_date": "2026-01-05", "branch_id": org["branch"]["id"],
            "designation_id": org["nurse"]["id"],
            "departments": [{"department_id": org["icu"]["id"], "is_primary": True}],
            "activate": True,
        }
        body.update(overrides)
        resp = client.post("/api/v1/hr/employees", json=body)
        assert resp.status_code == 201, resp.text
        return resp.json()

    return _make


@pytest.fixture()
def setup(admin, org, employee_factory, make_principal, client_for):
    """Simulator integration, a day and a night shift, and helpers to map
    employees, feed punches, roster and approve."""
    from datetime import datetime

    from app.db import tenant_session
    from app.models import AttendanceIntegration
    from app.providers import PunchRecord
    from app.services.punch_ingestion import ingest

    client, principal = admin
    integ = client.post("/api/v1/attendance/integrations", json={
        "name": "t", "provider": "simulator", "base_url": "sim://?pins=1"}).json()
    day = client.post("/api/v1/workforce/shifts", json={
        "code": "G", "name": "General", "start_time": "09:00", "end_time": "17:00", "break_minutes": 30}).json()
    night = client.post("/api/v1/workforce/shifts", json={
        "code": "N", "name": "Night", "kind": "night", "start_time": "20:00", "end_time": "08:00",
        "break_minutes": 30, "is_night": True, "full_day_minutes": 600}).json()
    pins = {}

    def employee(**kw):
        e = employee_factory(**kw)
        pin = str(2000 + len(pins))
        client.post("/api/v1/attendance/mappings", json={"integration_id": integ["id"], "employee_id": e["id"],
                                                         "device_user_id": pin, "effective_from": "2025-01-01"})
        pins[e["id"]] = pin
        return e

    def punch(emp, *stamps):
        with tenant_session(principal.tenant_id) as db:
            db.info["actor"] = "test"
            i = db.get(AttendanceIntegration, uuid.UUID(integ["id"]))
            ingest(db, i, [PunchRecord(pins[emp["id"]], datetime.fromisoformat(s), "SN1", s) for s in stamps], None)

    def roster(emp, cells, dept=None):
        start, end = min(d for d, _ in cells), max(d for d, _ in cells)
        r = client.post("/api/v1/workforce/rosters", json={
            "department_id": dept or org["icu"]["id"], "period_start": str(start), "period_end": str(end)})
        assert r.status_code == 201, r.text
        r = r.json()
        body = [{"employee_id": emp["id"], "work_date": str(d),
                 "shift_template_id": {"G": day["id"], "N": night["id"]}.get(code), "is_weekly_off": code == "OFF"}
                for d, code in cells]
        assert client.put(f"/api/v1/workforce/rosters/{r['id']}/assignments", json=body).status_code == 200
        return r

    def publish(r):
        return client.post(f"/api/v1/workforce/rosters/{r['id']}/publish")

    def record(emp, d):
        rows = client.get("/api/v1/attendance/daily", params={"day": str(d), "page_size": 200}).json()["items"]
        return next((x for x in rows if x["employee_id"] == emp["id"]), None)

    # Requesters cannot approve their own requests, HR included.
    approver = client_for(make_principal(admin=True, tenant=principal.tenant_code, username="approver.hr"))

    def approve(instance_id):
        resp = approver.post(f"/api/v1/hr/approvals/{instance_id}/act", json={"action": "approve"})
        assert resp.status_code == 200, resp.text
        return resp.json()

    return {"client": client, "principal": principal, "approve": approve, "integ": integ, "day": day, "night": night,
            "employee": employee, "punch": punch, "roster": roster, "publish": publish, "record": record}


