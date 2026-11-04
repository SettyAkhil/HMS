import logging
import os

from flask import Blueprint, request, jsonify, g
from werkzeug.exceptions import BadRequest

from shared.session_auth import require_permissions, require_session, resolve_user_permissions
from shared.audit import log_audit_event
from shared.responses import (
    row_to_dict,
    rows_to_dicts,
    validate_required_fields,
)
from shared.uploads import save_uploaded_file
from shared.hospital import (
    current_hospital_id,
    normalize_department_name,
)

from utils.database import (
    search_patients,
    get_all_patients,
    get_patient_stream_counts,
    list_departments,
    create_department,
    list_patient_consents,
    create_patient_consent,
    update_patient_consent,
    list_insurance_verifications,
    create_insurance_verification,
    update_insurance_verification,
    generate_patient_id,
    check_duplicate_patient,
    add_patient,
    add_admission,
    get_patient,
    update_patient,
    delete_patient,
    get_admissions,
    get_readmission_analytics,
    get_documents,
    add_document,
    store_whatsapp_media,
    list_encounters,
    create_encounter,
    list_bed_allocations,
    list_medication_schedules,
    add_medication_schedule,
    current_ist_datetime,
    list_observation_notes,
    add_observation_note,
    add_manual_patient_vital,
    add_manual_diagnosis,
    list_certificates,
    create_certificate,
    list_patient_movements,
    add_patient_movement,
    get_patient_journey,
    get_or_create_card_token,
    ensure_card_patient,
    resolve_card_token,
    get_op_patient_history,
    list_beds,
    list_icu_flowsheets,
    get_connection,
)
from core.export import generate_pdf
from core.limiter import limiter
from core.whatsapp import send_whatsapp_message

patients_bp = Blueprint("patients", __name__)
logger = logging.getLogger(__name__)


def _notify_patient_prescription_ready(patient, ocr_text, doctor_name=None):
    """Best-effort WhatsApp delivery of the digitized prescription as a PDF.
    Never raises - a messaging failure must not affect the document save that
    triggered it. Falls back to a text-only notice if PUBLIC_BASE_URL isn't
    set (a PDF attachment needs a URL Twilio's servers can fetch, which can't
    be localhost)."""
    try:
        phone = patient["phone"] if patient else None
        if not phone:
            return
        patient_name = (
            " ".join(
                part for part in [patient["name"], patient["last_name"]] if part
            ).strip()
            or "Patient"
        )
        doctor_line = f" from Dr. {doctor_name}" if doctor_name else ""
        public_base_url = (os.getenv("PUBLIC_BASE_URL") or "").strip().rstrip("/")

        if not public_base_url:
            send_whatsapp_message(
                phone,
                f"Hi {patient_name}, your prescription{doctor_line} has been recorded. "
                "Please collect a printed copy at the front desk.",
            )
            return

        pdf_bytes = generate_pdf(patient_name, "Prescription", ocr_text)
        token = store_whatsapp_media(pdf_bytes, mime_type="application/pdf")
        media_url = f"{public_base_url}/api/whatsapp/media/{token}"
        send_whatsapp_message(
            phone,
            f"Hi {patient_name}, here is your prescription and visit summary{doctor_line}.",
            media_url=media_url,
        )
    except Exception:
        logger.exception(
            "Failed to send prescription WhatsApp notification for patient %s",
            patient.get("patient_id") if patient else None,
        )


