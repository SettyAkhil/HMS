import io
import json
import logging
import os

from flask import Blueprint, jsonify, request, g, send_file

from shared.session_auth import require_permissions
from shared.hospital import current_hospital_id
from utils.database import (
    get_connection,
    create_certificate,
    store_whatsapp_media,
    get_patient_journey,
    parse_pharmacy_prescriptions,
)
from core.export import generate_pdf
from core.whatsapp import send_whatsapp_message, is_configured as whatsapp_is_configured
from ai.service import generate_patient_summary

emr_bp = Blueprint("emr", __name__)
logger = logging.getLogger(__name__)


@emr_bp.route("/api/emr/search", methods=["GET"])
@require_permissions("patients.read")
def search_emr():
    query = request.args.get("q", "").strip()
    hospital_id = current_hospital_id()
    if not query:
        return jsonify([])

    with get_connection() as conn:
        cursor = conn.cursor()
        sql = """
            SELECT id, patient_id, name, last_name, phone, dob, gender, age
            FROM patients
            WHERE hospital_id = %s AND (
                patient_id LIKE %s OR
                name LIKE %s OR
                last_name LIKE %s OR
                phone LIKE %s
            )
            LIMIT 20
        """
        wildcard = f"%{query}%"
        cursor.execute(sql, (hospital_id, wildcard, wildcard, wildcard, wildcard))
        rows = cursor.fetchall()
        return jsonify([dict(r) for r in rows])


