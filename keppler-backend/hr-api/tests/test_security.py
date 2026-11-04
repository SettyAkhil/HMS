"""Permissions, tenant isolation (API and database level), auth bridge, CSRF."""

import uuid

import httpx
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select, text

from app.db import SessionLocal, tenant_session
from app.models import Employee
from app.security import EMPLOYEES_WRITE, HR_READ


def test_read_only_user_cannot_write(admin, make_principal, client_for):
    _, principal = admin
    reader = client_for(make_principal(perms=[HR_READ], tenant=principal.tenant_code))
    assert reader.get("/api/v1/hr/employees").status_code == 200
    assert reader.post("/api/v1/hr/departments", json={"code": "X", "name": "X"}).status_code == 403
    assert reader.post("/api/v1/hr/employees", json={}).status_code in (403, 422)
    assert reader.get("/api/v1/attendance/integrations").status_code == 403


def test_user_without_hr_cannot_read(admin, make_principal, client_for):
    _, principal = admin
    outsider = client_for(make_principal(perms=["billing.read"], tenant=principal.tenant_code))
    assert outsider.get("/api/v1/hr/employees").status_code == 403
    assert outsider.get("/api/v1/attendance/live").status_code == 403


def test_other_tenant_cannot_see_or_touch_employee(employee_factory, make_principal, client_for):
    emp = employee_factory()
    other = client_for(make_principal(admin=True, tenant=f"other-{uuid.uuid4().hex[:6]}"))
    assert other.get("/api/v1/hr/employees").json()["total"] == 0
    assert other.get(f"/api/v1/hr/employees/{emp['id']}").status_code == 404
    assert other.patch(f"/api/v1/hr/employees/{emp['id']}", json={"phone": "+91 11111 11111"}).status_code == 404


def test_rls_blocks_cross_tenant_rows_at_database_level(employee_factory, make_principal):
    emp = employee_factory()
    stranger = make_principal(tenant=f"rls-{uuid.uuid4().hex[:6]}")
    with tenant_session(stranger.tenant_id) as db:
        # No WHERE clause at all: RLS alone must hide the row.
        assert db.scalar(select(Employee).where(Employee.id == uuid.UUID(emp["id"]))) is None
        assert db.execute(text("SELECT count(*) FROM employees")).scalar() == 0
        with pytest.raises(Exception):
            db.execute(text(
                "INSERT INTO employees (id, tenant_id, employee_code, first_name, employee_category, "
                "employment_type, status) SELECT gen_random_uuid(), tenant_id, 'X', 'X', 'nurse', 'permanent', "
                "'draft' FROM tenants WHERE id <> :t LIMIT 1"
            ), {"t": stranger.tenant_id})


def test_session_without_tenant_sees_nothing(employee_factory):
    employee_factory()
    with SessionLocal() as db:
        assert db.execute(text("SELECT count(*) FROM employees")).scalar() == 0


def test_runtime_role_is_not_privileged():
    with SessionLocal() as db:
        row = db.execute(text("SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname = current_user")).one()
        assert tuple(row) == (False, False)


def test_auth_bridge_rejects_missing_or_invalid_session(monkeypatch):
    from app import security
    from app.main import app

    app.dependency_overrides.clear()
    client = TestClient(app)
    assert client.get("/api/v1/hr/employees").status_code == 401

    monkeypatch.setattr(security.httpx, "get",
                        lambda *a, **k: httpx.Response(200, json={"user": None}))
    client.cookies.set("hospai_session", "bogus")
    assert client.get("/api/v1/hr/employees").status_code == 401


def test_auth_bridge_maps_session_to_principal(monkeypatch):
    from app import security
    from app.main import app

    app.dependency_overrides.clear()
    user = {"username": "hr1", "full_name": "HR One", "user_type": "staff", "hospital_code": "bridge-hosp",
            "permissions": [HR_READ, EMPLOYEES_WRITE], "employee_id": "E-1"}
    calls = []

    def fake_get(url, cookies=None, timeout=None):
        calls.append(cookies)
        return httpx.Response(200, json={"user": user})

    monkeypatch.setattr(security.httpx, "get", fake_get)
    security._session_cache.clear()
    client = TestClient(app)
    client.cookies.set("hospai_session", "tok-123")
    assert client.get("/api/v1/hr/employees").status_code == 200
    assert client.get("/api/v1/hr/employees").status_code == 200
    assert len(calls) == 1  # second request served from the short session cache
    assert client.get("/api/v1/attendance/integrations").status_code == 403  # lacks hr.attendance.write


def test_auth_service_down_is_503(monkeypatch):
    from app import security
    from app.main import app

    app.dependency_overrides.clear()
    security._session_cache.clear()

    def boom(*a, **k):
        raise httpx.ConnectError("down")

    monkeypatch.setattr(security.httpx, "get", boom)
    client = TestClient(app)
    client.cookies.set("hospai_session", "tok-down")
    assert client.get("/api/v1/hr/employees").status_code == 503


def test_csrf_required_on_writes(monkeypatch):
    from app import security
    from app.config import Settings
    from app.main import app

    app.dependency_overrides.clear()
    monkeypatch.setattr(security, "settings", Settings(csrf_enabled=True))
    monkeypatch.setattr(security, "_fetch_session_user", lambda token: {
        "username": "a", "user_type": "admin", "hospital_code": "csrf-hosp", "permissions": []})
    client = TestClient(app)
    client.cookies.set("hospai_session", "t")
    assert client.post("/api/v1/hr/hospitals", json={"code": "H", "name": "H"}).status_code == 403
    client.cookies.set("csrf_token", "abc")
    ok = client.post("/api/v1/hr/hospitals", json={"code": "H", "name": "H"}, headers={"X-CSRF-Token": "abc"})
    assert ok.status_code == 201


def test_integration_password_encrypted_and_never_returned(admin):
    from app.models import AttendanceIntegration

    client, principal = admin
    resp = client.post("/api/v1/attendance/integrations", json={
        "name": "Main eTimeTrackLite", "provider": "etimetracklite", "base_url": "http://10.0.0.5:81",
        "username": "essl", "password": "s3cret-value",
    })
    assert resp.status_code == 201
    assert "s3cret-value" not in resp.text and resp.json()["has_password"] is True
    assert "s3cret-value" not in client.get("/api/v1/attendance/integrations").text
    with tenant_session(principal.tenant_id) as db:
        stored = db.get(AttendanceIntegration, uuid.UUID(resp.json()["id"])).password_encrypted
    assert stored and "s3cret-value" not in stored
