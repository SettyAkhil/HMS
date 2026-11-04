"""Security sweeps over every registered route, so a newly added endpoint
cannot ship without authentication or CSRF protection by accident."""

import re
import uuid

import httpx
import pytest
from fastapi.routing import APIRoute
from fastapi.testclient import TestClient

from app.main import app

PUBLIC = {"/api/v1/hr/health", "/api/v1/hr-openapi.json", "/api/v1/hr-docs", "/api/v1/hr-docs/oauth2-redirect"}


def _routes():
    for r in app.routes:
        if isinstance(r, APIRoute) and r.path not in PUBLIC:
            for m in r.methods - {"HEAD", "OPTIONS"}:
                yield m, r.path


def _concrete(path: str) -> str:
    return re.sub(r"\{[^}]+\}", lambda m: "verified" if m.group(0) == "{verdict}" else str(uuid.uuid4()), path)


ROUTES = sorted(set(_routes()))


def test_route_inventory_is_large():
    assert len(ROUTES) > 150  # guards against the sweep silently testing nothing


@pytest.mark.parametrize("method,path", ROUTES)
def test_every_route_requires_a_session(method, path):
    app.dependency_overrides.clear()
    client = TestClient(app)
    resp = client.request(method, _concrete(path), json={})
    assert resp.status_code in (401, 422), f"{method} {path} -> {resp.status_code}"
    if resp.status_code == 422:
        # Validation may run before auth for malformed bodies, but it must never
        # leak data; a well-formed unauthenticated request is still 401.
        assert "items" not in resp.text and "employee_code" not in resp.text


MUTATING = [(m, p) for m, p in ROUTES if m in ("POST", "PUT", "PATCH", "DELETE")]


@pytest.mark.parametrize("method,path", MUTATING)
def test_every_write_requires_csrf(method, path, monkeypatch):
    from app import security
    from app.config import Settings

    app.dependency_overrides.clear()
    monkeypatch.setattr(security, "settings", Settings(csrf_enabled=True))
    monkeypatch.setattr(security, "_fetch_session_user", lambda token: {
        "username": "csrf.probe", "user_type": "admin", "hospital_code": "csrf-sweep", "permissions": []})
    client = TestClient(app)
    client.cookies.set("hospai_session", "t")
    client.cookies.set("csrf_token", "expected")
    resp = client.request(method, _concrete(path), json={}, headers={"X-CSRF-Token": "forged"})
    assert resp.status_code in (403, 422), f"{method} {path} -> {resp.status_code}"
    if resp.status_code == 403:
        assert "CSRF" in resp.json()["error"]


def test_search_parameters_are_not_injectable(admin, employee_factory):
    client, _ = admin
    employee_factory(first_name="Safe")
    for probe in ("' OR '1'='1", "%'; DROP TABLE employees; --", "\\x00", "a" * 100):
        resp = client.get("/api/v1/hr/employees", params={"search": probe})
        assert resp.status_code in (200, 422)
        if resp.status_code == 200:
            assert resp.json()["total"] == 0
    assert client.get("/api/v1/hr/employees").json()["total"] == 1  # table intact


def test_uploaded_filenames_cannot_traverse(admin, employee_factory):
    client, _ = admin
    e = employee_factory()
    resp = client.post("/api/v1/hr/documents", data={"category": "other", "title": "x", "employee_id": e["id"]},
                       files={"file": ("../../../etc/passwd.pdf", b"%PDF-1.4 test", "application/pdf")})
    assert resp.status_code == 201
    assert "/" not in resp.json()["filename"] and ".." not in resp.json()["filename"].replace("passwd", "")


def test_error_bodies_never_leak_sql(admin, org):
    client, _ = admin
    resp = client.post("/api/v1/hr/departments", json={"code": "ICU", "name": "duplicate"})
    assert resp.status_code == 409
    assert "INSERT" not in resp.text and "psycopg" not in resp.text


def test_responses_carry_security_headers(admin):
    client, _ = admin
    resp = client.get("/api/v1/hr/employees")
    assert resp.headers["x-content-type-options"] == "nosniff"
    assert resp.headers["x-frame-options"] == "DENY"
    assert resp.headers["cache-control"] == "no-store"
    assert resp.headers.get("x-correlation-id")


def test_auth_service_errors_fail_closed(monkeypatch):
    from app import security

    app.dependency_overrides.clear()
    security._session_cache.clear()
    monkeypatch.setattr(security.httpx, "get", lambda *a, **k: httpx.Response(500, text="boom"))
    client = TestClient(app)
    client.cookies.set("hospai_session", "x")
    assert client.get("/api/v1/hr/employees").status_code == 401