@emr_bp.route("/api/emr/<patient_id>", methods=["GET"])
@require_permissions("patients.read")
def get_emr(patient_id):
    hospital_id = current_hospital_id()
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute(
            "SELECT * FROM patients WHERE patient_id = %s AND hospital_id = %s",
            (patient_id, hospital_id),
        )
        patient = cursor.fetchone()
        if not patient:
            return jsonify({"error": "Patient not found"}), 404

        # Everything below is scoped by this exact patient_id, which was just
        # confirmed to belong to this hospital above -- that's what keeps the
        # several child tables that don't carry their own hospital_id column
        # (clinical_notes, patient_vitals, diagnosis_records, documents,
        # admissions, bed_allocations pre-retrofit rows, medication_schedules,
        # observation_notes, certificates) safe to read by patient_id alone.

        cursor.execute(
            "SELECT * FROM encounters WHERE patient_id = %s AND hospital_id = %s ORDER BY id DESC",
            (patient_id, hospital_id),
        )
        encounters = [dict(r) for r in cursor.fetchall()]

        cursor.execute(
            "SELECT * FROM clinical_notes WHERE patient_id = %s ORDER BY created_at DESC",
            (patient_id,),
        )
        notes = [dict(r) for r in cursor.fetchall()]

        cursor.execute(
            "SELECT * FROM patient_vitals WHERE patient_id = %s ORDER BY created_at DESC",
            (patient_id,),
        )
        vitals = [dict(r) for r in cursor.fetchall()]

        cursor.execute(
            "SELECT * FROM diagnosis_records WHERE patient_id = %s ORDER BY id DESC",
            (patient_id,),
        )
        diagnoses = [dict(r) for r in cursor.fetchall()]

        cursor.execute(
            "SELECT * FROM pharmacy_prescriptions WHERE patient_id = %s AND hospital_id = %s ORDER BY created_at DESC",
            (patient_id, hospital_id),
        )
        prescriptions = parse_pharmacy_prescriptions([dict(r) for r in cursor.fetchall()])

        # Lab/diagnostic charges -- this table tracks what was billed for a
        # test, not the clinical result value, so it's presented as such
        # rather than pretending it has a "result"/"normal_range" the schema
        # doesn't actually store.
        cursor.execute(
            "SELECT * FROM diagnostics WHERE patient_id = %s AND hospital_id = %s AND deleted_at IS NULL ORDER BY created_at DESC",
            (patient_id, hospital_id),
        )
        labs = [dict(r) for r in cursor.fetchall()]

        cursor.execute(
            "SELECT * FROM medical_history WHERE patient_id = %s", (patient_id,)
        )
        medical_history = cursor.fetchone()

        cursor.execute(
            """
            SELECT id, patient_id, admission_id, doc_type, file_name, mime_type,
                   created_at, ocr_text, (ocr_text IS NOT NULL AND ocr_text != '') AS has_ocr_text
            FROM documents WHERE patient_id = %s AND deleted_at IS NULL ORDER BY created_at DESC
            """,
            (patient_id,),
        )
        documents = [dict(r) for r in cursor.fetchall()]

        cursor.execute(
            "SELECT * FROM pharmacy_sales WHERE patient_id = %s AND hospital_id = %s AND deleted_at IS NULL ORDER BY sold_at DESC",
            (patient_id, hospital_id),
        )
        pharmacy_sales = [dict(r) for r in cursor.fetchall()]

        # Admissions -- newest first, so admissions[0] is "the current/most
        # recent stay" for the frontend and the AI summary generator alike.
        cursor.execute(
            "SELECT * FROM admissions WHERE patient_id = %s AND deleted_at IS NULL ORDER BY admission_date DESC",
            (patient_id,),
        )
        admissions = [dict(r) for r in cursor.fetchall()]

        cursor.execute(
            "SELECT * FROM bed_allocations WHERE patient_id = %s AND deleted_at IS NULL ORDER BY allocated_at DESC",
            (patient_id,),
        )
        bed_history = [dict(r) for r in cursor.fetchall()]

        cursor.execute(
            "SELECT * FROM medication_schedules WHERE patient_id = %s AND deleted_at IS NULL ORDER BY schedule_time DESC",
            (patient_id,),
        )
        medication_schedules = [dict(r) for r in cursor.fetchall()]

        cursor.execute(
            "SELECT * FROM observation_notes WHERE patient_id = %s AND deleted_at IS NULL ORDER BY created_at DESC",
            (patient_id,),
        )
        observation_notes = [dict(r) for r in cursor.fetchall()]

        cursor.execute(
            "SELECT * FROM certificates WHERE patient_id = %s AND deleted_at IS NULL ORDER BY created_at DESC",
            (patient_id,),
        )
        certificates = [dict(r) for r in cursor.fetchall()]

        cursor.execute(
            "SELECT * FROM insurance_claims WHERE patient_id = %s AND deleted_at IS NULL ORDER BY submitted_at DESC",
            (patient_id,),
        )
        insurance_claims = [dict(r) for r in cursor.fetchall()]

        # Appointments — pull consultation_fee from doctors by name match first,
        # then by department match, then from invoices as fallback
        cursor.execute(
            """
            SELECT
                a.*,
                COALESCE(
                    d_name.consultation_fee,
                    d_dept.consultation_fee
                ) AS consultation_fee,
                COALESCE(d_name.doctor_name, d_dept.doctor_name) AS matched_doctor_name
            FROM appointments a
            LEFT JOIN doctors d_name
                ON LOWER(TRIM(d_name.doctor_name)) = LOWER(TRIM(a.doctor_name))
                OR LOWER(TRIM(d_name.doctor_name)) = LOWER(TRIM('Dr. ' || a.doctor_name))
                OR LOWER(TRIM(d_name.doctor_name)) LIKE LOWER(TRIM('%%' || a.doctor_name || '%%'))
            LEFT JOIN doctors d_dept
                ON d_name.id IS NULL
                AND LOWER(TRIM(d_dept.department)) = LOWER(TRIM(a.department))
            WHERE a.patient_id = %s AND a.hospital_id = %s AND a.deleted_at IS NULL
            ORDER BY a.appointment_date DESC
        """,
            (patient_id, hospital_id),
        )
        raw_appointments = [dict(r) for r in cursor.fetchall()]

        # For any appointment still missing consultation_fee, look up the invoice total
        cursor.execute(
            """
            SELECT i.*
            FROM invoices i
            WHERE i.patient_id = %s AND i.hospital_id = %s AND i.deleted_at IS NULL
            ORDER BY i.created_at DESC
        """,
            (patient_id, hospital_id),
        )
        invoices = [dict(r) for r in cursor.fetchall()]

        invoice_ids = [inv["id"] for inv in invoices]
        invoice_payments = []
        if invoice_ids:
            placeholders = ", ".join(["%s"] * len(invoice_ids))
            cursor.execute(
                f"""
                SELECT ip.* FROM invoice_payments ip
                WHERE ip.invoice_id IN ({placeholders})
                ORDER BY ip.created_at DESC
                """,
                tuple(invoice_ids),
            )
            invoice_payments = [dict(r) for r in cursor.fetchall()]

        # Build appointment fee: match invoice by doctor_name if still missing
        appointments = []
        for apt in raw_appointments:
            if (
                apt.get("consultation_fee") is None
                or float(apt.get("consultation_fee") or 0) == 0
            ):
                for inv in invoices:
                    inv_doc = (inv.get("doctor_name") or "").lower().strip()
                    apt_doc = (apt.get("doctor_name") or "").lower().strip()
                    if (
                        inv_doc
                        and apt_doc
                        and (
                            inv_doc in apt_doc
                            or apt_doc in inv_doc
                            or apt_doc == inv_doc
                        )
                    ):
                        apt["consultation_fee"] = float(inv["total_amount"] or 0)
                        apt["invoice_payment_status"] = inv["payment_status"]
                        break
                if (
                    apt.get("consultation_fee") is None
                    or float(apt.get("consultation_fee") or 0) == 0
                ) and len(invoices) == 1:
                    apt["consultation_fee"] = float(invoices[0]["total_amount"] or 0)
                    apt["invoice_payment_status"] = invoices[0]["payment_status"]
            appointments.append(apt)

        # ICU flowsheet -- included here (not just on the dedicated ICU page)
        # so a patient's ventilator/infusion/I&O/RASS/lab/consult history from
        # any ICU stay shows up as a permanent, dated part of their EMR, the
        # same as every other clinical table above.
        cursor.execute(
            "SELECT * FROM icu_ventilator_settings WHERE patient_id = %s ORDER BY created_at DESC",
            (patient_id,),
        )
        icu_ventilator_settings = [dict(r) for r in cursor.fetchall()]

        cursor.execute(
            "SELECT * FROM icu_infusions WHERE patient_id = %s ORDER BY started_at DESC",
            (patient_id,),
        )
        icu_infusions = [dict(r) for r in cursor.fetchall()]

        cursor.execute(
            "SELECT * FROM icu_io_records WHERE patient_id = %s ORDER BY recorded_at DESC",
            (patient_id,),
        )
        icu_io_records = [dict(r) for r in cursor.fetchall()]

        cursor.execute(
            "SELECT * FROM icu_rass_scores WHERE patient_id = %s ORDER BY created_at DESC",
            (patient_id,),
        )
        icu_rass_scores = [dict(r) for r in cursor.fetchall()]

        cursor.execute(
            "SELECT * FROM icu_lab_results WHERE patient_id = %s ORDER BY created_at DESC",
            (patient_id,),
        )
        icu_lab_results = [dict(r) for r in cursor.fetchall()]

        cursor.execute(
            "SELECT * FROM icu_consults WHERE patient_id = %s ORDER BY created_at DESC",
            (patient_id,),
        )
        icu_consults = [dict(r) for r in cursor.fetchall()]

        # Clinical orders (radiology/nursing/dietary/referral) and the
        # patient's current care plan -- see modules/clinical/routes.py.
        cursor.execute(
            "SELECT * FROM clinical_orders WHERE patient_id = %s ORDER BY ordered_at DESC",
            (patient_id,),
        )
        clinical_orders = [dict(r) for r in cursor.fetchall()]

        cursor.execute(
            "SELECT * FROM care_plans WHERE patient_id = %s",
            (patient_id,),
        )
        care_plan_row = cursor.fetchone()
        if care_plan_row:
            care_plan_row = dict(care_plan_row)
            try:
                care_plan_row["problems"] = json.loads(care_plan_row["problems"] or "[]")
            except (TypeError, ValueError):
                care_plan_row["problems"] = []

        emr_response = {
            "patient": dict(patient),
            "medical_history": dict(medical_history) if medical_history else None,
            "admissions": admissions,
            "bed_history": bed_history,
            "encounters": encounters,
            "notes": notes,
            "vitals": vitals,
            "diagnoses": diagnoses,
            "prescriptions": prescriptions,
            "medication_schedules": medication_schedules,
            "observation_notes": observation_notes,
            "labs": labs,
            "documents": documents,
            "pharmacy_sales": pharmacy_sales,
            "appointments": appointments,
            "invoices": invoices,
            "invoice_payments": invoice_payments,
            "insurance_claims": insurance_claims,
            "certificates": certificates,
            "icu_ventilator_settings": icu_ventilator_settings,
            "icu_infusions": icu_infusions,
            "icu_io_records": icu_io_records,
            "icu_rass_scores": icu_rass_scores,
            "icu_lab_results": icu_lab_results,
            "icu_consults": icu_consults,
            "clinical_orders": clinical_orders,
            "care_plan": care_plan_row,
        }

    # A single consolidated, chronologically-sorted view of the whole patient
    # journey (registration -> appointment -> consultation -> bed events ->
    # prescriptions -> treatment plan -> billing -> discharge), additive to
    # the per-category arrays above so the other tabs don't need to change.
    journey = get_patient_journey(patient_id, hospital_id=hospital_id)
    emr_response["timeline"] = journey["events"] if journey else []
    emr_response["financial_summary"] = journey["summary"] if journey else None

    return jsonify(emr_response)


