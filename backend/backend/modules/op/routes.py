from core.export import generate_pdf, generate_word
from core.storage import ObjectStorage
from flask import Blueprint, jsonify, request, g, send_file
from werkzeug.exceptions import BadRequest
import os
import uuid
import time
from datetime import datetime
from io import BytesIO

from shared.session_auth import (
    require_permissions,
    require_session,
)
from shared.audit import log_audit_event
from shared.responses import (
    row_to_dict,
    rows_to_dicts,
    validate_required_fields,
)
from shared.hospital import current_hospital_id

from utils.database import (
    create_doctor_schedule,
    delete_doctor_schedule,
    get_op_summary,
    list_doctor_schedules,
    update_doctor_schedule,
    create_doctor,
    list_doctors,
    update_doctor,
    delete_doctor,
    get_suggested_doctors,
    register_op_visit,
    get_op_visit,
    list_appointments,
    update_op_symptoms,
    transition_op_status,
    save_op_consultation,
    add_op_vitals,
    check_patient_match,
    get_eligible_op_doctors,
    assign_op_doctor,
    set_op_further_action,
    get_op_timeline,
    get_op_patient_history,
)

op_bp = Blueprint("op", __name__)


@op_bp.get("/api/op/patients/check-match")
@require_session
def op_patient_check_match():
    term = request.args.get("q") or request.args.get("query") or ""
    result = check_patient_match(term, hospital_id=current_hospital_id())
    return jsonify(result)


@op_bp.get("/api/op/doctors/eligible")
@require_session
def op_doctors_eligible():
    department = request.args.get("department")
    patient_gender = request.args.get("patient_gender")
    doctor_gender_preference = request.args.get("doctor_gender_preference")
    result = get_eligible_op_doctors(
        department=department,
        patient_gender=patient_gender,
        doctor_gender_preference=doctor_gender_preference,
        hospital_id=current_hospital_id(),
    )
    return jsonify(result)


@op_bp.post("/api/op/visits")
@require_permissions("op.schedules.write")
def op_visit_create():
    payload = request.get_json(force=True) or {}
    try:
        result = register_op_visit(
            # Sent alongside patient_id too: it creates the record when the id
            # (issued at the front desk) is not in the backend yet.
            patient_data=payload.get("patient"),
            patient_id=payload.get("patient_id"),
            appointment_data={
                **(payload.get("appointment") or {}),
                "created_by": g.current_user.get("username"),
            },
            hospital_id=current_hospital_id(),
        )
    except (KeyError, ValueError) as error:
        return jsonify({"error": str(error)}), 400
    log_audit_event("create", "op_visits", str(result["appointment_id"]), result)
    return jsonify(result), 201


@op_bp.get("/api/op/visits/<int:appointment_id>")
@require_permissions("patients.read")
def op_visit_get(appointment_id):
    visit = get_op_visit(appointment_id, hospital_id=current_hospital_id())
    if not visit:
        return jsonify({"error": "OP visit not found"}), 404
    return jsonify({"visit": row_to_dict(visit)})


@op_bp.get("/api/op/patients/<patient_id>/history")
@require_permissions("patients.read")
def op_patient_history(patient_id):
    history = get_op_patient_history(patient_id, hospital_id=current_hospital_id())
    return jsonify({"visits": history})


@op_bp.get("/api/op/visits/<int:appointment_id>/timeline")
@require_permissions("patients.read")
def op_visit_timeline(appointment_id):
    timeline = get_op_timeline(appointment_id, hospital_id=current_hospital_id())
    return jsonify({"timeline": rows_to_dicts(timeline)})


@op_bp.put("/api/op/visits/<int:appointment_id>/symptoms")
@require_permissions("op.schedules.write")
def op_visit_symptoms_update(appointment_id):
    payload = request.get_json(force=True) or {}
    if not payload.get("chief_complaint") and not payload.get("symptoms"):
        return jsonify({"error": "Chief complaint or symptoms are required"}), 400
    updated = update_op_symptoms(appointment_id, payload, hospital_id=current_hospital_id())
    if not updated:
        return jsonify({"error": "OP visit not found or already closed"}), 404
    log_audit_event("update", "op_symptoms", str(appointment_id), payload)
    return jsonify({"status": "ok"})


