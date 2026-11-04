import io

from flask import Blueprint, g, jsonify, request, send_file

from shared.session_auth import require_permissions
from shared.hospital import current_hospital_id
from shared.audit import log_audit_event
from shared.responses import validate_required_fields
from utils.database import (
    create_er_visit,
    list_er_visits,
    get_er_visit,
    register_er_patient,
    generate_er_patient_id,
    merge_er_unknown_patient,
    add_er_complaint,
    set_er_incident,
    add_er_vitals,
    list_er_triage_config,
    create_er_triage_category,
    set_er_triage,
    add_er_treatment,
    assign_er_doctor,
    accept_er_doctor_assignment,
    add_er_clinical_note,
    record_er_disposition,
    close_er_visit,
    compute_er_charges,
    list_er_bed_requests,
    allocate_er_bed_request,
    create_patient_consent,
    list_patient_consents,
    attach_consent_document,
    get_consent_document,
)

# Real-world consent capture is often paper-first: a receptionist may tick
# "signed" in the system before (or after) the physical form is actually
# signed. This lets staff attach a photo/scan of that signed paper as durable
# proof against the consent record already created above -- not a general
# document/EMR library, just proof tied to one consent. Kept small: common
# photo formats + PDF, 8MB cap.
CONSENT_DOCUMENT_ALLOWED_MIME_TYPES = {
    "image/jpeg", "image/png", "image/webp", "image/heic", "image/heif", "application/pdf",
}
CONSENT_DOCUMENT_MAX_BYTES = 8 * 1024 * 1024

er_bp = Blueprint("er", __name__)


def _current_username():
    return (g.current_user or {}).get("username")


@er_bp.get("/api/er/visits")
@require_permissions("er.read")
def er_visits_list():
    hospital_id = current_hospital_id()
    status = request.args.get("status")
    active_only = request.args.get("active_only") == "true"
    visits = list_er_visits(
        hospital_id=hospital_id, status=status, active_only=active_only
    )
    return jsonify({"visits": [dict(v) for v in visits]})


@er_bp.post("/api/er/register-patient")
@require_permissions("er.registration.write")
def er_patient_register():
    """Direct standalone ER patient registration that creates both the
    patient and ER visit atomically without requiring an OP redirect or merge."""
    payload = request.get_json(silent=True) or {}
    hospital_id = current_hospital_id()
    username = _current_username()

    name = (payload.get("name") or (payload.get("patient") or {}).get("name") or "").strip()
    if not name:
        return jsonify({"error": "Patient name is required for ER registration"}), 400

    patient_payload = payload.get("patient") if isinstance(payload.get("patient"), dict) else payload
    visit_payload = payload.get("visit") if isinstance(payload.get("visit"), dict) else payload
    complaints = payload.get("complaints") or payload.get("complaint")
    vitals = payload.get("vitals")

    result = register_er_patient(
        hospital_id=hospital_id,
        patient_data=patient_payload,
        visit_data=visit_payload,
        complaints=complaints,
        vitals=vitals,
        registered_by=username,
    )

    log_audit_event(
        "er_register",
        "patients",
        result["patient_id"],
        {"visit_no": result["visit"]["visit_no"], "visit_id": result["visit"]["id"]},
    )
    return jsonify(result), 201


@er_bp.post("/api/er/visits")
@require_permissions("er.registration.write")
def er_visits_create():
    payload = request.get_json(silent=True) or {}
    if not payload.get("is_unknown_patient") and not payload.get("patient_id"):
        return (
            jsonify(
                {"error": "patient_id is required unless registering an unknown patient"}
            ),
            400,
        )
    if payload.get("is_unknown_patient") and not (payload.get("unknown_patient_label") or "").strip():
        return jsonify({"error": "unknown_patient_label is required for an unknown patient"}), 400

    hospital_id = current_hospital_id()
    payload["registered_by"] = _current_username()
    result = create_er_visit(payload, hospital_id=hospital_id)
    log_audit_event("create", "er_visits", str(result["id"]), {"visit_no": result["visit_no"]})
    return jsonify(result), 201


@er_bp.get("/api/er/visits/<int:visit_id>")
@require_permissions("er.read")
def er_visit_detail(visit_id):
    hospital_id = current_hospital_id()
    visit = get_er_visit(visit_id, hospital_id=hospital_id)
    if not visit:
        return jsonify({"error": "ER visit not found"}), 404
    return jsonify(visit)


