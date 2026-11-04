from flask import Blueprint, request, jsonify
import os
from core.auth import (
    ADMIN_ROUTE_AUTH_COOKIE_NAME,
    create_admin_route_auth_token,
    verify_admin_route_auth_token,
    verify_admin_route_password,
    is_admin_route_auth_configured,
    reset_hospital_admin_password,
    ADMIN_ROUTE_AUTH_TTL_SECONDS,
    signup_employee,
    ASSIGNABLE_MODULES,
)
from utils.database import (
    list_hospitals,
    create_hospital,
    set_hospital_status,
    get_all_employees,
    get_employee,
    update_employee,
    get_hospital_by_code,
)
from shared.session_auth import (
    require_admin_route_auth,
    require_platform_admin,
)
from shared.hospital import (
    request_hospital_id,
    validate_hospital_code,
)
from shared.responses import (
    row_to_dict,
    rows_to_dicts,
)

admin_bp = Blueprint("admin", __name__)


@admin_bp.get("/api/platform/hospitals")
def platform_hospitals_list():
    admin_gate = require_platform_admin()
    if admin_gate:
        return admin_gate
    hospitals = list_hospitals()
    return jsonify({"hospitals": rows_to_dicts(hospitals)})


@admin_bp.post("/api/platform/hospitals")
def platform_hospitals_create():
    admin_gate = require_platform_admin()
    if admin_gate:
        return admin_gate
    payload = request.get_json(force=True)
    hospital_code = validate_hospital_code(payload.get("hospital_code", ""))
    hospital_name = payload.get("name")
    hospital_id, created = create_hospital(hospital_code, hospital_name)
    hospital = get_hospital_by_code(hospital_code)
    status = 201 if created else 200
    return (
        jsonify(
            {
                "created": created,
                "hospital_id": hospital_id,
                "hospital": row_to_dict(hospital),
            }
        ),
        status,
    )


@admin_bp.post("/api/platform/hospitals/<hospital_code>/disable")
def platform_hospital_disable(hospital_code):
    admin_gate = require_platform_admin()
    if admin_gate:
        return admin_gate
    payload = request.get_json(silent=True) or {}
    code = validate_hospital_code(hospital_code)
    changed = set_hospital_status(code, "inactive", reason=payload.get("reason"))
    if not changed:
        return jsonify({"error": "Hospital not found"}), 404
    return jsonify(
        {"success": True, "hospital": row_to_dict(get_hospital_by_code(code))}
    )


@admin_bp.post("/api/platform/hospitals/<hospital_code>/enable")
def platform_hospital_enable(hospital_code):
    admin_gate = require_platform_admin()
    if admin_gate:
        return admin_gate
    code = validate_hospital_code(hospital_code)
    changed = set_hospital_status(code, "active")
    if not changed:
        return jsonify({"error": "Hospital not found"}), 404
    return jsonify(
        {"success": True, "hospital": row_to_dict(get_hospital_by_code(code))}
    )


@admin_bp.post("/api/platform/hospitals/<hospital_code>/admin/reset-password")
def platform_admin_reset_password(hospital_code):
    admin_gate = require_platform_admin()
    if admin_gate:
        return admin_gate

    code = validate_hospital_code(hospital_code)
    hospital = get_hospital_by_code(code)
    if not hospital:
        return jsonify({"error": "Hospital not found"}), 404

    payload = request.get_json(force=True)
    username = payload.get("username", "")
    new_password = payload.get("new_password", "")
    result = reset_hospital_admin_password(hospital["id"], username, new_password)
    status = 200 if result.get("success") else 400
    return jsonify(result), status


@admin_bp.get("/api/admin/auth/session")
def admin_route_auth_session():
    token = request.cookies.get(ADMIN_ROUTE_AUTH_COOKIE_NAME)
    authorized = verify_admin_route_auth_token(token)
    return jsonify(
        {"authorized": authorized, "configured": is_admin_route_auth_configured()}
    )


@admin_bp.post("/api/admin/auth/login")
def admin_route_auth_login():
    if not is_admin_route_auth_configured():
        return (
            jsonify({"error": "ADMIN_ROUTE_PASSWORD is not configured on the server."}),
            503,
        )

    payload = request.get_json(force=True)
    password = payload.get("password", "")
    if not verify_admin_route_password(password):
        return jsonify({"error": "Invalid admin route password."}), 403

    token = create_admin_route_auth_token()
    response = jsonify({"success": True, "authorized": True})
    response.set_cookie(
        ADMIN_ROUTE_AUTH_COOKIE_NAME,
        token,
        httponly=True,
        secure=request.is_secure
        or os.getenv("SESSION_COOKIE_SECURE", "").lower() == "true",
        samesite=os.getenv("SESSION_COOKIE_SAMESITE", "Lax"),
        path="/",
        max_age=ADMIN_ROUTE_AUTH_TTL_SECONDS,
    )
    return response


@admin_bp.post("/api/admin/auth/logout")
def admin_route_auth_logout():
    response = jsonify({"success": True})
    response.delete_cookie(ADMIN_ROUTE_AUTH_COOKIE_NAME, path="/")
    return response


@admin_bp.post("/api/admin/create-account")
@require_admin_route_auth
def admin_create_account():
    payload = request.get_json(force=True) or {}
    forced_payload = {
        **payload,
        "user_type": "admin",
        "module_access": [
            "dashboard",
            "patients",
            "billing",
            "pharmacy",
            "lab",
            "hrms",
            "symptom_ai",
        ],
    }
    result = signup_employee(
        forced_payload, allow_admin_creation=True, hospital_id=request_hospital_id()
    )
    status = 201 if result.get("success") else 400
    return jsonify(result), status


@admin_bp.get("/api/admin/users")
@require_admin_route_auth
def admin_users_list():
    return jsonify({"users": rows_to_dicts(get_all_employees())})


@admin_bp.post("/api/admin/users")
@require_admin_route_auth
def admin_users_create():
    payload = request.get_json(force=True) or {}
    requested_type = str(payload.get("user_type", "normal")).strip().lower()
    user_type = "admin" if requested_type == "admin" else "normal"
    module_access = (
        list(ASSIGNABLE_MODULES)
        if user_type == "admin"
        else payload.get("module_access", [])
    )

    created_payload = {
        **payload,
        "user_type": user_type,
        "module_access": module_access,
    }
    result = signup_employee(
        created_payload, allow_admin_creation=True, hospital_id=request_hospital_id()
    )
    status = 201 if result.get("success") else 400
    return jsonify(result), status


@admin_bp.post("/api/admin/users/<employee_id>/promote")
@require_admin_route_auth
def admin_promote_user(employee_id):
    target = get_employee(employee_id=employee_id)
    if not target:
        return jsonify({"error": "Employee not found"}), 404

    promoted = update_employee(
        employee_id,
        {
            "user_type": "admin",
            "access_role": "owner",
            "module_access": list(ASSIGNABLE_MODULES),
        },
    )
    if not promoted:
        return jsonify({"error": "Employee not found"}), 404

    return jsonify({"success": True, "employee_id": employee_id, "user_type": "admin"})
