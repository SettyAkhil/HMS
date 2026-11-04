"""ICU flowsheet: ventilator settings, infusions, intake/output, RASS sedation
score, critical labs, and consults for a patient currently in an ICU bed.

Real, nurse/doctor-entered counterpart to what the old ICU page used to show
as hardcoded numbers -- every field here is backed by its own table and only
ever reflects what staff actually recorded (see ensure_icu_tables() in
utils/database.py)."""
from flask import Blueprint, request, jsonify

from shared.hospital import current_hospital_id
from shared.session_auth import require_permissions
from shared.audit import log_audit_event
from shared.responses import rows_to_dicts, validate_required_fields

from utils.database import (
    add_ventilator_setting,
    get_ventilator_settings,
    add_infusion,
    stop_infusion,
    get_infusions,
    add_io_record,
    get_io_records,
    add_rass_score,
    get_rass_scores,
    add_icu_lab_result,
    get_icu_lab_results,
    add_icu_consult,
    update_icu_consult_status,
    get_icu_consults,
    upsert_icu_flowsheet,
    get_icu_flowsheet,
    list_icu_flowsheets,
)
import json
from datetime import date as _date

from flask import g

icu_bp = Blueprint("icu", __name__)


def patient_in_hospital(view):
    """404 unless the patient exists in the caller's hospital.

    Innermost decorator, so it runs after the auth/permission checks (callers
    without access still get 401/403, never a hint about which ids exist).
    ICU tables reference patients by id only -- icu_flowsheets has no
    hospital_id at all -- so this is what keeps one hospital from reading or
    writing another's ICU charts, and turns a write for an unknown patient
    into a 404 instead of a foreign-key 500.
    """
    from functools import wraps

    from utils.database import get_patient

    @wraps(view)
    def wrapper(*args, **kwargs):
        if not get_patient(kwargs.get("patient_id"), hospital_id=current_hospital_id()):
            return jsonify({"error": "Patient not found"}), 404
        return view(*args, **kwargs)

    return wrapper


@icu_bp.get("/api/icu/<patient_id>")
@require_permissions("patients.read")
@patient_in_hospital
def icu_snapshot(patient_id):
    return jsonify({
        "ventilator_settings": rows_to_dicts(get_ventilator_settings(patient_id)),
        "infusions": rows_to_dicts(get_infusions(patient_id)),
        "io_records": rows_to_dicts(get_io_records(patient_id)),
        "rass_scores": rows_to_dicts(get_rass_scores(patient_id)),
        "lab_results": rows_to_dicts(get_icu_lab_results(patient_id)),
        "consults": rows_to_dicts(get_icu_consults(patient_id)),
    })


@icu_bp.post("/api/icu/<patient_id>/ventilator")
@require_permissions("patients.clinical.write")
@patient_in_hospital
def icu_add_ventilator(patient_id):
    payload = request.get_json(force=True)
    row_id = add_ventilator_setting({
        "patient_id": patient_id,
        "admission_id": payload.get("admission_id"),
        "mode": payload.get("mode"),
        "fio2": payload.get("fio2"),
        "peep": payload.get("peep"),
        "tidal_volume": payload.get("tidal_volume"),
        "resp_rate": payload.get("resp_rate"),
        "pip": payload.get("pip"),
        "recorded_by": payload.get("recorded_by"),
    })
    log_audit_event("create", "icu_ventilator_settings", str(row_id), {"patient_id": patient_id})
    return jsonify({"id": row_id})


@icu_bp.post("/api/icu/<patient_id>/infusions")
@require_permissions("patients.clinical.write")
@patient_in_hospital
def icu_add_infusion(patient_id):
    payload = request.get_json(force=True)
    validation_error = validate_required_fields(payload, ["medication_name"])
    if validation_error:
        return validation_error
    row_id = add_infusion({
        "patient_id": patient_id,
        "admission_id": payload.get("admission_id"),
        "medication_name": payload.get("medication_name"),
        "rate": payload.get("rate"),
        "unit": payload.get("unit"),
        "recorded_by": payload.get("recorded_by"),
    })
    log_audit_event("create", "icu_infusions", str(row_id), {"patient_id": patient_id})
    return jsonify({"id": row_id})


@icu_bp.post("/api/icu/<patient_id>/infusions/<int:infusion_id>/stop")
@require_permissions("patients.clinical.write")
@patient_in_hospital
def icu_stop_infusion(patient_id, infusion_id):
    ok = stop_infusion(infusion_id, patient_id)
    if not ok:
        return jsonify({"error": "Infusion not found"}), 404
    log_audit_event("update", "icu_infusions", str(infusion_id), {"patient_id": patient_id, "status": "stopped"})
    return jsonify({"ok": True})


@icu_bp.post("/api/icu/<patient_id>/io")
@require_permissions("patients.clinical.write")
@patient_in_hospital
def icu_add_io(patient_id):
    payload = request.get_json(force=True)
    row_id = add_io_record({
        "patient_id": patient_id,
        "admission_id": payload.get("admission_id"),
        "intake_ml": payload.get("intake_ml"),
        "output_ml": payload.get("output_ml"),
        "notes": payload.get("notes"),
        "recorded_by": payload.get("recorded_by"),
    })
    log_audit_event("create", "icu_io_records", str(row_id), {"patient_id": patient_id})
    return jsonify({"id": row_id})


