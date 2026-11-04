import logging
from flask import Blueprint, request, jsonify, g
from datetime import datetime

from shared.session_auth import require_permissions
from shared.audit import log_audit_event
from shared.responses import (
    rows_to_dicts,
    validate_required_fields,
)
from shared.payments import (
    RAZORPAY_KEY_ID,
    create_razorpay_order,
    normalize_payment_mode,
    require_razorpay_configured,
    to_amount_paise,
    verify_razorpay_signature,
)
from shared.hospital import current_hospital_id

from utils.database import (
    new_invoice_no,
    list_appointments,
    create_appointment,
    update_appointment,
    get_appointment_by_id,
    get_patient,
    create_invoice,
    record_invoice_payment,
)
from core.whatsapp import send_whatsapp_message

appointments_bp = Blueprint("appointments", __name__)
logger = logging.getLogger(__name__)


def _notify_patient_consultation_started(appointment_id, hospital_id):
    """Best-effort WhatsApp nudge telling the patient which doctor/department
    is ready for them. Never raises - a messaging failure must not affect the
    appointment status update that triggered it."""
    try:
        appointment = get_appointment_by_id(appointment_id, hospital_id=hospital_id)
        if not appointment:
            return
        patient_id = appointment["patient_id"]
        phone = None
        if patient_id:
            patient = get_patient(patient_id, hospital_id=hospital_id)
            phone = patient["phone"] if patient else None
        if not phone:
            return
        doctor = appointment["doctor_name"] or "your doctor"
        department = (appointment["department"] or "").strip()
        location = (
            f"the {department} department" if department else "the consultation room"
        )
        body = (
            f"Hi {appointment['patient_name']}, Dr. {doctor} is ready to see you now in "
            f"{location}. Please proceed with Token #{appointment['token_no']}."
        )
        send_whatsapp_message(phone, body)
    except Exception:
        logger.exception(
            "Failed to send consultation-start WhatsApp notification for appointment %s",
            appointment_id,
        )


def _notify_next_patient_to_be_ready(appointment_id, hospital_id):
    """Notify the next patient in the queue for the same doctor that they are next."""
    try:
        appointment = get_appointment_by_id(appointment_id, hospital_id=hospital_id)
        if not appointment:
            return

        doctor_name = appointment.get("doctor_name")
        appointment_date = appointment.get("appointment_date")

        if not doctor_name or not appointment_date:
            return

        today_appts = list_appointments(
            appointment_date=appointment_date,
            doctor_name=doctor_name,
            hospital_id=hospital_id,
        )

        # Filter patients who are waiting
        waiting_appts = [
            a
            for a in today_appts
            if a.get("status") in ("scheduled", "waiting", "checked_in")
        ]
        waiting_appts.sort(key=lambda x: x.get("token_no") or 999999)

        if not waiting_appts:
            return

        next_appt = waiting_appts[0]
        patient_id = next_appt.get("patient_id")
        phone = None
        if patient_id:
            patient = get_patient(patient_id, hospital_id=hospital_id)
            phone = patient.get("phone") if patient else None

        if not phone:
            return

        doctor = next_appt.get("doctor_name") or "your doctor"
        body = (
            f"Hi {next_appt.get('patient_name')}, please be ready! "
            f"You are next in line to see Dr. {doctor}. "
            f"Your Token is #{next_appt.get('token_no')}."
        )
        send_whatsapp_message(phone, body)
    except Exception:
        logger.exception(
            "Failed to send be-ready WhatsApp notification for next patient."
        )


# NOTE: Add your utils.database imports here after extraction.


@appointments_bp.get("/api/appointments")
@require_permissions("patients.read")
def appointments_list():
    appointment_date = request.args.get("date")
    status = request.args.get("status")
    visit_type = request.args.get("visit_type")
    doctor_name = request.args.get("doctor_name")

    # Clinician Isolation
    doctor_name = None
    current_user = getattr(g, "current_user", {})
    if (
        current_user.get("access_role") == "clinician"
        or (current_user.get("job_role") or "").strip().lower() == "doctor"
    ):
        doctor_name = current_user.get("full_name") or current_user.get("username")

    patient_id = request.args.get("patient_id")
    return jsonify(
        {
            "appointments": rows_to_dicts(
                list_appointments(
                    appointment_date=appointment_date,
                    status=status,
                    visit_type=visit_type,
                    doctor_name=doctor_name,
                    patient_id=patient_id,
                    hospital_id=current_hospital_id(),
                )
            )
        }
    )