@er_bp.post("/api/er/visits/<int:visit_id>/merge-unknown")
@require_permissions("er.registration.write")
def er_visit_merge_unknown(visit_id):
    payload = request.get_json(silent=True) or {}
    error = validate_required_fields(payload, ["patient_id"])
    if error:
        return error
    hospital_id = current_hospital_id()
    try:
        merged = merge_er_unknown_patient(hospital_id, visit_id, payload["patient_id"])
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400
    if not merged:
        return jsonify({"error": "ER visit not found"}), 404
    log_audit_event(
        "merge_unknown", "er_visits", str(visit_id), {"patient_id": payload["patient_id"]}
    )
    return jsonify({"success": True})


@er_bp.post("/api/er/visits/<int:visit_id>/complaints")
@require_permissions("er.registration.write")
def er_visit_add_complaint(visit_id):
    payload = request.get_json(silent=True) or {}
    error = validate_required_fields(payload, ["complaint"])
    if error:
        return error
    hospital_id = current_hospital_id()
    payload.setdefault("reported_by", _current_username())
    complaint_id = add_er_complaint(hospital_id, visit_id, payload)
    log_audit_event("create", "er_complaints", str(complaint_id))
    return jsonify({"id": complaint_id}), 201


@er_bp.post("/api/er/visits/<int:visit_id>/incident")
@require_permissions("er.registration.write")
def er_visit_set_incident(visit_id):
    payload = request.get_json(silent=True) or {}
    hospital_id = current_hospital_id()
    set_er_incident(hospital_id, visit_id, payload)
    log_audit_event("update", "er_incident_history", str(visit_id))
    return jsonify({"success": True})


@er_bp.post("/api/er/visits/<int:visit_id>/vitals")
@require_permissions("er.triage.write")
def er_visit_add_vitals(visit_id):
    payload = request.get_json(silent=True) or {}
    hospital_id = current_hospital_id()
    vitals_id = add_er_vitals(hospital_id, visit_id, payload, recorded_by=_current_username())
    log_audit_event("create", "er_vitals", str(vitals_id))
    return jsonify({"id": vitals_id}), 201


@er_bp.get("/api/er/triage-config")
@require_permissions("er.read")
def er_triage_config_list():
    hospital_id = current_hospital_id()
    active_only = request.args.get("active_only", "true") != "false"
    categories = list_er_triage_config(hospital_id, active_only=active_only)
    return jsonify({"categories": [dict(c) for c in categories]})


@er_bp.post("/api/er/triage-config")
@require_permissions("er.config.write")
def er_triage_config_create():
    payload = request.get_json(silent=True) or {}
    error = validate_required_fields(payload, ["category_code", "category_label"])
    if error:
        return error
    hospital_id = current_hospital_id()
    try:
        category_id = create_er_triage_category(hospital_id, payload)
    except Exception as exc:
        if "unique" in str(exc).lower() or "duplicate" in str(exc).lower():
            return (
                jsonify({"error": f"Triage category '{payload['category_code']}' already exists."}),
                409,
            )
        raise
    log_audit_event("create", "er_triage_config", str(category_id))
    return jsonify({"id": category_id}), 201


@er_bp.post("/api/er/visits/<int:visit_id>/triage")
@require_permissions("er.triage.write")
def er_visit_triage(visit_id):
    payload = request.get_json(silent=True) or {}
    error = validate_required_fields(payload, ["category"])
    if error:
        return error
    hospital_id = current_hospital_id()
    set_er_triage(hospital_id, visit_id, payload, assigned_by=_current_username())
    log_audit_event("triage", "er_visits", str(visit_id), {"category": payload["category"]})
    return jsonify({"success": True})


@er_bp.post("/api/er/visits/<int:visit_id>/treatments")
@require_permissions("er.treatment.write")
def er_visit_add_treatment(visit_id):
    payload = request.get_json(silent=True) or {}
    error = validate_required_fields(payload, ["intervention_type"])
    if error:
        return error
    hospital_id = current_hospital_id()
    payload.setdefault("administered_by", _current_username())
    treatment_id = add_er_treatment(hospital_id, visit_id, payload)
    log_audit_event("create", "er_treatments", str(treatment_id))
    return jsonify({"id": treatment_id}), 201


@er_bp.post("/api/er/visits/<int:visit_id>/assign-doctor")
@require_permissions("er.doctor_assignment.write")
def er_visit_assign_doctor(visit_id):
    payload = request.get_json(silent=True) or {}
    error = validate_required_fields(payload, ["specialty"])
    if error:
        return error
    hospital_id = current_hospital_id()
    result = assign_er_doctor(
        hospital_id, visit_id, payload["specialty"], doctor_name=payload.get("doctor_name")
    )
    log_audit_event(
        "assign_doctor", "er_visits", str(visit_id),
        {"specialty": payload["specialty"], "doctor_name": result["doctor_name"]},
    )
    return jsonify(result)


