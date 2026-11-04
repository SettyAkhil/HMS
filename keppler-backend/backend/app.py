from __future__ import annotations
import os
import sys

_HERE = os.path.dirname(os.path.abspath(__file__))
if _HERE not in sys.path:
    sys.path.insert(0, _HERE)

if __name__ == "__main__":
    # Blueprint modules do `from app import (...)`. When this file is executed directly
    # (`python app.py`), Python registers it as `__main__`, not `app`, so that internal
    # import re-executes this whole module under a second identity and crashes with a
    # circular-import error. Aliasing `app` to the in-progress `__main__` module here
    # (before the blueprint imports further down trigger) makes both names resolve to
    # the same module object, matching how it already works when imported as `import app`.
    sys.modules.setdefault("app", sys.modules[__name__])

import csv
import io
import json
import os
import re
import base64
import hashlib
import hmac
from datetime import date, datetime
from functools import wraps
from urllib import error as urllib_error
from urllib import request as urllib_request

from flask import Flask, g, jsonify, request, send_file, make_response
from flask.json.provider import DefaultJSONProvider
from flask_cors import CORS
import secrets
from core.limiter import limiter
from core.auth import (
    ADMIN_ROUTE_AUTH_COOKIE_NAME,
    ADMIN_ROUTE_AUTH_TTL_SECONDS,
    ASSIGNABLE_MODULES,
    SESSION_COOKIE_NAME,
    SESSION_TTL_SECONDS,
    authenticate,
    check_username_exists,
    create_admin_route_auth_token,
    create_default_users,
    create_session,
    delete_session,
    get_session_user,
    is_admin_route_auth_configured,
    reset_hospital_admin_password,
    resolve_user_permissions,
    signup_employee,
    signup_hospital_admin,
    verify_admin_route_auth_token,
    verify_admin_route_password,
)
from core.export import generate_pdf, generate_word
from utils.ocr import LANGUAGE_NAMES
from core.storage import ObjectStorage
from ai.service import (
    extract_text_from_image,
    classify_and_extract_entities,
    patient_history_search,
)
from werkzeug.exceptions import BadRequest
from werkzeug.utils import secure_filename

from utils.database import (
    activate_employee,
    add_admission,
    add_audit_log,
    add_document,
    add_medication_schedule,
    add_observation_note,
    add_patient,
    add_patient_movement,
    check_duplicate_patient,
    create_account_ledger_entry,
    create_attendance,
    create_appointment,
    create_certificate,
    create_department,
    create_diagnostic_record,
    create_doctor_schedule,
    create_doctor_payout,
    create_encounter,
    create_hospital,
    create_insurance_verification,
    create_insurance_claim,
    create_invoice,
    create_lab_vendor,
    create_leave_request,
    create_ot_surgery,
    create_ot_theatre,
    create_patient_consent,
    create_payroll_record,
    create_pharmacy_purchase,
    create_pharmacy_sale,
    create_pharmacy_supplier,
    create_vendor_payment,
    current_ist_datetime,
    delete_account_ledger_entry,
    deactivate_employee,
    delete_attendance_record,
    delete_certificate,
    delete_department,
    delete_diagnostic_record,
    delete_doctor_schedule,
    delete_doctor_payout,
    delete_document,
    delete_employee,
    delete_insurance_claim,
    delete_inventory_item,
    delete_invoice,
    delete_lab_vendor,
    delete_leave_request,
    delete_ot_surgery,
    delete_ot_theatre,
    delete_patient,
    delete_payroll_record,
    delete_pharmacy_purchase,
    delete_pharmacy_supplier,
    delete_vendor_payment,
    generate_patient_id,
    get_admissions,
    get_accounts_summary,
    get_all_employees,
    get_all_patients,
    get_audit_logs,
    get_dashboard_analytics,
    get_diagnostic_summary,
    get_document,
    get_documents,
    get_employee,
    get_employee_stats,
    get_hospital_by_code,
    get_hospital_dashboard_summary,
    get_invoice_by_id,
    get_op_summary,
    get_ot_summary,
    get_patient,
    get_patient_stats,
    get_pharmacy_summary,
    get_reports_overview,
    get_revenue_summary,
    init_database,
    list_account_ledger_entries,
    list_attendance,
    list_appointments,
    list_bed_allocations,
    list_certificates,
    list_departments,
    list_diagnostics,
    list_doctor_schedules,
    list_doctor_payouts,
    list_insurance_claims,
    list_insurance_verifications,
    list_pharmacy_purchases,
    list_pharmacy_sales,
    list_pharmacy_suppliers,
    list_encounters,
    list_hospitals,
    list_inventory_items,
    list_invoices,
    list_lab_vendors,
    list_leave_requests,
    list_medication_schedules,
    list_observation_notes,
    list_ot_surgeries,
    list_ot_theatres,
    list_patient_consents,
    list_patient_movements,
    list_payroll,
    list_vendor_payments,
    record_invoice_payment,
    resolve_hospital_id,
    search_employees,
    search_patients,
    set_hospital_status,
    update_account_ledger_entry,
    update_attendance_record,
    update_appointment,
    update_department,
    update_diagnostic_record,
    update_doctor_schedule,
    update_doctor_payout,
    update_document_ocr,
    update_employee,
    update_insurance_verification,
    update_insurance_claim,
    update_invoice,
    update_lab_vendor,
    update_leave_status,
    update_ot_surgery,
    update_ot_theatre,
    update_patient_consent,
    update_patient,
    update_payroll_record,
    update_pharmacy_purchase,
    update_pharmacy_supplier,
    update_vendor_payment,
    upsert_inventory_item,
)