@appointments_bp.post("/api/appointments")
@require_permissions("patients.appointments.write")
def appointments_create():
    payload = request.get_json(force=True)
    validation_error = validate_required_fields(
        payload, ["patient_name", "visit_type", "appointment_date"]
    )
    if validation_error:
        return validation_error
    # visit_type becomes encounters.encounter_type (CHECK: OP | IP); anything
    # else was a database error surfacing as a 500.
    if str(payload.get("visit_type", "")).upper() not in ("OP", "IP"):
        return jsonify({"error": "visit_type must be OP or IP"}), 400
    payload["visit_type"] = str(payload["visit_type"]).upper()

    appointment_id, token_no, patient_id = create_appointment(
        payload, hospital_id=current_hospital_id()
    )

    # Handle consultation fee invoice if provided
    consultation_fee = float(payload.get("consultation_fee") or 0)
    if consultation_fee > 0:
        invoice_no = new_invoice_no("INV-OP")
        invoice_id = create_invoice(
            {
                "invoice_no": invoice_no,
                "patient_id": patient_id,
                "module": "OP",
                "doctor_name": payload.get("doctor_name"),
                "total_amount": consultation_fee,
                # The payment recorded just below adds the fee to paid_amount
                # and settles the status; starting at the fee counted it twice.
                "paid_amount": 0,
                "advance_amount": 0,
                "refunded_amount": 0,
                "payment_status": "due",
                "created_by": (
                    g.current_user.get("username") if hasattr(g, "current_user") else ""
                ),
                "appointment_id": appointment_id,
                "encounter_id": payload.get("encounter_id"),
            },
            hospital_id=current_hospital_id(),
        )
        payment_mode = normalize_payment_mode(payload.get("payment_mode", "cash"))
        record_invoice_payment(
            invoice_id,
            {
                "amount": consultation_fee,
                "payment_mode": payment_mode,
                "gateway_ref": None,
                "created_by": (
                    g.current_user.get("username") if hasattr(g, "current_user") else ""
                ),
            },
            hospital_id=current_hospital_id(),
        )

    log_audit_event(
        "create",
        "appointments",
        str(appointment_id),
        {"patient_name": payload.get("patient_name"), "token_no": token_no, "patient_id": patient_id},
    )
    return jsonify({"appointment_id": appointment_id, "token_no": token_no, "op_number": token_no, "patient_id": patient_id})


@appointments_bp.put("/api/appointments/<int:appointment_id>")
@require_permissions("patients.appointments.write")
def appointments_update(appointment_id):
    payload = request.get_json(force=True)
    updated = update_appointment(appointment_id, payload)
    if not updated:
        return jsonify({"error": "Appointment not found"}), 404
    log_audit_event(
        "update",
        "appointments",
        str(appointment_id),
        {"status": payload.get("status")},
    )
    if payload.get("status") == "in_consultation":
        _notify_patient_consultation_started(appointment_id, current_hospital_id())
        _notify_next_patient_to_be_ready(appointment_id, current_hospital_id())
    return jsonify({"status": "ok"})