@op_bp.post("/api/op/visits/<int:appointment_id>/assign")
@require_permissions("op.schedules.write")
def op_visit_assign_doctor(appointment_id):
    payload = request.get_json(force=True) or {}
    doctor_name = payload.get("doctor_name")
    if not doctor_name:
        return jsonify({"error": "doctor_name is required"}), 400
    res = assign_op_doctor(
        appointment_id,
        doctor_name,
        hospital_id=current_hospital_id(),
        actor=g.current_user.get("username"),
    )
    if res == "not_found":
        return jsonify({"error": "OP visit not found"}), 404
    if res == "unavailable":
        return jsonify({"error": "Doctor is unavailable"}), 409
    log_audit_event("update", "op_doctor_assignment", str(appointment_id), {"doctor_name": doctor_name})
    return jsonify({"status": "ok", "doctor_name": doctor_name})


@op_bp.post("/api/op/visits/<int:appointment_id>/status")
@require_permissions("op.schedules.write")
def op_visit_status_update(appointment_id):
    status = (request.get_json(force=True) or {}).get("status")
    result = transition_op_status(
        appointment_id,
        status,
        hospital_id=current_hospital_id(),
        actor=g.current_user.get("username"),
    )
    if result == "not_found":
        return jsonify({"error": "OP visit not found"}), 404
    if result == "invalid_transition":
        return jsonify({"error": "Invalid OP status transition"}), 409
    log_audit_event("update", "op_status", str(appointment_id), {"status": status})
    return jsonify({"status": "ok", "op_status": status})


@op_bp.put("/api/op/visits/<int:appointment_id>/consultation")
@require_permissions("op.schedules.write")
def op_visit_consultation(appointment_id):
    payload = request.get_json(force=True) or {}
    if not payload.get("diagnosis") and not payload.get("advice") and not payload.get("medicines") and not payload.get("notes"):
        return jsonify({"error": "Consultation requires diagnosis, advice, notes, or medicines"}), 400
    result = save_op_consultation(
        appointment_id,
        {**payload, "doctor_username": g.current_user.get("username")},
        hospital_id=current_hospital_id(),
    )
    if result == "not_found":
        return jsonify({"error": "OP visit not found"}), 404
    if result == "invalid_status":
        return jsonify({"error": "OP visit must be checked in or under consultation"}), 409
    log_audit_event("create", "op_consultation", str(appointment_id), {"diagnosis": payload.get("diagnosis")})
    return jsonify({"status": "ok", "op_status": "completed"})


@op_bp.post("/api/op/visits/<int:appointment_id>/vitals")
@require_permissions("op.schedules.write")
def op_visit_vitals(appointment_id):
    payload = request.get_json(force=True) or {}
    if not any(payload.get(key) for key in ("bp", "blood_pressure", "pulse", "heart_rate", "temperature", "spo2", "respiratory_rate", "weight", "blood_glucose")):
        return jsonify({"error": "At least one vital sign is required"}), 400
    vital_id = add_op_vitals(
        appointment_id,
        payload,
        hospital_id=current_hospital_id(),
        actor=g.current_user.get("username"),
    )
    if vital_id is None:
        return jsonify({"error": "OP visit not found"}), 404
    log_audit_event("create", "op_vitals", str(vital_id), {"appointment_id": appointment_id})
    return jsonify({"vital_id": vital_id}), 201


@op_bp.post("/api/op/visits/<int:appointment_id>/further-action")
@require_permissions("op.schedules.write")
def op_visit_further_action(appointment_id):
    payload = request.get_json(force=True) or {}
    action = payload.get("action") or "none"
    notes = payload.get("notes") or ""
    result = set_op_further_action(
        appointment_id,
        action,
        notes=notes,
        hospital_id=current_hospital_id(),
        actor=g.current_user.get("username"),
    )
    if result == "not_found":
        return jsonify({"error": "OP visit not found"}), 404
    log_audit_event("update", "op_further_action", str(appointment_id), {"action": action, "notes": notes})
    return jsonify({"status": "ok", "further_action": action})