def _patient_input_error(payload, partial=False):
    """Why a patient payload is invalid, or None. `partial` checks only the
    fields present (updates); creation also requires a name."""
    import re as _re
    from datetime import date as _date

    if not isinstance(payload, dict):
        return "Request body must be a JSON object"
    name = payload.get("name")
    if not partial or "name" in payload:
        if not isinstance(name, str) or not name.strip():
            return "name is required"
        if len(name.strip()) > 100:
            return "name must be at most 100 characters"
    last_name = payload.get("last_name")
    if last_name is not None and not isinstance(last_name, str):
        return "last_name must be text"
    phone = payload.get("phone")
    if phone not in (None, ""):
        digits = _re.sub(r"[\s()+-]", "", str(phone))
        if not digits.isdigit() or not 7 <= len(digits) <= 15:
            return "phone must contain 7-15 digits"
    age = payload.get("age")
    if age not in (None, ""):
        try:
            age_value = float(age)
        except (TypeError, ValueError):
            return "age must be a number"
        if not 0 <= age_value <= 130:
            return "age must be between 0 and 130"
    dob = payload.get("dob")
    if dob not in (None, ""):
        try:
            born = _date.fromisoformat(str(dob)[:10])
        except ValueError:
            return "dob must be a date (YYYY-MM-DD)"
        if born > _date.today():
            return "dob cannot be in the future"
    return None


@patients_bp.get("/api/patients")
@require_permissions("patients.read")
def patients_list():
    query = (request.args.get("q") or "").strip()
    care_type = (request.args.get("care_type") or request.args.get("type") or "all").strip()
    hospital_id = current_hospital_id()

    # Enforce isolation for clinicians
    doctor_name = None
    current_user = getattr(g, "current_user", {})
    if (
        current_user.get("access_role") == "clinician"
        or (current_user.get("job_role") or "").strip().lower() == "doctor"
    ):
        doctor_name = current_user.get("full_name") or current_user.get("username")

    counts = get_patient_stream_counts(hospital_id=hospital_id, doctor_name=doctor_name)
    # Optional paging. Without `limit` the full list is returned as before
    # (current screens expect it); with it, callers get one page plus `total`.
    limit = request.args.get("limit", type=int)
    if limit is not None:
        if limit < 1 or limit > 500:
            return jsonify({"error": "limit must be between 1 and 500"}), 400
        page = request.args.get("page", default=1, type=int) or 1
        offset = request.args.get("offset", type=int)
        start = offset if offset is not None else (max(page, 1) - 1) * limit
        if start < 0:
            return jsonify({"error": "offset must not be negative"}), 400
        fetch = search_patients if query else get_all_patients
        args = (query,) if query else ()
        page_rows, total = fetch(*args, hospital_id=hospital_id, doctor_name=doctor_name,
                                 care_type=care_type, limit=limit, offset=start)
        page_rows = rows_to_dicts(page_rows)
        return jsonify({"patients": page_rows, "counts": counts,
                        "total": total, "limit": limit, "offset": start})
    patients = (
        search_patients(query, hospital_id=hospital_id, doctor_name=doctor_name, care_type=care_type)
        if query
        else get_all_patients(hospital_id=hospital_id, doctor_name=doctor_name, care_type=care_type)
    )
    rows = rows_to_dicts(patients)
    return jsonify({"patients": rows, "counts": counts})


@patients_bp.get("/api/patients/readmissions")
@require_permissions("patients.read")
def readmissions_analytics():
    hospital_id = current_hospital_id()
    window_days = request.args.get("window_days", 30)
    try:
        window_days = int(window_days)
    except (TypeError, ValueError):
        window_days = 30
    return jsonify(get_readmission_analytics(hospital_id, window_days=window_days))


@patients_bp.get("/api/registration/departments")
@require_permissions("patients.read")
def registration_departments_list():
    return jsonify(
        {
            "departments": rows_to_dicts(
                list_departments(hospital_id=current_hospital_id())
            )
        }
    )


@patients_bp.post("/api/registration/departments")
@require_permissions("patients.registration.write")
def registration_departments_create():
    payload = request.get_json(force=True)
    try:
        department_name = normalize_department_name(payload.get("department_name"))
    except BadRequest as error:
        return jsonify({"error": str(error)}), 400

    existing = next(
        (
            row
            for row in rows_to_dicts(
                list_departments(hospital_id=current_hospital_id())
            )
            if (row.get("department_name") or "").strip().lower()
            == department_name.lower()
        ),
        None,
    )
    if existing:
        return jsonify(
            {
                "department_id": existing.get("id"),
                "department_name": existing.get("department_name"),
                "already_exists": True,
            }
        )

    department_id = create_department(
        {"department_name": department_name},
        hospital_id=current_hospital_id(),
    )
    log_audit_event(
        "create",
        "departments",
        str(department_id),
        {"department_name": department_name},
    )
    return jsonify({"department_id": department_id})