@icu_bp.post("/api/icu/<patient_id>/rass")
@require_permissions("patients.clinical.write")
@patient_in_hospital
def icu_add_rass(patient_id):
    payload = request.get_json(force=True)
    validation_error = validate_required_fields(payload, ["score"])
    if validation_error:
        return validation_error
    row_id = add_rass_score({
        "patient_id": patient_id,
        "admission_id": payload.get("admission_id"),
        "score": payload.get("score"),
        "recorded_by": payload.get("recorded_by"),
    })
    log_audit_event("create", "icu_rass_scores", str(row_id), {"patient_id": patient_id})
    return jsonify({"id": row_id})


@icu_bp.post("/api/icu/<patient_id>/labs")
@require_permissions("patients.clinical.write")
@patient_in_hospital
def icu_add_lab(patient_id):
    payload = request.get_json(force=True)
    validation_error = validate_required_fields(payload, ["test_name"])
    if validation_error:
        return validation_error
    row_id = add_icu_lab_result({
        "patient_id": patient_id,
        "admission_id": payload.get("admission_id"),
        "test_name": payload.get("test_name"),
        "value": payload.get("value"),
        "unit": payload.get("unit"),
        "flag": payload.get("flag"),
        "recorded_by": payload.get("recorded_by"),
    })
    log_audit_event("create", "icu_lab_results", str(row_id), {"patient_id": patient_id})
    return jsonify({"id": row_id})


@icu_bp.post("/api/icu/<patient_id>/consults")
@require_permissions("patients.clinical.write")
@patient_in_hospital
def icu_add_consult(patient_id):
    payload = request.get_json(force=True)
    validation_error = validate_required_fields(payload, ["specialty"])
    if validation_error:
        return validation_error
    row_id = add_icu_consult({
        "patient_id": patient_id,
        "admission_id": payload.get("admission_id"),
        "specialty": payload.get("specialty"),
        "consultant_name": payload.get("consultant_name"),
        "notes": payload.get("notes"),
        "requested_by": payload.get("requested_by"),
    })
    log_audit_event("create", "icu_consults", str(row_id), {"patient_id": patient_id})
    return jsonify({"id": row_id})


@icu_bp.patch("/api/icu/<patient_id>/consults/<int:consult_id>")
@require_permissions("patients.clinical.write")
@patient_in_hospital
def icu_update_consult(patient_id, consult_id):
    payload = request.get_json(force=True)
    status = payload.get("status")
    if status not in ("requested", "completed", "cancelled"):
        return jsonify({"error": "Invalid status"}), 400
    ok = update_icu_consult_status(consult_id, patient_id, status)
    if not ok:
        return jsonify({"error": "Consult not found"}), 404
    log_audit_event("update", "icu_consults", str(consult_id), {"patient_id": patient_id, "status": status})
    return jsonify({"ok": True})


# --- Daily flowsheet -------------------------------------------------------
# The nurse's paper ICU chart, one document per patient per day. Stored whole
# (JSON) because its shape is owned by the frontend schema, not the database.

def _valid_date(value):
    try:
        return _date.fromisoformat(value).isoformat()
    except (TypeError, ValueError):
        return None


@icu_bp.get("/api/icu/<patient_id>/flowsheets")
@require_permissions("patients.read")
@patient_in_hospital
def icu_list_flowsheets(patient_id):
    """Day-wise index of every chart recorded for this patient."""
    rows = rows_to_dicts(list_icu_flowsheets(patient_id))
    for row in rows:
        if row.get("chart_date") is not None:
            row["chart_date"] = str(row["chart_date"])
    return jsonify({"days": rows})


@icu_bp.get("/api/icu/<patient_id>/flowsheet/<chart_date>")
@require_permissions("patients.read")
@patient_in_hospital
def icu_get_flowsheet(patient_id, chart_date):
    day = _valid_date(chart_date)
    if not day:
        return jsonify({"error": "chart_date must be YYYY-MM-DD"}), 400
    row = get_icu_flowsheet(patient_id, day)
    if not row:
        return jsonify({"chart_date": day, "data": None, "entry_count": 0})
    record = dict(row)
    try:
        record["data"] = json.loads(record["data"])
    except (TypeError, ValueError):
        record["data"] = None
    record["chart_date"] = str(record["chart_date"])
    return jsonify(record)


@icu_bp.put("/api/icu/<patient_id>/flowsheet/<chart_date>")
@require_permissions("patients.clinical.write")
@patient_in_hospital
def icu_save_flowsheet(patient_id, chart_date):
    day = _valid_date(chart_date)
    if not day:
        return jsonify({"error": "chart_date must be YYYY-MM-DD"}), 400
    payload = request.get_json(force=True) or {}
    data = payload.get("data")
    if not isinstance(data, dict):
        return jsonify({"error": "data must be an object"}), 400
    entry_count = payload.get("entry_count") or 0
    row = upsert_icu_flowsheet(
        patient_id,
        day,
        data,
        entry_count=int(entry_count),
        updated_by=(g.current_user or {}).get("username"),
    )
    log_audit_event(
        "update", "icu_flowsheets", f"{patient_id}:{day}", {"entry_count": entry_count}
    )
    record = dict(row) if row else {}
    record.pop("data", None)
    if record.get("chart_date") is not None:
        record["chart_date"] = str(record["chart_date"])
    return jsonify({"saved": True, **record})