BASE_DIR = os.path.dirname(__file__)
STORAGE = ObjectStorage()

from core.celery_app import celery_init_app

class ISODateTimeJSONProvider(DefaultJSONProvider):
    """Flask's DefaultJSONProvider serializes datetime/date objects as RFC 1123
    HTTP-date strings (e.g. "Wed, 19 Aug 2026 16:41:22 GMT"), not ISO 8601 --
    that's the same format used for HTTP headers, reused here as a generic
    fallback. Every timestamp field in every API response (recorded_at,
    triaged_at, arrival_at, created_at, ...) goes through this, but the
    frontend's date parsing (lib/format.ts's parseTimestamp, used by every
    formatDateTimeIST() call) expects ISO 8601 and silently fails on that
    format, falling back to displaying the raw HTTP-date string verbatim --
    e.g. the ER Vitals table showing "Wed, 19 Aug 2026 16:41:22 GMT" instead
    of a proper IST time. isoformat() fixes every timestamp across the whole
    app at the source instead of teaching every frontend parser this format."""

    @staticmethod
    def default(o):
        if isinstance(o, (datetime, date)):
            return o.isoformat()
        return DefaultJSONProvider.default(o)


app = Flask(__name__)
app.json = ISODateTimeJSONProvider(app)
# Bulk patient-list uploads (AI Mode) can legitimately be up to 200MB; without this,
# Werkzeug happily buffers unbounded request bodies before any route code runs.
app.config["MAX_CONTENT_LENGTH"] = 200 * 1024 * 1024
limiter.init_app(app)
celery = celery_init_app(app)
default_allowed_origins = {
    "https://app.hospai.ai",
    "https://staging-app.hospai.ai",
    "http://localhost:5173",
    "http://127.0.0.1:5173",
}
env_allowed_origins = {
    origin.strip()
    for origin in os.getenv("CORS_ALLOWED_ORIGINS", "").split(",")
    if origin.strip()
}
is_development = os.getenv("FLASK_ENV", "").lower() == "development"
ALLOWED_ORIGINS = set(default_allowed_origins)
ALLOWED_ORIGINS.update(env_allowed_origins)


def is_allowed_origin(origin: str | None) -> bool:
    if not origin:
        return False
    if origin in ALLOWED_ORIGINS:
        return True
    # Allow all HospAI HTTPS subdomains (staging/prod/custom app surfaces).
    if re.match(r"^https://([a-z0-9-]+\.)*hospai\.ai$", origin):
        return True
    # Allow localhost dev servers on any port (e.g. Vite 5173/5174/4173).
    return re.match(r"^https?://(localhost|127\.0\.0\.1)(:\d+)?$", origin) is not None