@patients_bp.get("/api/registration/consents")
@require_permissions("patients.read")
def registration_consents_list():
    patient_id = request.args.get("patient_id")
    return jsonify(
        {"consents": rows_to_dicts(list_patient_consents(patient_id=patient_id))}
    )


@patients_bp.post("/api/registration/consents")
@require_permissions("patients.consent.write")
def registration_consents_create():
    payload = request.get_json(force=True)
    validation_error = validate_required_fields(
        payload, ["patient_name", "consent_type", "signed_by"]
    )
    if validation_error:
        return validation_error
    consent_id = create_patient_consent(payload)
    log_audit_event(
        "create",
        "patient_consents",
        str(consent_id),
        {"patient_name": payload.get("patient_name")},
    )
    return jsonify({"consent_id": consent_id})


@patients_bp.put("/api/registration/consents/<int:consent_id>")
@require_permissions("patients.consent.write")
def registration_consents_update(consent_id):
    payload = request.get_json(force=True)
    updated = update_patient_consent(consent_id, payload)
    if not updated:
        return jsonify({"error": "Consent not found"}), 404
    log_audit_event(
        "update", "patient_consents", str(consent_id), {"consent_id": consent_id}
    )
    return jsonify({"status": "ok"})


@patients_bp.get("/api/registration/insurance")
@require_permissions("patients.read")
def registration_insurance_list():
    patient_id = request.args.get("patient_id")
    return jsonify(
        {
            "verifications": rows_to_dicts(
                list_insurance_verifications(patient_id=patient_id)
            )
        }
    )


@patients_bp.post("/api/registration/insurance")
@require_permissions("patients.insurance.write")
def registration_insurance_create():
    payload = request.get_json(force=True)
    validation_error = validate_required_fields(
        payload, ["patient_name", "insurer_name"]
    )
    if validation_error:
        return validation_error
    verification_id = create_insurance_verification(payload)
    log_audit_event(
        "create",
        "insurance_verifications",
        str(verification_id),
        {"patient_name": payload.get("patient_name")},
    )
    return jsonify({"verification_id": verification_id})


@patients_bp.put("/api/registration/insurance/<int:verification_id>")
@require_permissions("patients.insurance.write")
def registration_insurance_update(verification_id):
    payload = request.get_json(force=True)
    updated = update_insurance_verification(verification_id, payload)
    if not updated:
        return jsonify({"error": "Insurance verification not found"}), 404
    log_audit_event(
        "update",
        "insurance_verifications",
        str(verification_id),
        {"verification_id": verification_id},
    )
    return jsonify({"status": "ok"})


@patients_bp.get("/api/patients/next-id")
@require_permissions("patients.registration.write")
def patients_next_id():
    return jsonify(
        {"patient_id": generate_patient_id(hospital_id=current_hospital_id())}
    )