@er_bp.post("/api/er/visits/<int:visit_id>/accept")
@require_permissions("er.doctor_assignment.write")
def er_visit_accept_doctor(visit_id):
    hospital_id = current_hospital_id()
    accepted = accept_er_doctor_assignment(hospital_id, visit_id)
    if not accepted:
        return jsonify({"error": "No doctor is currently assigned to this visit"}), 400
    log_audit_event("accept", "er_visits", str(visit_id))
    return jsonify({"success": True})


@er_bp.post("/api/er/visits/<int:visit_id>/notes")
@require_permissions("er.doctor_assignment.write")
def er_visit_add_note(visit_id):
    payload = request.get_json(silent=True) or {}
    error = validate_required_fields(payload, ["content"])
    if error:
        return error
    hospital_id = current_hospital_id()
    note_type = payload.get("note_type") or "assessment"
    note_id = add_er_clinical_note(
        hospital_id, visit_id, note_type, payload["content"], author=_current_username()
    )
    log_audit_event("create", "er_clinical_notes", str(note_id))
    return jsonify({"id": note_id}), 201


@er_bp.post("/api/er/visits/<int:visit_id>/disposition")
@require_permissions("er.disposition.write")
def er_visit_disposition(visit_id):
    payload = request.get_json(silent=True) or {}
    error = validate_required_fields(payload, ["outcome", "clinical_reason"])
    if error:
        return error
    hospital_id = current_hospital_id()
    try:
        result = record_er_disposition(
            hospital_id, visit_id, payload, decided_by=_current_username()
        )
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 409
    log_audit_event(
        "disposition", "er_visits", str(visit_id),
        {"outcome": payload["outcome"], "bed_request_id": result["bed_request_id"]},
    )
    return jsonify(result), 201


@er_bp.get("/api/er/visits/<int:visit_id>/charges")
@require_permissions("er.disposition.write")
def er_visit_charges_preview(visit_id):
    """Itemized preview for the closing step -- staff review this before
    confirming /close, same pattern as the bed discharge checklist."""
    hospital_id = current_hospital_id()
    consultation_fee = request.args.get("consultation_fee", 0)
    try:
        consultation_fee = float(consultation_fee)
    except (TypeError, ValueError):
        consultation_fee = 0.0
    charges = compute_er_charges(hospital_id, visit_id, consultation_fee=consultation_fee)
    return jsonify(charges)


@er_bp.post("/api/er/visits/<int:visit_id>/close")
@require_permissions("er.disposition.write")
def er_visit_close(visit_id):
    """Closes a visit whose disposition didn't need a bed (discharge/referral/
    transfer/death/other) and raises its ER invoice -- mirrors the bed
    discharge flow's reviewed-total pattern."""
    payload = request.get_json(silent=True) or {}
    total_amount = payload.get("total_amount")
    try:
        total_amount = float(total_amount) if total_amount not in (None, "") else None
    except (TypeError, ValueError):
        return jsonify({"error": "total_amount must be a number"}), 400
    consultation_fee = payload.get("consultation_fee", 0)
    try:
        consultation_fee = float(consultation_fee or 0)
    except (TypeError, ValueError):
        consultation_fee = 0.0

    hospital_id = current_hospital_id()
    result = close_er_visit(
        hospital_id,
        visit_id,
        total_amount=total_amount,
        consultation_fee=consultation_fee,
        created_by=_current_username(),
    )
    if result is None:
        return jsonify({"error": "ER visit not found"}), 404
    log_audit_event("close", "er_visits", str(visit_id), {"invoice_id": result["invoice_id"]})
    return jsonify(result)


@er_bp.get("/api/er/bed-requests")
@require_permissions("beds.read")
def er_bed_requests_list():
    hospital_id = current_hospital_id()
    status = request.args.get("status", "pending")
    requests_ = list_er_bed_requests(hospital_id, status=status if status else None)
    return jsonify({"bed_requests": [dict(r) for r in requests_]})