@appointments_bp.post("/api/appointments/razorpay/order")
@require_permissions("patients.appointments.write")
def appointments_razorpay_order():
    config_error = require_razorpay_configured()
    if config_error:
        return config_error
    payload = request.get_json(force=True)
    validation_error = validate_required_fields(payload, ["amount"])
    if validation_error:
        return validation_error

    amount_paise = to_amount_paise(payload.get("amount"))
    if amount_paise is None:
        return jsonify({"error": "Amount must be greater than zero."}), 400

    receipt = (
        payload.get("receipt") or f"appt-{datetime.now().strftime('%Y%m%d%H%M%S')}"
    )
    notes = payload.get("notes") if isinstance(payload.get("notes"), dict) else {}
    notes = {
        **notes,
        "hospital_id": str(current_hospital_id()),
        "created_by": g.current_user.get("username") or "",
    }
    try:
        order = create_razorpay_order(
            amount_paise=amount_paise,
            currency=payload.get("currency", "INR"),
            receipt=receipt,
            notes=notes,
        )
    except RuntimeError as error:
        return jsonify({"error": str(error)}), 502

    return jsonify(
        {
            "key_id": RAZORPAY_KEY_ID,
            "order_id": order.get("id"),
            "amount": order.get("amount"),
            "currency": order.get("currency"),
            "receipt": order.get("receipt"),
        }
    )


@appointments_bp.post("/api/appointments/razorpay/verify")
@require_permissions("patients.appointments.write")
def appointments_razorpay_verify():
    config_error = require_razorpay_configured()
    if config_error:
        return config_error
    payload = request.get_json(force=True)
    validation_error = validate_required_fields(
        payload,
        [
            "razorpay_order_id",
            "razorpay_payment_id",
            "razorpay_signature",
            "amount",
            "appointment",
        ],
    )
    if validation_error:
        return validation_error

    if not verify_razorpay_signature(
        payload.get("razorpay_order_id"),
        payload.get("razorpay_payment_id"),
        payload.get("razorpay_signature"),
    ):
        return jsonify({"error": "Invalid Razorpay signature."}), 400

    amount = float(payload.get("amount") or 0)
    if amount <= 0:
        return jsonify({"error": "Amount must be greater than zero."}), 400

    appointment_payload = payload.get("appointment")
    if not isinstance(appointment_payload, dict):
        return jsonify({"error": "appointment must be an object."}), 400

    appointment_validation = validate_required_fields(
        appointment_payload, ["patient_name", "visit_type", "appointment_date"]
    )
    if appointment_validation:
        return appointment_validation

    appointment_id, token_no, patient_id = create_appointment(
        {
            "patient_id": appointment_payload.get("patient_id"),
            "patient_name": appointment_payload.get("patient_name"),
            "visit_type": appointment_payload.get("visit_type", "OP"),
            "department": appointment_payload.get("department"),
            "doctor_name": appointment_payload.get("doctor_name"),
            "appointment_date": appointment_payload.get("appointment_date"),
            "status": appointment_payload.get("status", "scheduled"),
            "appointment_kind": appointment_payload.get("appointment_kind", "new"),
            "follow_up_for": appointment_payload.get("follow_up_for"),
            "notes": appointment_payload.get("notes"),
        },
        hospital_id=current_hospital_id(),
    )
    invoice_no = new_invoice_no("INV-OP")
    invoice_id = create_invoice(
        {
            "invoice_no": invoice_no,
            "patient_id": appointment_payload.get("patient_id"),
            "module": "OP",
            "doctor_name": appointment_payload.get("doctor_name"),
            "total_amount": amount,
            "paid_amount": 0,
            "advance_amount": 0,
            "refunded_amount": 0,
            "payment_status": "due",
            "created_by": g.current_user.get("username"),
        },
        hospital_id=current_hospital_id(),
    )
    payment_mode = normalize_payment_mode(payload.get("payment_mode"))
    payment_id = record_invoice_payment(
        invoice_id,
        {
            "amount": amount,
            "payment_mode": payment_mode,
            "gateway_ref": payload.get("razorpay_payment_id"),
            "converted_from_mode": payload.get("converted_from_mode"),
            "converted_to_mode": payload.get("converted_to_mode"),
        },
        hospital_id=current_hospital_id(),
    )
    log_audit_event(
        "create",
        "appointments",
        str(appointment_id),
        {
            "patient_name": appointment_payload.get("patient_name"),
            "token_no": token_no,
            "invoice_id": invoice_id,
            "invoice_payment_id": payment_id,
            "gateway_ref": payload.get("razorpay_payment_id"),
        },
    )
    return jsonify(
        {
            "appointment_id": appointment_id,
            "token_no": token_no,
            "invoice_id": invoice_id,
            "payment_id": payment_id,
        }
    )