@patients_bp.post("/api/patients")
@require_permissions("patients.registration.write")
def patients_create():
    payload = request.get_json(force=True)
    error = _patient_input_error(payload)
    if error:
        return jsonify({"error": error}), 400
    # last_name is NOT NULL in the table; ER registrations often have none.
    payload["last_name"] = (payload.get("last_name") or "").strip()
    payload["name"] = payload["name"].strip()
    hospital_id = current_hospital_id()
    patient_id = generate_patient_id(hospital_id=hospital_id)
    if not payload.get("confirm_duplicate"):
        duplicate = check_duplicate_patient(
            payload.get("name"),
            payload.get("last_name"),
            payload.get("dob"),
            payload.get("phone"),
            hospital_id=hospital_id,
        )
        if duplicate:
            return (
                jsonify(
                    {
                        "error": "Possible duplicate",
                        "duplicate": row_to_dict(duplicate),
                    }
                ),
                409,
            )

    data = {
        "patient_id": patient_id,
        "name": payload.get("name"),
        "middle_name": payload.get("middle_name"),
        "last_name": payload.get("last_name"),
        "dob": payload.get("dob"),
        "age": payload.get("age"),
        "weight": payload.get("weight"),
        "height": payload.get("height"),
        "gender": payload.get("gender"),
        "pregnant": 1 if payload.get("pregnant") else 0,
        "allergies": payload.get("allergies"),
        "symptoms": payload.get("symptoms"),
        "phone": payload.get("phone"),
        "address": payload.get("address"),
        "blood_group": payload.get("blood_group"),
        "emergency_contact": payload.get("emergency_contact"),
        "aadhar_number": payload.get("aadhar_number"),
    }
    add_patient(data, hospital_id=hospital_id)
    admission_id = add_admission(patient_id, "Initial registration", hospital_id=hospital_id)
    log_audit_event("create", "patients", patient_id, {"admission_id": admission_id})
    return jsonify({"patient_id": patient_id, "admission_id": admission_id})


@patients_bp.get("/api/patients/<patient_id>")
@require_permissions("patients.read")
def patients_get(patient_id):
    patient = get_patient(patient_id, hospital_id=current_hospital_id())
    if not patient:
        return jsonify({"error": "Patient not found"}), 404
    # Access to a clinical record is itself auditable (who looked, when).
    log_audit_event("read", "patients", patient_id)
    return jsonify({"patient": row_to_dict(patient)})


@patients_bp.put("/api/patients/<patient_id>")
@require_permissions("patients.write")
def patients_update(patient_id):
    hospital_id = current_hospital_id()
    payload = request.get_json(force=True)
    error = _patient_input_error(payload, partial=True)
    if error:
        return jsonify({"error": error}), 400
    patient = get_patient(patient_id, hospital_id=hospital_id)
    if not patient:
        return jsonify({"error": "Patient not found"}), 404
    data = {
        "name": payload.get("name"),
        "middle_name": payload.get("middle_name"),
        "last_name": payload.get("last_name"),
        "dob": payload.get("dob"),
        "age": payload.get("age"),
        "weight": payload.get("weight"),
        "height": payload.get("height"),
        "gender": payload.get("gender"),
        "pregnant": (1 if payload.get("pregnant") else 0) if "pregnant" in payload else None,
        "allergies": payload.get("allergies"),
        "symptoms": payload.get("symptoms"),
        "phone": payload.get("phone"),
        "address": payload.get("address"),
        "blood_group": payload.get("blood_group"),
        "emergency_contact": payload.get("emergency_contact"),
        "aadhar_number": payload.get("aadhar_number"),
    }
    update_patient(patient_id, data)
    log_audit_event("update", "patients", patient_id, {"fields": list(data.keys())})
    return jsonify({"status": "ok"})


@patients_bp.delete("/api/patients/<patient_id>")
@require_permissions("patients.delete")
def patients_delete(patient_id):
    deleted = delete_patient(
        patient_id,
        hospital_id=current_hospital_id(),
        actor=g.current_user.get("username"),
    )
    if not deleted:
        return jsonify({"error": "Patient not found"}), 404
    log_audit_event("delete", "patients", patient_id)
    return jsonify({"status": "ok"})


@patients_bp.get("/api/patients/<patient_id>/admissions")
@require_permissions("patients.read")
def admissions_list(patient_id):
    hospital_id = current_hospital_id()
    patient = get_patient(patient_id, hospital_id=hospital_id)
    if not patient:
        return jsonify({"error": "Patient not found"}), 404
    admissions = get_admissions(patient_id, hospital_id=hospital_id)
    return jsonify({"admissions": rows_to_dicts(admissions)})