@op_bp.get("/api/op/summary")
@require_permissions("op.read")
def op_summary():
    target_date = request.args.get("date")
    return jsonify(get_op_summary(target_date, hospital_id=current_hospital_id()))


@op_bp.get("/api/op/doctor-schedules")
@require_permissions("op.read")
def op_doctor_schedules_list():
    schedule_date = request.args.get("date")
    doctor_name = request.args.get("doctor_name")
    return jsonify(
        {
            "schedules": rows_to_dicts(
                list_doctor_schedules(
                    schedule_date=schedule_date, doctor_name=doctor_name
                )
            )
        }
    )


@op_bp.post("/api/op/doctor-schedules")
@require_permissions("op.schedules.write")
def op_doctor_schedules_create():
    payload = request.get_json(force=True)
    validation_error = validate_required_fields(
        payload, ["doctor_name", "schedule_date", "start_time", "end_time"]
    )
    if validation_error:
        return validation_error
    schedule_id = create_doctor_schedule(payload)
    log_audit_event(
        "create",
        "doctor_schedules",
        str(schedule_id),
        {"doctor_name": payload.get("doctor_name")},
    )
    return jsonify({"schedule_id": schedule_id})


@op_bp.put("/api/op/doctor-schedules/<int:schedule_id>")
@require_permissions("op.schedules.write")
def op_doctor_schedules_update(schedule_id):
    payload = request.get_json(force=True)
    updated = update_doctor_schedule(schedule_id, payload)
    if not updated:
        return jsonify({"error": "Doctor schedule not found"}), 404
    log_audit_event(
        "update",
        "doctor_schedules",
        str(schedule_id),
        {"schedule_id": schedule_id},
    )
    return jsonify({"status": "ok"})


@op_bp.delete("/api/op/doctor-schedules/<int:schedule_id>")
@require_permissions("op.schedules.write")
def op_doctor_schedules_delete(schedule_id):
    deleted = delete_doctor_schedule(schedule_id, actor=g.current_user.get("username"))
    if not deleted:
        return jsonify({"error": "Doctor schedule not found"}), 404
    log_audit_event(
        "delete",
        "doctor_schedules",
        str(schedule_id),
        {"schedule_id": schedule_id},
    )
    return jsonify({"status": "ok"})


@op_bp.get("/api/op/doctors")
@require_session
def op_doctors_list():
    department = request.args.get("department")
    return jsonify({"doctors": list_doctors(department=department)})


@op_bp.post("/api/op/doctors")
@require_permissions("op.doctors.write")
def op_doctors_create():
    payload = request.get_json(force=True)
    validation_error = validate_required_fields(payload, ["doctor_name", "department"])
    if validation_error:
        return validation_error
    doctor_id = create_doctor(payload)
    log_audit_event(
        "create", "doctors", str(doctor_id), {"doctor_name": payload.get("doctor_name")}
    )
    return jsonify({"doctor_id": doctor_id})


@op_bp.put("/api/op/doctors/<int:doctor_id>")
@require_permissions("op.doctors.write")
def op_doctors_update(doctor_id):
    payload = request.get_json(force=True)
    updated = update_doctor(doctor_id, payload)
    if not updated:
        return jsonify({"error": "Doctor not found"}), 404
    log_audit_event("update", "doctors", str(doctor_id), {"doctor_id": doctor_id})
    return jsonify({"status": "ok"})


@op_bp.delete("/api/op/doctors/<int:doctor_id>")
@require_permissions("op.doctors.write")
def op_doctors_delete(doctor_id):
    deleted = delete_doctor(doctor_id)
    if not deleted:
        return jsonify({"error": "Doctor not found"}), 404
    log_audit_event("delete", "doctors", str(doctor_id), {"doctor_id": doctor_id})
    return jsonify({"status": "ok"})


@op_bp.get("/api/op/doctors/suggest")
@require_session
def op_doctors_suggest():
    department = request.args.get("department")
    region = request.args.get("region")
    doctors = get_suggested_doctors(department=department, region=region, hospital_id=current_hospital_id())
    return jsonify({"doctors": doctors, "suggested_department": department or region})
