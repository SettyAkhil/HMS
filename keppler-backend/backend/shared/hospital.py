import re

from flask import abort, g, jsonify, make_response, request
from werkzeug.exceptions import BadRequest

from utils.database import get_hospital_by_code, resolve_hospital_id


def validate_hospital_code(value: str) -> str:
    code = (value or "").strip().lower()
    if not code:
        raise BadRequest("hospital_code is required")
    if not re.fullmatch(r"[a-z0-9-]{3,64}", code):
        raise BadRequest(
            "hospital_code must contain only lowercase letters, numbers, and '-'"
        )
    return code


def request_hospital_id() -> int:
    requested_code = request.headers.get("X-Hospital-Code", "")
    try:
        code = validate_hospital_code(requested_code) if requested_code else None
    except BadRequest:
        code = None
    if code is None:
        return resolve_hospital_id(None)
    # Look the code up; never create it. This runs on unauthenticated routes
    # (login, check-username), and resolve_hospital_id() creates a hospital for
    # any unknown code -- so anonymous callers could mint tenants at will.
    # Hospitals are created by platform administration only.
    hospital = get_hospital_by_code(code)
    if not hospital:
        abort(make_response(jsonify({"error": "Unknown hospital code"}), 400))
    return hospital["id"]


def current_hospital_id() -> int:
    user = getattr(g, "current_user", None) or {}
    return int(user.get("hospital_id") or request_hospital_id())


def normalize_department_name(value):
    normalized = " ".join(str(value or "").strip().split())
    if not normalized:
        raise BadRequest("department_name is required")
    if len(normalized) > 120:
        raise BadRequest("department_name must be at most 120 characters")
    return normalized