@er_bp.post("/api/er/bed-requests/<int:request_id>/allocate")
@require_permissions("beds.write")
def er_bed_request_allocate(request_id):
    payload = request.get_json(silent=True) or {}
    error = validate_required_fields(payload, ["bed_id"])
    if error:
        return error
    try:
        bed_id = int(payload["bed_id"])
    except (TypeError, ValueError):
        return jsonify({"error": "bed_id must be a number"}), 400

    expected_los_days = payload.get("expected_los_days")
    try:
        expected_los_days = int(expected_los_days) if expected_los_days else None
    except (TypeError, ValueError):
        return jsonify({"error": "expected_los_days must be a number"}), 400

    hospital_id = current_hospital_id()
    try:
        result = allocate_er_bed_request(
            hospital_id,
            request_id,
            bed_id,
            (payload.get("notes") or "").strip(),
            allocated_by=_current_username(),
            expected_los_days=expected_los_days,
        )
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 409
    if result is None:
        return jsonify({"error": "Bed request not found, already allocated, or bed unavailable"}), 404

    log_audit_event(
        "allocate", "er_bed_requests", str(request_id),
        {"bed_id": bed_id, "admission_id": result["admission_id"]},
    )
    return jsonify(result), 201


@er_bp.get("/api/er/visits/<int:visit_id>/consents")
@require_permissions("er.read")
def er_visit_consents_list(visit_id):
    hospital_id = current_hospital_id()
    visit = get_er_visit(visit_id, hospital_id=hospital_id)
    if not visit:
        return jsonify({"error": "ER visit not found"}), 404
    consents = list_patient_consents(er_visit_id=visit_id, hospital_id=hospital_id)
    if visit.get("patient_id"):
        pat_consents = list_patient_consents(patient_id=visit["patient_id"], hospital_id=hospital_id)
        seen_ids = {c["id"] for c in consents}
        for pc in pat_consents:
            if pc["id"] not in seen_ids:
                consents.append(pc)
    return jsonify({"consents": [dict(c) for c in consents]})


@er_bp.post("/api/er/visits/<int:visit_id>/consents")
@require_permissions("er.disposition.write")
def er_visit_consent_create(visit_id):
    payload = request.get_json(silent=True) or {}
    error = validate_required_fields(payload, ["signed_by", "consent_type"])
    if error:
        return error

    hospital_id = current_hospital_id()
    visit = get_er_visit(visit_id, hospital_id=hospital_id)
    if not visit:
        return jsonify({"error": "ER visit not found"}), 404

    patient_name = (
        payload.get("patient_name")
        or (visit.get("patient") or {}).get("name")
        or visit.get("unknown_patient_label")
        or "Emergency Patient"
    )
    if (visit.get("patient") or {}).get("last_name"):
        patient_name = f"{patient_name} {visit['patient']['last_name']}".strip()

    consent_data = {
        "patient_id": visit.get("patient_id"),
        "patient_name": patient_name,
        "consent_type": payload.get("consent_type", "general"),
        "signed_by": payload["signed_by"].strip(),
        "relation_to_patient": (payload.get("relation_to_patient") or "").strip() or None,
        "witness_doctor": (payload.get("witness_doctor") or "").strip() or _current_username(),
        "signed_by_phone": (payload.get("signed_by_phone") or "").strip() or None,
        "refusal_reason": (payload.get("refusal_reason") or "").strip() or None,
        "legal_waiver_acknowledged": bool(payload.get("legal_waiver_acknowledged", False)),
        "er_visit_id": visit_id,
        "status": "signed",
        "notes": (payload.get("notes") or "").strip() or None,
    }

    consent_id = create_patient_consent(consent_data, hospital_id=hospital_id)
    log_audit_event("consent_create", "er_visits", str(visit_id), {"consent_id": consent_id, "type": payload.get("consent_type")})
    return jsonify({"consent_id": consent_id, "status": "recorded"}), 201


