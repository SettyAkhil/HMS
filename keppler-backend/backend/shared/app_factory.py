"""Shared Flask app scaffolding reused by every microservice: CORS, CSRF,
security headers, and ISO-8601 JSON serialization. Each service's own
app.py calls create_service_app() then registers only its own blueprints.

The CORS/CSRF logic here is duplicated on every service rather than
centralized at the gateway so that a service is still safe to call
directly (e.g. in tests, or before the gateway is in front of it) --
the gateway is an additional layer, not the only enforcement point.
"""
import hmac
import os
import re
import secrets as secrets_module
from datetime import date, datetime

from flask import Flask, jsonify, request
from flask.json.provider import DefaultJSONProvider
from flask_cors import CORS

from core.auth import ADMIN_ROUTE_AUTH_COOKIE_NAME, SESSION_COOKIE_NAME
from core.limiter import limiter


class ISODateTimeJSONProvider(DefaultJSONProvider):
    """See backend/app.py's original docstring: Flask's default JSON
    provider serializes datetime/date as RFC 1123 HTTP-date strings, but
    the frontend expects ISO 8601. isoformat() fixes it at the source."""

    @staticmethod
    def default(o):
        if isinstance(o, (datetime, date)):
            return o.isoformat()
        return DefaultJSONProvider.default(o)


_DEFAULT_ALLOWED_ORIGINS = {
    "https://app.hospai.ai",
    "https://staging-app.hospai.ai",
    "http://localhost:5173",
    "http://127.0.0.1:5173",
}

CSRF_EXEMPT_PATHS = {"/api/auth/login", "/api/auth/setup-admin"}


def _is_allowed_origin(origin, allowed_origins):
    if not origin:
        return False
    if origin in allowed_origins:
        return True
    if re.match(r"^https://([a-z0-9-]+\.)*hospai\.ai$", origin):
        return True
    return re.match(r"^https?://(localhost|127\.0\.0\.1)(:\d+)?$", origin) is not None


def create_service_app(import_name, *, max_content_length=200 * 1024 * 1024):
    app = Flask(import_name)
    app.json = ISODateTimeJSONProvider(app)
    # The @limiter.limit decorators (login 20/min, setup-admin 3/min) only take
    # effect on an app the limiter is attached to. Only the legacy monolith did
    # this, so after the split into services every limit was inert.
    limiter.init_app(app)
    app.config["MAX_CONTENT_LENGTH"] = max_content_length

    env_allowed_origins = {
        origin.strip()
        for origin in os.getenv("CORS_ALLOWED_ORIGINS", "").split(",")
        if origin.strip()
    }
    allowed_origins = set(_DEFAULT_ALLOWED_ORIGINS) | env_allowed_origins
    is_development = os.getenv("FLASK_ENV", "").lower() == "development"

    CORS(
        app,
        resources={
            r"/api/*": {
                "origins": [
                    r"^https://([a-z0-9-]+\.)*hospai\.ai$",
                    r"^https?://(localhost|127\.0\.0\.1)(:\d+)?$",
                    *sorted(allowed_origins),
                ]
            }
        },
        supports_credentials=True,
        allow_headers=[
            "Content-Type",
            "Authorization",
            "X-Requested-With",
            "X-Hospital-Code",
            "X-CSRF-Token",
            "X-Platform-Admin-Username",
            "X-Platform-Admin-Password",
        ],
        methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
        # Without this the browser re-runs a preflight OPTIONS before EVERY
        # single API call (the custom X-Hospital-Code header makes all of them
        # non-simple requests), which doubles the request count and, on a
        # dashboard that fans out to a dozen endpoints at once, saturates the
        # browser's ~6-connections-per-origin limit before any real request
        # gets a connection. 24h is the cap Chrome honours.
        max_age=86400,
    )

    @app.before_request
    def csrf_protect():
        if app.config.get("TESTING"):
            return
        if request.path in CSRF_EXEMPT_PATHS:
            return
        if request.method not in ["GET", "HEAD", "OPTIONS", "TRACE"]:
            if (
                SESSION_COOKIE_NAME in request.cookies
                or ADMIN_ROUTE_AUTH_COOKIE_NAME in request.cookies
            ):
                token = request.cookies.get("csrf_token")
                header_token = request.headers.get("X-CSRF-Token")
                if token and header_token and hmac.compare_digest(token, header_token):
                    return
                if not is_development or app.config.get("TESTING") is False:
                    if (
                        not token
                        or not header_token
                        or not hmac.compare_digest(token, header_token)
                    ):
                        return jsonify({"error": "CSRF token missing or incorrect"}), 403

    @app.after_request
    def security_headers(response):
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        # JSON is never rendered, so it may load nothing at all. Files the API
        # serves (PDFs, images) keep only frame-ancestors: a default-src 'none'
        # on a PDF stops the browser's built-in viewer.
        response.headers.setdefault(
            "Content-Security-Policy",
            "default-src 'none'; frame-ancestors 'none'"
            if response.mimetype == "application/json"
            else "frame-ancestors 'none'",
        )
        if request.is_secure:
            response.headers["Strict-Transport-Security"] = (
                "max-age=31536000; includeSubDomains"
            )
        if "csrf_token" not in request.cookies:
            is_https = (
                request.is_secure
                or os.getenv("SESSION_COOKIE_SECURE", "").lower() == "true"
            )
            response.set_cookie(
                "csrf_token",
                secrets_module.token_hex(32),
                secure=is_https,
                httponly=False,
                samesite="Lax" if not is_https else "Strict",
                path="/",
            )
        return response

    @app.after_request
    def add_cors_headers(response):
        origin = request.headers.get("Origin")
        if _is_allowed_origin(origin, allowed_origins):
            response.headers["Access-Control-Allow-Origin"] = origin
            response.headers["Access-Control-Allow-Credentials"] = "true"
            response.headers["Access-Control-Allow-Headers"] = (
                "Content-Type, Authorization, X-Requested-With, X-Hospital-Code, X-CSRF-Token, X-Platform-Admin-Username, X-Platform-Admin-Password"
            )
            response.headers["Access-Control-Allow-Methods"] = (
                "GET, POST, PUT, DELETE, OPTIONS"
            )
            # This handler runs after flask-cors and overwrites its headers, so
            # the max_age configured on CORS() above never reached the browser.
            # Without it every API call is preceded by its own preflight (the
            # custom X-Hospital-Code header makes them all non-simple), which
            # doubles the request count and saturates the browser's ~6
            # connections per origin on any screen that fans out to several
            # endpoints at once. 24h is the maximum Chrome honours.
            if request.method == "OPTIONS":
                response.headers["Access-Control-Max-Age"] = "86400"
        return response

    @app.route("/api/<path:_path>", methods=["OPTIONS"])
    def preflight(_path):
        return ("", 204)

    @app.get("/api/health")
    def health():
        return jsonify({"status": "ok"})

    @app.errorhandler(413)
    def _handle_payload_too_large(exc):
        return jsonify({"error": "File is too large (200MB limit)."}), 413

    return app