@patients_bp.post("/api/patients/<patient_id>/admissions")
@require_permissions("patients.clinical.write")
def admissions_create(patient_id):
    hospital_id = current_hospital_id()
    patient = get_patient(patient_id, hospital_id=hospital_id)
    if not patient:
        return jsonify({"error": "Patient not found"}), 404
    payload = request.get_json(force=True)
    notes = payload.get("notes", "")
    admission_id = add_admission(patient_id, notes, hospital_id=hospital_id)
    log_audit_event(
        "create", "admissions", str(admission_id), {"patient_id": patient_id}
    )
    return jsonify({"admission_id": admission_id})


@patients_bp.get("/api/patients/<patient_id>/documents")
@require_permissions("patients.read")
def documents_list(patient_id):
    hospital_id = current_hospital_id()
    patient = get_patient(patient_id, hospital_id=hospital_id)
    if not patient:
        return jsonify({"error": "Patient not found"}), 404
    documents = get_documents(patient_id, hospital_id=hospital_id)
    return jsonify({"documents": rows_to_dicts(documents)})


@patients_bp.post("/api/patients/<patient_id>/documents")
@require_session
def documents_create(patient_id):
    # A recorded clinical evaluation's audio (doc_type "clinical_audio_note",
    # uploaded from the Clinical page's "Add Evaluation" modal) is logged by
    # whoever has patients.clinical.write -- the same permission note-taking
    # itself needs -- not necessarily the separate Documents & OCR desk
    # permission, which is a different job function (consent forms, scanned
    # prescriptions, etc). Every other doc_type keeps the strict original gate.
    doc_type_for_permission_check = request.form.get("doc_type", "document")
    allowed_permissions = (
        {"patients.documents.write", "patients.clinical.write"}
        if doc_type_for_permission_check == "clinical_audio_note"
        else {"patients.documents.write"}
    )
    if not (resolve_user_permissions(g.current_user) & allowed_permissions):
        return jsonify({"error": "Forbidden", "required_permissions": list(allowed_permissions)}), 403

    hospital_id = current_hospital_id()
    patient = get_patient(patient_id, hospital_id=hospital_id)
    if not patient:
        return jsonify({"error": "Patient not found"}), 404
    if "file" not in request.files:
        return jsonify({"error": "Missing file"}), 400
    uploaded_file = request.files["file"]
    doc_type = request.form.get("doc_type", "document")
    admission_id = request.form.get("admission_id")
    ocr_text = request.form.get("ocr_text", "")
    ocr_language = request.form.get("ocr_language", "en")
    file_bytes = uploaded_file.read()
    uploaded_file.stream.seek(0)

    filepath = save_uploaded_file(uploaded_file, file_bytes, doc_type)
    document_id = add_document(
        patient_id,
        admission_id if admission_id else None,
        doc_type,
        filepath,
        ocr_text,
        ocr_language,
        file_name=uploaded_file.filename,
        mime_type=uploaded_file.mimetype,
        file_data=None,
        hospital_id=hospital_id,
    )

    if doc_type == "prescriptions" and ocr_text.strip():
        doctor_name = (request.form.get("doctor_name") or "").strip() or None
        _notify_patient_prescription_ready(patient, ocr_text, doctor_name)

    return jsonify(
        {"document_id": document_id, "file_path": filepath, "stored_in_db": False}
    )


@patients_bp.get("/api/patients/<patient_id>/encounters")
@require_permissions("patients.read")
def patient_encounters(patient_id):
    return jsonify(
        {
            "encounters": rows_to_dicts(
                list_encounters(
                    patient_id=patient_id, hospital_id=current_hospital_id()
                )
            )
        }
    )


@patients_bp.post("/api/patients/<patient_id>/encounters")
@require_permissions("patients.clinical.write")
def patient_encounter_create(patient_id):
    payload = request.get_json(force=True)
    validation_error = validate_required_fields(payload, ["encounter_type"])
    if validation_error:
        return validation_error
    encounter_id = create_encounter(
        {
            "patient_id": patient_id,
            "encounter_type": payload.get("encounter_type", "OP"),
            "insurance_provider": payload.get("insurance_provider"),
            "insurance_policy_no": payload.get("insurance_policy_no"),
            "is_accident": payload.get("is_accident", False),
            "referral_source": payload.get("referral_source"),
            "referral_name": payload.get("referral_name"),
            "status": payload.get("status", "active"),
            "created_by": g.current_user.get("username"),
        },
        hospital_id=current_hospital_id(),
    )
    log_audit_event(
        "create", "encounters", str(encounter_id), {"patient_id": patient_id}
    )
    return jsonify({"encounter_id": encounter_id})