@er_bp.post("/api/er/visits/<int:visit_id>/lama")
@require_permissions("er.disposition.write")
def er_visit_lama_record(visit_id):
    """Executes a legally binding LAMA (Leave Against Medical Advice) / DAMA disposition:
    1. Records the signed legal waiver and indemnity declaration in patient_consents.
    2. Records the ER disposition as LAMA, automatically cancelling any active bed requests.
    3. Closes the ER visit and logs audit trail."""
    payload = request.get_json(silent=True) or {}
    error = validate_required_fields(payload, ["signed_by", "refusal_reason", "witness_doctor"])
    if error:
        return error

    hospital_id = current_hospital_id()
    visit = get_er_visit(visit_id, hospital_id=hospital_id)
    if not visit:
        return jsonify({"error": "ER visit not found"}), 404

    patient_name = (
        payload.get("patient_name")
        or (visit.get("patient") or {}).get("name")
        or visit.get("unknown_patient_label")
        or "Emergency Patient"
    )
    if (visit.get("patient") or {}).get("last_name"):
        patient_name = f"{patient_name} {visit['patient']['last_name']}".strip()

    witness_doctor = payload["witness_doctor"].strip()
    refusal_reason = payload["refusal_reason"].strip()
    signed_by = payload["signed_by"].strip()
    relation = (payload.get("relation_to_patient") or "Self / Guardian").strip()

    consent_data = {
        "patient_id": visit.get("patient_id"),
        "patient_name": patient_name,
        "consent_type": "lama",
        "signed_by": signed_by,
        "relation_to_patient": relation,
        "witness_doctor": witness_doctor,
        "signed_by_phone": (payload.get("signed_by_phone") or "").strip() or None,
        "refusal_reason": refusal_reason,
        "legal_waiver_acknowledged": True,
        "er_visit_id": visit_id,
        "status": "signed",
        "notes": f"LAMA Legal Indemnity Waiver signed by {signed_by} ({relation}). Attending Doctor: {witness_doctor}. Refusal Reason: {refusal_reason}",
    }
    consent_id = create_patient_consent(consent_data, hospital_id=hospital_id)

    clinical_reason = f"LAMA Refusal: {refusal_reason}. Patient/Guardian refused inpatient admission/care. Legal waiver #{consent_id} executed."
    record_er_disposition(
        hospital_id=hospital_id,
        er_visit_id=visit_id,
        data={
            "outcome": "lama",
            "clinical_reason": clinical_reason,
            "priority": "normal",
        },
        decided_by=witness_doctor,
    )

    close_result = close_er_visit(
        hospital_id=hospital_id,
        er_visit_id=visit_id,
        total_amount=0.0,
        consultation_fee=0.0,
        created_by=_current_username(),
    )

    log_audit_event("lama_discharge", "er_visits", str(visit_id), {
        "consent_id": consent_id,
        "signed_by": signed_by,
        "witness_doctor": witness_doctor,
        "refusal_reason": refusal_reason,
    })

    return jsonify({
        "status": "lama_recorded",
        "consent_id": consent_id,
        "message": "LAMA Declaration recorded. Legal waiver saved and ER visit closed.",
        "invoice_id": (close_result or {}).get("invoice_id"),
    }), 200


@er_bp.post("/api/er/bed-requests/<int:request_id>/lama")
@require_permissions("beds.write")
def er_bed_request_lama_record(request_id):
    """Processes LAMA / Patient Refusal directly from the Bed Management desk before allocation."""
    payload = request.get_json(silent=True) or {}
    error = validate_required_fields(payload, ["signed_by", "refusal_reason", "witness_doctor"])
    if error:
        return error

    hospital_id = current_hospital_id()
    requests_ = list_er_bed_requests(hospital_id, status=None)
    req = next((r for r in requests_ if r["id"] == request_id), None)
    if not req:
        return jsonify({"error": "Bed request not found"}), 404

    visit_id = req["er_visit_id"]
    return er_visit_lama_record(visit_id)


@er_bp.post("/api/er/consents/<int:consent_id>/document")
@require_permissions("er.disposition.write")
def er_consent_document_upload(consent_id):
    """Attaches a photo/scan of the physically-signed paper form to an
    already-created consent record -- durable proof, separate from the
    typed signer/witness/checkbox fields captured at consent creation."""
    uploaded = request.files.get("file")
    if not uploaded or not uploaded.filename:
        return jsonify({"error": "No file uploaded"}), 400

    mime_type = (uploaded.mimetype or "").lower()
    if mime_type not in CONSENT_DOCUMENT_ALLOWED_MIME_TYPES:
        return (
            jsonify({"error": "Unsupported file type. Upload a JPG, PNG, WEBP, HEIC, or PDF."}),
            400,
        )

    data = uploaded.read()
    if len(data) > CONSENT_DOCUMENT_MAX_BYTES:
        return jsonify({"error": "File is too large (8MB limit)."}), 400

    hospital_id = current_hospital_id()
    attached = attach_consent_document(hospital_id, consent_id, uploaded.filename, mime_type, data)
    if not attached:
        return jsonify({"error": "Consent record not found"}), 404

    log_audit_event("attach_document", "patient_consents", str(consent_id), {"filename": uploaded.filename})
    return jsonify({"success": True, "filename": uploaded.filename}), 201


@er_bp.get("/api/er/consents/<int:consent_id>/document")
@require_permissions("er.read")
def er_consent_document_download(consent_id):
    hospital_id = current_hospital_id()
    doc = get_consent_document(hospital_id, consent_id)
    if not doc:
        return jsonify({"error": "No document attached to this consent"}), 404
    return send_file(
        io.BytesIO(doc["data"]),
        mimetype=doc["mime_type"] or "application/octet-stream",
        as_attachment=False,
        download_name=doc["filename"] or f"consent-{consent_id}",
    )