@emr_bp.route("/api/emr/<patient_id>/ai-summary", methods=["POST"])
@require_permissions("patients.clinical.write")
def get_ai_summary(patient_id):
    hospital_id = current_hospital_id()
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute(
            "SELECT * FROM patients WHERE patient_id = %s AND hospital_id = %s",
            (patient_id, hospital_id),
        )
        patient = cursor.fetchone()
        if not patient:
            return jsonify({"error": "Patient not found"}), 404
        patient = dict(patient)

        cursor.execute(
            "SELECT * FROM admissions WHERE patient_id = %s AND deleted_at IS NULL ORDER BY admission_date DESC",
            (patient_id,),
        )
        admissions = [dict(r) for r in cursor.fetchall()]

        cursor.execute(
            "SELECT * FROM encounters WHERE patient_id = %s AND hospital_id = %s ORDER BY id DESC",
            (patient_id, hospital_id),
        )
        encounters = [dict(r) for r in cursor.fetchall()]

        cursor.execute(
            "SELECT * FROM diagnosis_records WHERE patient_id = %s ORDER BY id DESC",
            (patient_id,),
        )
        diagnoses = [dict(r) for r in cursor.fetchall()]

        cursor.execute(
            "SELECT * FROM pharmacy_prescriptions WHERE patient_id = %s AND hospital_id = %s ORDER BY created_at DESC",
            (patient_id, hospital_id),
        )
        prescriptions = parse_pharmacy_prescriptions([dict(r) for r in cursor.fetchall()])

        cursor.execute(
            "SELECT * FROM diagnostics WHERE patient_id = %s AND hospital_id = %s AND deleted_at IS NULL ORDER BY created_at DESC",
            (patient_id, hospital_id),
        )
        labs = [dict(r) for r in cursor.fetchall()]

        cursor.execute(
            "SELECT * FROM clinical_notes WHERE patient_id = %s ORDER BY created_at DESC",
            (patient_id,),
        )
        notes = [dict(r) for r in cursor.fetchall()]

        cursor.execute(
            "SELECT * FROM observation_notes WHERE patient_id = %s ORDER BY created_at DESC",
            (patient_id,),
        )
        observation_notes = [dict(r) for r in cursor.fetchall()]

    is_discharge = bool(admissions and admissions[0].get("discharge_date"))

    summary = generate_patient_summary(
        patient=patient,
        admissions=admissions,
        encounters=encounters,
        diagnoses=diagnoses,
        prescriptions=prescriptions,
        labs=labs,
        notes=notes + observation_notes,
        is_discharge=is_discharge,
    )
    if not summary:
        return (
            jsonify(
                {
                    "error": (
                        "AI summary generation isn't available right now -- the "
                        "AI service may not be configured or reachable. Try again "
                        "shortly."
                    )
                }
            ),
            503,
        )

    title = "AI Discharge Summary" if is_discharge else "AI Clinical Summary"
    certificate_id = create_certificate(
        {
            "patient_id": patient_id,
            "admission_id": admissions[0]["id"] if admissions else None,
            "certificate_type": "discharge_summary",
            "title": title,
            "body": summary,
            "issued_by": g.current_user.get("username") if g.current_user else None,
        }
    )

    return jsonify(
        {
            "summary": summary,
            "certificate_id": certificate_id,
            "title": title,
            "is_discharge": is_discharge,
        }
    )