@patients_bp.get("/api/patients/<patient_id>/beds")
@require_permissions("patients.read")
def patient_beds(patient_id):
    active_only = request.args.get("active_only", "false").lower() == "true"
    return jsonify(
        {
            "beds": rows_to_dicts(
                list_bed_allocations(patient_id=patient_id, active_only=active_only)
            )
        }
    )


@patients_bp.get("/api/patients/<patient_id>/medications")
@require_permissions("patients.read")
def patient_medications(patient_id):
    pending_only = request.args.get("pending_only", "false").lower() == "true"
    return jsonify(
        {
            "medications": rows_to_dicts(
                list_medication_schedules(patient_id, pending_only=pending_only)
            )
        }
    )


@patients_bp.post("/api/patients/<patient_id>/medications")
@require_permissions("patients.clinical.write")
def patient_medications_create(patient_id):
    payload = request.get_json(force=True)
    validation_error = validate_required_fields(payload, ["medicine_name"])
    if validation_error:
        return validation_error
    schedule_id = add_medication_schedule(
        {
            "patient_id": patient_id,
            "medicine_name": payload.get("medicine_name"),
            "dosage": payload.get("dosage"),
            "schedule_time": payload.get("schedule_time")
            or current_ist_datetime().isoformat(timespec="seconds"),
            "administered": payload.get("administered", False),
            "alert_enabled": payload.get("alert_enabled", True),
            "notes": payload.get("notes"),
        }
    )
    log_audit_event(
        "create", "medication_schedules", str(schedule_id), {"patient_id": patient_id}
    )
    return jsonify({"schedule_id": schedule_id})


@patients_bp.get("/api/patients/<patient_id>/notes")
@require_permissions("patients.read")
def patient_notes(patient_id):
    return jsonify({"notes": rows_to_dicts(list_observation_notes(patient_id))})


@patients_bp.post("/api/patients/<patient_id>/notes")
@require_permissions("patients.clinical.write")
def patient_notes_create(patient_id):
    payload = request.get_json(force=True)
    validation_error = validate_required_fields(payload, ["note"])
    if validation_error:
        return validation_error
    note_id = add_observation_note(
        {
            "patient_id": patient_id,
            "admission_id": payload.get("admission_id"),
            "doctor_name": payload.get("doctor_name"),
            "note": payload.get("note"),
            "treatment_plan": payload.get("treatment_plan"),
            "role": payload.get("role"),
        }
    )
    log_audit_event(
        "create", "observation_notes", str(note_id), {"patient_id": patient_id}
    )

    # Optional, in the same submission -- lets one "Add Evaluation" round
    # also log the vitals taken and the diagnosis/impression reached during
    # it, each landing in its own real table (same ones the Vitals/Problems
    # tabs already read from) rather than getting buried inside the note text.
    vitals = payload.get("vitals") or {}
    if any(vitals.get(k) for k in ("bp", "pulse", "temperature", "spo2", "respiratory_rate")):
        vital_id = add_manual_patient_vital(
            {
                "patient_id": patient_id,
                "bp": vitals.get("bp"),
                "pulse": vitals.get("pulse"),
                "temperature": vitals.get("temperature"),
                "spo2": vitals.get("spo2"),
                "respiratory_rate": vitals.get("respiratory_rate"),
                "recorded_by": payload.get("doctor_name"),
            }
        )
        log_audit_event("create", "patient_vitals", str(vital_id), {"patient_id": patient_id})

    diagnosis = (payload.get("diagnosis") or "").strip()
    if diagnosis:
        diagnosis_id = add_manual_diagnosis({"patient_id": patient_id, "diagnosis_name": diagnosis})
        log_audit_event("create", "diagnosis_records", str(diagnosis_id), {"patient_id": patient_id})

    return jsonify({"note_id": note_id})


