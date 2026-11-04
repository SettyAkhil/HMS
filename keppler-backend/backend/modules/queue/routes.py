from flask import Blueprint, jsonify, request
from shared.session_auth import require_permissions
from shared.hospital import current_hospital_id
from shared.responses import rows_to_dicts
from utils.database import list_appointments, assign_op_doctor

bp = Blueprint("queue", __name__)


@bp.route("/api/queue", methods=["GET"])
@require_permissions("op.read")
def get_queue():
    appointments = list_appointments(
        appointment_date=request.args.get("date"),
        visit_type="OP",
        doctor_name=request.args.get("doctor_name"),
        hospital_id=current_hospital_id(),
    )
    queue = [item for item in appointments if item.get("status") in ("scheduled", "checked_in", "in_consultation")]
    return jsonify({"queue": rows_to_dicts(queue)})


@bp.post("/api/queue/<int:appointment_id>/assign")
@require_permissions("patients.appointments.write")
def assign_queue_patient(appointment_id):
    doctor_name = (request.get_json(force=True) or {}).get("doctor_name")
    if not doctor_name:
        return jsonify({"error": "doctor_name is required"}), 400
    result = assign_op_doctor(appointment_id, doctor_name, hospital_id=current_hospital_id())
    if result == "not_found":
        return jsonify({"error": "Queue entry not found"}), 404
    if result == "incompatible":
        return jsonify({"error": "Doctor specialty is incompatible with this OP visit"}), 409
    if result == "unavailable":
        return jsonify({"error": "Doctor is unavailable"}), 409
    return jsonify({"status": "ok", "doctor_name": doctor_name})