@emr_bp.route("/api/emr/<patient_id>/share-whatsapp", methods=["POST"])
@require_permissions("patients.clinical.write")
def share_whatsapp(patient_id):
    hospital_id = current_hospital_id()
    payload = request.get_json(silent=True) or {}
    summary_text = (payload.get("summary") or "").strip()
    title = payload.get("title") or "AI Clinical Summary"

    if not summary_text:
        return jsonify({"error": "Nothing to share -- generate a summary first."}), 400

    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute(
            "SELECT * FROM patients WHERE patient_id = %s AND hospital_id = %s",
            (patient_id, hospital_id),
        )
        patient = cursor.fetchone()
        if not patient:
            return jsonify({"error": "Patient not found"}), 404
        patient = dict(patient)

    phone = patient.get("phone")
    if not phone:
        return jsonify({"error": "This patient has no phone number on file."}), 400

    if not whatsapp_is_configured():
        return (
            jsonify(
                {
                    "error": (
                        "WhatsApp Business API isn't configured yet. Ask an "
                        "owner/admin to set it up under Settings -> WhatsApp "
                        "Business API, or download the PDF and share it manually."
                    ),
                    "fallback": "manual",
                }
            ),
            400,
        )

    public_base_url = (os.getenv("PUBLIC_BASE_URL") or "").strip().rstrip("/")
    if not public_base_url:
        return (
            jsonify(
                {
                    "error": (
                        "This server doesn't have PUBLIC_BASE_URL configured, so "
                        "WhatsApp can't fetch a PDF attachment. Download the PDF "
                        "and share it manually."
                    ),
                    "fallback": "manual",
                }
            ),
            400,
        )

    patient_name = (
        " ".join(part for part in [patient.get("name"), patient.get("last_name")] if part).strip()
        or "Patient"
    )

    try:
        pdf_bytes = generate_pdf(patient_name, title, summary_text)
        token = store_whatsapp_media(pdf_bytes, mime_type="application/pdf")
        media_url = f"{public_base_url}/api/whatsapp/media/{token}"
        sent = send_whatsapp_message(
            phone,
            f"Hi {patient_name}, here is your {title.lower()} from HospAI.",
            media_url=media_url,
        )
    except Exception:
        logger.exception("Failed to share EMR summary via WhatsApp for %s", patient_id)
        sent = False

    if not sent:
        return (
            jsonify(
                {
                    "error": "WhatsApp didn't confirm delivery. Download the PDF and share it manually.",
                    "fallback": "manual",
                }
            ),
            502,
        )

    return jsonify({"success": True})


@emr_bp.route("/api/emr/access-log", methods=["POST"])
@require_permissions("patients.read")
def log_access():
    data = request.json or {}
    patient_id = data.get("patient_id")
    action = data.get("action", "viewed")
    if patient_id and g.current_user:
        with get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute(
                "INSERT INTO emr_access_logs (patient_id, doctor_id, action) VALUES (%s, %s, %s)",
                (patient_id, g.current_user.get("id"), action),
            )
            conn.commit()
    return jsonify({"status": "ok"})