@patients_bp.post("/api/patients/<patient_id>/vitals")
@require_permissions("patients.clinical.write")
def patient_vitals_create(patient_id):
    """A standalone nurse-recorded vitals entry (e.g. OP triage/Nurse Station),
    not tied to an OP appointment_id or bundled into a clinical note -- see
    add_manual_patient_vital() for why encounter_id is nullable."""
    payload = request.get_json(force=True)
    if not any(
        payload.get(k) for k in ("bp", "pulse", "temperature", "spo2", "respiratory_rate")
    ):
        return jsonify({"error": "At least one vital reading is required"}), 400
    vital_id = add_manual_patient_vital(
        {
            "patient_id": patient_id,
            "bp": payload.get("bp"),
            "pulse": payload.get("pulse"),
            "temperature": payload.get("temperature"),
            "spo2": payload.get("spo2"),
            "respiratory_rate": payload.get("respiratory_rate"),
            "notes": payload.get("notes"),
            "recorded_by": (g.current_user or {}).get("username"),
        }
    )
    log_audit_event("create", "patient_vitals", str(vital_id), {"patient_id": patient_id})
    return jsonify({"vital_id": vital_id})


@patients_bp.get("/api/patients/<patient_id>/certificates")
@require_permissions("patients.read")
def patient_certificates(patient_id):
    return jsonify({"certificates": rows_to_dicts(list_certificates(patient_id))})


@patients_bp.post("/api/patients/<patient_id>/certificates")
@require_permissions("patients.clinical.write")
def patient_certificates_create(patient_id):
    payload = request.get_json(force=True)
    validation_error = validate_required_fields(
        payload, ["certificate_type", "title", "body"]
    )
    if validation_error:
        return validation_error
    certificate_id = create_certificate(
        {
            "patient_id": patient_id,
            "admission_id": payload.get("admission_id"),
            "certificate_type": payload.get("certificate_type"),
            "title": payload.get("title"),
            "body": payload.get("body"),
            "issued_by": g.current_user.get("username"),
        }
    )
    log_audit_event(
        "create",
        "certificates",
        str(certificate_id),
        {"patient_id": patient_id, "certificate_type": payload.get("certificate_type")},
    )
    return jsonify({"certificate_id": certificate_id})


@patients_bp.get("/api/patients/<patient_id>/movements")
@require_permissions("patients.read")
def patient_movements(patient_id):
    return jsonify({"movements": rows_to_dicts(list_patient_movements(patient_id))})


@patients_bp.get("/api/patients/<patient_id>/journey")
@require_permissions("patients.read")
def patient_journey(patient_id):
    journey = get_patient_journey(patient_id, hospital_id=current_hospital_id())
    if journey is None:
        return jsonify({"error": "Patient not found"}), 404
    return jsonify(journey)


@patients_bp.post("/api/patients/<patient_id>/card-token")
@require_permissions("patients.read")
def patient_card_token(patient_id):
    """The patient's card link token (issued on first print). `rotate: true`
    cancels the old card's link -- for a lost or replaced card."""
    hospital_id = current_hospital_id()
    payload = request.get_json(silent=True) or {}
    rotate = bool(payload.get("rotate"))
    registered = None
    details = payload.get("patient")
    # With the card's details, always check them: the front desk's per-browser
    # UMR counter can give two people the same UMR, and a card must never carry
    # a link to someone else's record. Without details (staff on the record
    # page), the id alone is trusted, as for every other staff route.
    if details or not get_patient(patient_id, hospital_id=hospital_id):
        # Known only at the front desk (registered offline, or seeded in the
        # browser): register them from the card's details, under the same UMR.
        resolved_id, status = ensure_card_patient(patient_id, details, hospital_id)
        if not resolved_id:
            message, code = {
                "conflict": ("That UMR belongs to a different patient on the server", 409),
                "deleted": ("This patient was removed from the hospital records", 410),
            }.get(status, ("Patient not found", 404))
            return jsonify({"error": message, "status": status}), code
        if status == "created":
            log_audit_event("create", "patients", resolved_id, {"source": "op_card"})
        registered = status
        patient_id = resolved_id
    result = get_or_create_card_token(
        patient_id,
        hospital_id,
        created_by=(g.current_user or {}).get("username"),
        rotate=rotate,
    )
    if result["issued"]:
        log_audit_event(
            "rotate" if rotate else "create",
            "patient_card_tokens",
            patient_id,
            {"rotated": rotate},
        )
    # The server's own details, so a printed card never carries a stale or
    # placeholder copy held at the desk.
    stored = get_patient(patient_id, hospital_id=hospital_id)
    stored = dict(stored) if stored else {}
    return jsonify(
        {
            "token": result["token"],
            "issued": result["issued"],
            "patient_id": patient_id,
            "registered": registered,
            "patient": {k: stored.get(k) for k in _PUBLIC_PATIENT_FIELDS} if stored else None,
        }
    )


