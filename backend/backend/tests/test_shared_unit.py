"""In-process unit tests for the shared, security-relevant helpers.

No database: only pure functions and a throwaway Flask app built by the same
factory every service uses. Run inside a backend image:
  ../Enterprise-Hospital-Management-System/tests/backend-unit/run.sh
"""
from __future__ import annotations

import hashlib
import hmac

import pytest
from flask import jsonify
from werkzeug.exceptions import BadRequest

from shared import payments
from shared.app_factory import create_service_app
from shared.hospital import normalize_department_name, validate_hospital_code


# ── hospital code / department validation ────────────────────────────────────

@pytest.mark.parametrize("code,expected", [("city-care", "city-care"), ("  CITY-CARE  ", "city-care"), ("h01", "h01")])
def test_valid_hospital_codes_are_normalised(code, expected):
    assert validate_hospital_code(code) == expected


@pytest.mark.parametrize("code", ["", "ab", "bad code", "drop;table", "a" * 65, "x/../y", "<script>"])
def test_invalid_hospital_codes_are_rejected(code):
    with pytest.raises(BadRequest):
        validate_hospital_code(code)


def test_department_names_are_trimmed_and_bounded():
    assert normalize_department_name("  General   Medicine ") == "General Medicine"
    with pytest.raises(BadRequest):
        normalize_department_name("   ")
    with pytest.raises(BadRequest):
        normalize_department_name("x" * 121)


# ── payments ────────────────────────────────────────────────────────────────

@pytest.mark.parametrize("value,paise", [(10, 1000), ("99.99", 9999), (0.015, 2), ("0", None), (-5, None), ("abc", None), (None, None)])
def test_amounts_convert_to_paise_and_reject_non_positive(value, paise):
    assert payments.to_amount_paise(value) == paise


@pytest.mark.parametrize("mode,expected", [("CASH", "cash"), (" card ", "card"), ("bank", "bank"), ("bitcoin", "upi"), (None, "upi")])
def test_payment_modes_are_restricted(mode, expected):
    assert payments.normalize_payment_mode(mode) == expected


def test_signature_verification_accepts_only_the_correct_hmac(monkeypatch):
    monkeypatch.setattr(payments, "RAZORPAY_KEY_SECRET", "unit-test-secret")
    good = hmac.new(b"unit-test-secret", b"order_1|pay_1", hashlib.sha256).hexdigest()
    assert payments.verify_razorpay_signature("order_1", "pay_1", good)
    assert not payments.verify_razorpay_signature("order_1", "pay_2", good)
    tampered = good[:-1] + ("1" if good[-1] == "0" else "0")
    assert not payments.verify_razorpay_signature("order_1", "pay_1", tampered)
    assert not payments.verify_razorpay_signature("order_1", "pay_1", None)


def test_signature_verification_fails_closed_without_a_secret(monkeypatch):
    """With RAZORPAY_KEY_SECRET unset the HMAC key is empty, so anyone can compute a
    'valid' signature. Today both verify routes check require_razorpay_configured()
    first; the helper itself should still refuse (defence in depth)."""
    monkeypatch.setattr(payments, "RAZORPAY_KEY_SECRET", "")
    forged = hmac.new(b"", b"order_1|pay_1", hashlib.sha256).hexdigest()
    assert not payments.verify_razorpay_signature("order_1", "pay_1", forged)


# ── app factory: CSRF, headers, CORS ────────────────────────────────────────

@pytest.fixture
def app(monkeypatch):
    monkeypatch.delenv("FLASK_ENV", raising=False)
    a = create_service_app("unit")

    @a.post("/api/echo")
    def echo():
        return jsonify(ok=True)

    @a.get("/api/ping")
    def ping():
        return jsonify(ok=True)

    return a


def test_security_headers_and_csrf_cookie_on_every_response(app):
    r = app.test_client().get("/api/ping")
    assert r.headers["X-Content-Type-Options"] == "nosniff"
    assert r.headers["X-Frame-Options"] == "DENY"
    cookie = next(c for c in r.headers.getlist("Set-Cookie") if c.startswith("csrf_token="))
    assert "HttpOnly" not in cookie  # double-submit: the page must read it
    assert "SameSite=Lax" in cookie


def test_write_with_session_cookie_but_no_csrf_header_is_refused(app):
    c = app.test_client()
    c.set_cookie("hospai_session", "anything")
    c.set_cookie("csrf_token", "t" * 64)
    assert c.post("/api/echo").status_code == 403
    assert c.post("/api/echo", headers={"X-CSRF-Token": "x" * 64}).status_code == 403
    assert c.post("/api/echo", headers={"X-CSRF-Token": "t" * 64}).status_code == 200


def test_write_without_any_session_cookie_skips_csrf(app):
    # No ambient credential means nothing to forge; auth decorators then apply.
    assert app.test_client().post("/api/echo").status_code == 200


def test_login_is_exempt_from_csrf(app):
    @app.post("/api/auth/login")
    def login():
        return jsonify(ok=True)

    c = app.test_client()
    c.set_cookie("hospai_session", "stale")
    assert c.post("/api/auth/login").status_code == 200


@pytest.mark.parametrize("origin,allowed", [
    ("http://localhost:8443", True), ("https://app.hospai.ai", True), ("https://tenant.hospai.ai", True),
    ("https://evil.example", False), ("https://hospai.ai.evil.example", False), ("null", False),
])
def test_cors_reflects_only_trusted_origins(app, origin, allowed):
    r = app.test_client().get("/api/ping", headers={"Origin": origin})
    assert (r.headers.get("Access-Control-Allow-Origin") == origin) is allowed


@pytest.fixture
def platform_app(app, monkeypatch):
    from shared.session_auth import require_platform_admin

    monkeypatch.setenv("PLATFORM_ADMIN_USERNAME", "qa-root")
    monkeypatch.setenv("PLATFORM_ADMIN_PASSWORD", "qa-secret")

    @app.get("/api/platform/qa")
    def platform_qa():
        return require_platform_admin() or jsonify(ok=True)

    return app


def test_platform_admin_accepts_header_credentials(platform_app):
    r = platform_app.test_client().get(
        "/api/platform/qa",
        headers={"X-Platform-Admin-Username": "qa-root", "X-Platform-Admin-Password": "qa-secret"},
    )
    assert r.status_code == 200
    bad = platform_app.test_client().get(
        "/api/platform/qa",
        headers={"X-Platform-Admin-Username": "qa-root", "X-Platform-Admin-Password": "wrong"},
    )
    assert bad.status_code == 403


def test_platform_admin_ignores_query_string_credentials(platform_app):
    # Query strings land in access logs, proxies and browser history (S-2).
    r = platform_app.test_client().get(
        "/api/platform/qa?platform_admin_username=qa-root&platform_admin_password=qa-secret"
    )
    assert r.status_code == 403


def test_rate_limit_key_is_the_client_behind_the_gateway(app):
    # Every request reaches a service from the gateway's address; keying on it
    # would put all users in one bucket.
    from core.limiter import client_address

    with app.test_request_context("/", headers={"X-Real-IP": "203.0.113.7"}, environ_base={"REMOTE_ADDR": "172.18.0.5"}):
        assert client_address() == "203.0.113.7"
    with app.test_request_context("/", environ_base={"REMOTE_ADDR": "172.18.0.5"}):
        assert client_address() == "172.18.0.5"
