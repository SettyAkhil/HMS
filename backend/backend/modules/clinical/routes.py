"""Clinical → Orders and Care Plan.

Orders here cover the physician-order types that have no other home in this
schema -- radiology, nursing, dietary, referral. Lab and pharmacy orders
already have their own dedicated, working flows (diagnostics/lab billing,
pharmacy_prescriptions) and are deliberately out of scope here so this
doesn't duplicate them.

Care Plan is one structured, editable-over-time record per patient (see
ensure_clinical_tables() in utils/database.py) -- a problem/goal list plus a
plan narrative, distinct from the flat, append-only diagnosis_records list
that backs the existing "Problems" tab.
"""
from flask import Blueprint, request, jsonify, g

from shared.session_auth import require_permissions
from shared.audit import log_audit_event
from shared.responses import rows_to_dicts, validate_required_fields

from utils.database import (
    add_clinical_order,
    get_clinical_orders,
    update_clinical_order_status,
    get_care_plan,
    upsert_care_plan,
)
import json

clinical_bp = Blueprint("clinical", __name__)

ORDER_TYPES = ("radiology", "nursing", "dietary", "referral")
ORDER_PRIORITIES = ("routine", "urgent", "stat")
ORDER_STATUSES = ("ordered", "in_progress", "completed", "cancelled")
CARE_PLAN_STATUSES = ("active", "resolved", "superseded")


@clinical_bp.get("/api/clinical/<patient_id>/orders")
@require_permissions("patients.read")
def list_clinical_orders(patient_id):
    return jsonify({"orders": rows_to_dicts(get_clinical_orders(patient_id))})


@clinical_bp.post("/api/clinical/<patient_id>/orders")
@require_permissions("patients.clinical.write")
def create_clinical_order(patient_id):
    payload = request.get_json(force=True) or {}
    validation_error = validate_required_fields(payload, ["order_type", "description"])
    if validation_error:
        return validation_error
    if payload["order_type"] not in ORDER_TYPES:
        return jsonify({"error": f"order_type must be one of {ORDER_TYPES}"}), 400
    priority = payload.get("priority") or "routine"
    if priority not in ORDER_PRIORITIES:
        return jsonify({"error": f"priority must be one of {ORDER_PRIORITIES}"}), 400
    row = add_clinical_order({
        "patient_id": patient_id,
        "admission_id": payload.get("admission_id"),
        "order_type": payload["order_type"],
        "description": payload["description"],
        "priority": priority,
        "notes": payload.get("notes"),
        "ordered_by": payload.get("ordered_by") or (g.current_user or {}).get("username"),
    })
    record = dict(row) if row else {}
    log_audit_event("create", "clinical_orders", str(record.get("id")), {"patient_id": patient_id})
    return jsonify(record)


@clinical_bp.patch("/api/clinical/<patient_id>/orders/<int:order_id>")
@require_permissions("patients.clinical.write")
def update_clinical_order(patient_id, order_id):
    payload = request.get_json(force=True) or {}
    status = payload.get("status")
    if status not in ORDER_STATUSES:
        return jsonify({"error": f"status must be one of {ORDER_STATUSES}"}), 400
    ok = update_clinical_order_status(order_id, patient_id, status, notes=payload.get("notes"))
    if not ok:
        return jsonify({"error": "Order not found"}), 404
    log_audit_event("update", "clinical_orders", str(order_id), {"patient_id": patient_id, "status": status})
    return jsonify({"ok": True})


@clinical_bp.get("/api/clinical/<patient_id>/care-plan")
@require_permissions("patients.read")
def get_clinical_care_plan(patient_id):
    row = get_care_plan(patient_id)
    if not row:
        return jsonify({"care_plan": None})
    record = dict(row)
    try:
        record["problems"] = json.loads(record["problems"] or "[]")
    except (TypeError, ValueError):
        record["problems"] = []
    return jsonify({"care_plan": record})


@clinical_bp.put("/api/clinical/<patient_id>/care-plan")
@require_permissions("patients.clinical.write")
def save_clinical_care_plan(patient_id):
    payload = request.get_json(force=True) or {}
    problems = payload.get("problems")
    if not isinstance(problems, list):
        return jsonify({"error": "problems must be an array"}), 400
    status = payload.get("status") or "active"
    if status not in CARE_PLAN_STATUSES:
        return jsonify({"error": f"status must be one of {CARE_PLAN_STATUSES}"}), 400
    row = upsert_care_plan(
        patient_id,
        problems,
        payload.get("narrative"),
        status=status,
        updated_by=(g.current_user or {}).get("username"),
    )
    record = dict(row) if row else {}
    if record.get("problems") is not None:
        try:
            record["problems"] = json.loads(record["problems"] or "[]")
        except (TypeError, ValueError):
            record["problems"] = problems
    log_audit_event("update", "care_plans", patient_id, {"problem_count": len(problems)})
    return jsonify({"care_plan": record})