# Fields of the patient master shown on the public card page. Identity
# documents (Aadhaar etc.), audit columns and internal ids are left out.
_PUBLIC_PATIENT_FIELDS = (
    "patient_id", "name", "middle_name", "last_name", "age", "dob", "gender",
    "blood_group", "phone", "address", "area", "allergies", "created_at",
)


@patients_bp.get("/api/public/patient-card/<token>")
@limiter.limit("30 per minute")
def public_patient_card(token):
    """No login: the record a patient's card QR opens, found by the card's
    unguessable token (never by UMR). Read-only; 404 for any unknown or
    cancelled token, so a guess learns nothing."""
    resolved = resolve_card_token(token)
    if not resolved:
        return jsonify({"error": "Card not recognised"}), 404
    hospital_id, patient_id = resolved
    journey = get_patient_journey(patient_id, hospital_id=hospital_id)
    if journey is None:
        return jsonify({"error": "Card not recognised"}), 404
    patient = {k: journey["patient"].get(k) for k in _PUBLIC_PATIENT_FIELDS}
    try:
        visits = get_op_patient_history(patient_id, hospital_id=hospital_id) or []
    except Exception:
        visits = []
    bed = None
    try:
        for row in list_beds(hospital_id):
            r = dict(row)
            if r.get("status") == "Occupied" and r.get("patient_id") == patient_id:
                bed = {k: r.get(k) for k in ("ward", "room_no", "bed_no", "bed_type", "allocated_at", "admission_date", "admission_notes")}
                break
    except Exception:
        bed = None
    try:
        icu_days = rows_to_dicts(list_icu_flowsheets(patient_id))
    except Exception:
        icu_days = []
    hospital_name = None
    try:
        with get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT name FROM hospitals WHERE id = ?", (hospital_id,))
            row = cursor.fetchone()
            hospital_name = row["name"] if row else None
    except Exception:
        hospital_name = None
    response = jsonify(
        {
            "patient": patient,
            "hospital": {"name": hospital_name},
            "events": journey["events"],
            "summary": journey["summary"],
            "visits": visits if isinstance(visits, list) else visits.get("visits", []),
            "bed": bed,
            "icu_days": icu_days,
        }
    )
    response.headers["Cache-Control"] = "no-store"
    response.headers["Referrer-Policy"] = "no-referrer"
    return response


@patients_bp.post("/api/patients/<patient_id>/movements")
@require_permissions("patients.clinical.write")
def patient_movements_create(patient_id):
    payload = request.get_json(force=True)
    validation_error = validate_required_fields(payload, ["to_department"])
    if validation_error:
        return validation_error
    movement_id = add_patient_movement(
        {
            "patient_id": patient_id,
            "admission_id": payload.get("admission_id"),
            "from_department": payload.get("from_department"),
            "to_department": payload.get("to_department"),
            "moved_by": g.current_user.get("username"),
        }
    )
    log_audit_event(
        "create", "patient_movements", str(movement_id), {"patient_id": patient_id}
    )
    return jsonify({"movement_id": movement_id})