CORS(
    app,
    resources={
        r"/api/*": {
            "origins": [
                r"^https://([a-z0-9-]+\.)*hospai\.ai$",
                r"^https?://(localhost|127\.0\.0\.1)(:\d+)?$",
                *sorted(ALLOWED_ORIGINS),
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
)


CSRF_EXEMPT_PATHS = {"/api/auth/login", "/api/auth/setup-admin"}


@app.before_request
def csrf_protect():
    if app.config.get("TESTING"):
        return
    if request.path in CSRF_EXEMPT_PATHS:
        return
    if request.method not in ["GET", "HEAD", "OPTIONS", "TRACE"]:
        # Only enforce CSRF if a session cookie is present (public endpoints don't use cookies).
        if (
            SESSION_COOKIE_NAME in request.cookies
            or ADMIN_ROUTE_AUTH_COOKIE_NAME in request.cookies
        ):
            token = request.cookies.get("csrf_token")
            header_token = request.headers.get("X-CSRF-Token")
            if token and header_token and hmac.compare_digest(token, header_token):
                return
            # Enforce CSRF when not in development mode OR when TESTING was explicitly
            # disabled (i.e., TESTING=False was set, typically by the CSRF test itself).
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
    # Only set HSTS on HTTPS connections
    if request.is_secure:
        response.headers["Strict-Transport-Security"] = (
            "max-age=31536000; includeSubDomains"
        )

    # Set CSRF cookie if not present.
    # secure=False allows the cookie to be set over HTTP (local dev).
    # secure=True is only needed in production HTTPS deployments.
    if "csrf_token" not in request.cookies:
        is_https = (
            request.is_secure
            or os.getenv("SESSION_COOKIE_SECURE", "").lower() == "true"
        )
        response.set_cookie(
            "csrf_token",
            secrets.token_hex(32),
            secure=is_https,
            httponly=False,  # Must be readable by frontend JS
            samesite="Lax" if not is_https else "Strict",
            path="/",
        )
    return response


@app.after_request
def add_cors_headers(response):
    origin = request.headers.get("Origin")
    if is_allowed_origin(origin):
        response.headers["Access-Control-Allow-Origin"] = origin
        response.headers["Access-Control-Allow-Credentials"] = "true"
        response.headers["Access-Control-Allow-Headers"] = (
            "Content-Type, Authorization, X-Requested-With, X-Hospital-Code, X-CSRF-Token, X-Platform-Admin-Username, X-Platform-Admin-Password"
        )
        response.headers["Access-Control-Allow-Methods"] = (
            "GET, POST, PUT, DELETE, OPTIONS"
        )
    return response


@app.route("/api/<path:_path>", methods=["OPTIONS"])
def preflight(_path):
    return ("", 204)


import sys

if "pytest" not in sys.modules:
    init_database()
    # Re-seeds (and re-activates, resetting the password) these 4 well-known
    # demo accounts on EVERY startup, not just first-run -- fine for local/
    # demo use, but a real credential-exposure risk left on for a public
    # deployment. Set SEED_DEMO_USERS=false in .env to disable.
    if os.getenv("SEED_DEMO_USERS", "true").strip().lower() != "false":
        create_default_users()


from shared.responses import row_to_dict, rows_to_dicts, validate_required_fields
from shared.hospital import (
    validate_hospital_code,
    request_hospital_id,
    current_hospital_id,
    normalize_department_name,
)
from shared.session_auth import (
    require_session,
    require_permissions,
    require_platform_admin,
    require_admin_route_auth,
    session_cookie_settings as _session_cookie_settings,
)
from shared.uploads import save_uploaded_file, STORAGE
from shared.audit import log_audit_event
from shared.payments import (
    RAZORPAY_KEY_ID,
    RAZORPAY_KEY_SECRET,
    RAZORPAY_API_BASE,
    is_razorpay_configured,
    require_razorpay_configured,
    to_amount_paise,
    create_razorpay_order,
    verify_razorpay_signature,
    normalize_payment_mode,
)
from shared.reports import build_reports_export_text


@app.get("/api/health")
def health():
    return jsonify({"status": "ok"})


@app.get("/api/payments/razorpay/config")
def razorpay_config():
    return jsonify(
        {
            "configured": is_razorpay_configured(),
            "key_id": RAZORPAY_KEY_ID if is_razorpay_configured() else "",
        }
    )


def require_admin_route_auth(view):
    @wraps(view)
    def wrapper(*args, **kwargs):
        token = request.cookies.get(ADMIN_ROUTE_AUTH_COOKIE_NAME)
        if not verify_admin_route_auth_token(token):
            return jsonify({"error": "Admin route authentication required"}), 403
        return view(*args, **kwargs)

    return wrapper


@app.get("/api/languages")
def languages():
    return jsonify({"languages": LANGUAGE_NAMES})


def build_reports_export_text(overview):
    lines = [
        "# HospAI Reports Overview",
        "",
        "## Financial Summary",
        f"- Total billed: INR {overview['billing_summary']['total_billed']:.2f}",
        f"- Total collected: INR {overview['billing_summary']['total_collected']:.2f}",
        f"- Total due: INR {overview['billing_summary']['total_due']:.2f}",
        f"- Net position: INR {overview['accounts_summary']['net_position']:.2f}",
        "",
        "## Operations",
        f"- Monthly OP: {overview['hospital_summary']['ip_op_counts']['monthly_op']}",
        f"- Monthly IP: {overview['hospital_summary']['ip_op_counts']['monthly_ip']}",
        f"- Average LOS: {overview['alos_summary']['average_los_days']} days",
        f"- Admissions counted: {overview['alos_summary']['admission_count']}",
        "",
        "## Clinic Income",
    ]

    for row in overview.get("clinic_income", []):
        lines.append(f"- {row['label']}: INR {float(row['count']):.2f}")

    lines.extend(["", "## Discounts by Module"])
    for row in overview.get("discount_by_module", []):
        lines.append(f"- {row['label']}: INR {float(row['count']):.2f}")

    lines.extend(["", "## Payment Status"])
    for row in overview.get("payment_status_breakdown", []):
        lines.append(f"- {row['label']}: {row['count']} invoice(s)")

    return "\n".join(lines)


# ==================== Employee Management ====================


# ==================== Extended Patient Management ====================


# ==================== Billing ====================


# ==================== Pharmacy ====================


# ==================== Lab & Diagnostics ====================


# ==================== OT ====================


# ==================== Accounts ====================


# ==================== HRMS ====================


# ==================== Audit ====================


from modules.reports.routes import reports_bp

app.register_blueprint(reports_bp)
from modules.dashboard.routes import dashboard_bp

app.register_blueprint(dashboard_bp)
from modules.op.routes import op_bp

app.register_blueprint(op_bp)
from modules.beds.routes import beds_bp

app.register_blueprint(beds_bp)
from modules.documents.routes import documents_bp

app.register_blueprint(documents_bp)
from modules.ai_exports.routes import ai_exports_bp

app.register_blueprint(ai_exports_bp)

from modules.accounts.routes import accounts_bp

app.register_blueprint(accounts_bp)

from modules.auth.routes import auth_bp

app.register_blueprint(auth_bp)

from modules.admin.routes import admin_bp

app.register_blueprint(admin_bp)

from modules.patients.routes import patients_bp

app.register_blueprint(patients_bp)

from modules.appointments.routes import appointments_bp

app.register_blueprint(appointments_bp)

from modules.billing.routes import billing_bp

app.register_blueprint(billing_bp)

from modules.pharmacy.routes import pharmacy_bp

app.register_blueprint(pharmacy_bp)

from modules.hr.routes import hr_bp

app.register_blueprint(hr_bp)


from modules.queue.routes import bp as queue_bp

app.register_blueprint(queue_bp)

from modules.symptom_ai.routes import symptom_ai_bp

app.register_blueprint(symptom_ai_bp)

from modules.ocr_portal.routes import ocr_portal_bp

app.register_blueprint(ocr_portal_bp)

from modules.whatsapp.routes import whatsapp_bp

app.register_blueprint(whatsapp_bp)

from modules.messaging.routes import messaging_bp

app.register_blueprint(messaging_bp)

from modules.emr.routes import emr_bp

app.register_blueprint(emr_bp)

from modules.bulk_import.routes import bulk_import_bp

app.register_blueprint(bulk_import_bp)

from modules.er.routes import er_bp

app.register_blueprint(er_bp)


@app.errorhandler(413)
def _handle_payload_too_large(exc):
    return jsonify({"error": "File is too large (200MB limit)."}), 413


if __name__ == "__main__":
    from urllib.parse import urlsplit
    from utils.database import DATABASE_URL

    app.logger.info(f"Database: PostgreSQL (URL: {DATABASE_URL})")
    print(f"=== STARTING BACKEND ===")
    port = int(os.getenv("PORT", "5001"))
    app.run(host="0.0.0.0", port=port, debug=os.getenv("FLASK_DEBUG", "").lower() == "true")
