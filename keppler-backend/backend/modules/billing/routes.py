from flask import Blueprint, request, jsonify, g
from datetime import datetime
from core.limiter import limiter

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
    create_invoice,
    update_invoice,
    list_invoices,
    list_invoice_items_for,
    record_invoice_payment,
    delete_invoice,
    get_invoice_by_id,
    list_all_invoice_payments,
    get_revenue_summary,
    list_insurance_claims,
    create_insurance_claim,
    update_insurance_claim,
    delete_insurance_claim,
    add_invoice_items,
    get_invoice_items,
    get_umr_ledger,
)

billing_bp = Blueprint("billing", __name__)


@billing_bp.get("/api/billing/invoices")
@require_permissions("billing.read")
def billing_invoices():
    patient_id = request.args.get("patient_id")
    module = request.args.get("module")
    invoices = rows_to_dicts(
        list_invoices(
            patient_id=patient_id,
            module=module,
            hospital_id=current_hospital_id(),
        )
    )
    # `?include=items` attaches each invoice's line items (one extra query for
    # all of them) so a billing counter can show itemised bills without a
    # request per invoice.
    if "items" in (request.args.get("include") or "").split(","):
        grouped = list_invoice_items_for([inv["id"] for inv in invoices])
        for inv in invoices:
            inv["items"] = grouped.get(inv["id"], [])
    return jsonify({"invoices": invoices})


@billing_bp.get("/api/billing/payments")
@require_permissions("billing.read")
def billing_payments():
    return jsonify(
        {
            "payments": rows_to_dicts(
                list_all_invoice_payments(hospital_id=current_hospital_id())
            )
        }
    )


@billing_bp.post("/api/billing/invoices")
@require_permissions("billing.invoices.write")
def billing_create_invoice():
    payload = request.get_json(force=True)
    validation_error = validate_required_fields(payload, ["module", "total_amount"])
    if validation_error:
        return validation_error
    invoice_no = (
        payload.get("invoice_no") or new_invoice_no("INV")
    )
    invoice_id = create_invoice(
        {
            "invoice_no": invoice_no,
            "patient_id": payload.get("patient_id"),
            "module": payload.get("module", "OP"),
            "doctor_name": payload.get("doctor_name"),
            "clinic_name": payload.get("clinic_name"),
            "referral_source": payload.get("referral_source"),
            "subtotal": payload.get("subtotal", 0),
            "tax": payload.get("tax", 0),
            "discount": payload.get("discount", 0),
            "total_amount": payload.get("total_amount", 0),
            "paid_amount": payload.get("paid_amount", 0),
            "advance_amount": payload.get("advance_amount", 0),
            "refunded_amount": payload.get("refunded_amount", 0),
            "payment_status": payload.get("payment_status", "due"),
            "created_by": g.current_user.get("username"),
            "appointment_id": payload.get("appointment_id"),
            "encounter_id": payload.get("encounter_id"),
        },
        hospital_id=current_hospital_id(),
    )
    log_audit_event(
        "create", "billing_invoices", str(invoice_id), {"invoice_no": invoice_no}
    )
    return jsonify({"invoice_id": invoice_id, "invoice_no": invoice_no})


@billing_bp.put("/api/billing/invoices/<int:invoice_id>")
@require_permissions("billing.invoices.write")
def billing_update_invoice(invoice_id):
    payload = request.get_json(force=True)
    updated = update_invoice(invoice_id, payload, hospital_id=current_hospital_id())
    if not updated:
        return jsonify({"error": "Invoice not found"}), 404
    log_audit_event(
        "update", "billing_invoices", str(invoice_id), {"invoice_id": invoice_id}
    )
    return jsonify({"status": "ok"})


@billing_bp.delete("/api/billing/invoices/<int:invoice_id>")
@require_permissions("billing.invoices.write")
def billing_delete_invoice(invoice_id):
    deleted = delete_invoice(
        invoice_id, actor=g.current_user.get("username"), hospital_id=current_hospital_id()
    )
    if not deleted:
        return jsonify({"error": "Invoice not found"}), 404
    log_audit_event(
        "delete", "billing_invoices", str(invoice_id), {"invoice_id": invoice_id}
    )
    return jsonify({"status": "ok"})


@billing_bp.post("/api/billing/razorpay/order")
@require_permissions("billing.invoices.write")
@limiter.limit("10 per minute")
def billing_razorpay_order():
    config_error = require_razorpay_configured()
    if config_error:
        return config_error
    payload = request.get_json(force=True)
    validation_error = validate_required_fields(payload, ["invoice_id", "amount"])
    if validation_error:
        return validation_error

    amount_paise = to_amount_paise(payload.get("amount"))
    if amount_paise is None:
        return jsonify({"error": "Amount must be greater than zero."}), 400

    try:
        invoice_id = int(payload.get("invoice_id"))
    except (TypeError, ValueError):
        return jsonify({"error": "invoice_id must be a valid number."}), 400
    if not get_invoice_by_id(invoice_id, hospital_id=current_hospital_id()):
        return jsonify({"error": "Invoice not found"}), 404
    receipt = (
        payload.get("receipt")
        or f"bill-{invoice_id}-{datetime.now().strftime('%Y%m%d%H%M%S')}"
    )
    notes = payload.get("notes") if isinstance(payload.get("notes"), dict) else {}
    notes = {
        **notes,
        "invoice_id": str(invoice_id),
        "hospital_id": str(current_hospital_id()),
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


@billing_bp.post("/api/billing/razorpay/verify")
@require_permissions("billing.invoices.write")
def billing_razorpay_verify():
    config_error = require_razorpay_configured()
    if config_error:
        return config_error
    payload = request.get_json(force=True)
    validation_error = validate_required_fields(
        payload,
        [
            "invoice_id",
            "amount",
            "razorpay_order_id",
            "razorpay_payment_id",
            "razorpay_signature",
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

    try:
        invoice_id = int(payload.get("invoice_id"))
    except (TypeError, ValueError):
        return jsonify({"error": "invoice_id must be a valid number."}), 400

    try:
        payment_id = record_invoice_payment(
            invoice_id,
            {
                "amount": amount,
                "payment_mode": normalize_payment_mode(payload.get("payment_mode")),
                "gateway_ref": payload.get("razorpay_payment_id"),
                "converted_from_mode": payload.get("converted_from_mode"),
                "converted_to_mode": payload.get("converted_to_mode"),
            },
            hospital_id=current_hospital_id(),
        )
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400
    if payment_id is None:
        return jsonify({"error": "Invoice not found"}), 404
    log_audit_event(
        "create",
        "billing_payments",
        str(payment_id),
        {
            "invoice_id": invoice_id,
            "gateway_ref": payload.get("razorpay_payment_id"),
            "razorpay_order_id": payload.get("razorpay_order_id"),
        },
    )
    return jsonify({"payment_id": payment_id})


@billing_bp.post("/api/billing/invoices/<int:invoice_id>/payments")
@require_permissions("billing.invoices.write")
def billing_record_payment(invoice_id):
    payload = request.get_json(force=True)
    validation_error = validate_required_fields(payload, ["amount", "payment_mode"])
    if validation_error:
        return validation_error
    try:
        payment_id = record_invoice_payment(
            invoice_id,
            {
                "amount": payload.get("amount", 0),
                "payment_mode": payload.get("payment_mode", "cash"),
                "gateway_ref": payload.get("gateway_ref"),
                "converted_from_mode": payload.get("converted_from_mode"),
                "converted_to_mode": payload.get("converted_to_mode"),
            },
            hospital_id=current_hospital_id(),
        )
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400
    if payment_id is None:
        return jsonify({"error": "Invoice not found"}), 404
    log_audit_event(
        "create", "billing_payments", str(payment_id), {"invoice_id": invoice_id}
    )
    return jsonify({"payment_id": payment_id})


@billing_bp.get("/api/billing/invoices/<int:invoice_id>/items")
@require_permissions("billing.read")
def billing_get_invoice_items(invoice_id):
    return jsonify({"items": rows_to_dicts(get_invoice_items(invoice_id))})


@billing_bp.post("/api/billing/invoices/<int:invoice_id>/items")
@require_permissions("billing.invoices.write")
def billing_add_invoice_items(invoice_id):
    payload = request.get_json(force=True)
    items = payload.get("items")
    if not isinstance(items, list) or not items:
        return jsonify({"error": "items must be a non-empty array"}), 400
    rows = add_invoice_items(invoice_id, items)
    log_audit_event(
        "create", "invoice_items", str(invoice_id), {"count": len(items)}
    )
    return jsonify({"items": rows_to_dicts(rows)})


@billing_bp.get("/api/billing/umr-ledger/<patient_id>")
@require_permissions("billing.read")
def billing_umr_ledger(patient_id):
    return jsonify(get_umr_ledger(patient_id, hospital_id=current_hospital_id()))


@billing_bp.get("/api/billing/revenue-summary")
@require_permissions("billing.read")
def billing_revenue_summary():
    return jsonify(get_revenue_summary(hospital_id=current_hospital_id()))


@billing_bp.get("/api/billing/claims")
@require_permissions("billing.read")
def billing_claims():
    invoice_id = request.args.get("invoice_id", type=int)
    status = request.args.get("status")
    return jsonify(
        {
            "claims": rows_to_dicts(
                list_insurance_claims(invoice_id=invoice_id, status=status)
            )
        }
    )


# submitted -> under_review -> approved | rejected; a rejected claim can be
# resubmitted; approved settles; settled is final.
CLAIM_TRANSITIONS = {
    "submitted": {"under_review", "approved", "rejected"},
    "under_review": {"approved", "rejected"},
    "approved": {"settled"},
    "rejected": {"submitted"},
    "settled": set(),
}


@billing_bp.post("/api/billing/claims")
@require_permissions("billing.claims.write")
def billing_create_claim():
    payload = request.get_json(force=True)
    validation_error = validate_required_fields(
        payload, ["invoice_id", "insurer_name", "claim_amount"]
    )
    if validation_error:
        return validation_error
    claim_id = create_insurance_claim(payload)
    log_audit_event(
        "create",
        "insurance_claims",
        str(claim_id),
        {"invoice_id": payload.get("invoice_id")},
    )
    return jsonify({"claim_id": claim_id})


@billing_bp.put("/api/billing/claims/<int:claim_id>")
@require_permissions("billing.claims.write")
def billing_update_claim(claim_id):
    from utils.database import get_insurance_claim

    payload = request.get_json(force=True)
    new_status = payload.get("claim_status")
    if new_status is not None:
        existing = get_insurance_claim(claim_id)
        if not existing:
            return jsonify({"error": "Claim not found"}), 404
        if new_status not in CLAIM_TRANSITIONS:
            return jsonify({"error": f"Unknown claim_status '{new_status}'", "allowed": sorted(CLAIM_TRANSITIONS)}), 400
        current = existing["claim_status"]
        if new_status != current and new_status not in CLAIM_TRANSITIONS.get(current, set()):
            return jsonify({"error": f"A {current} claim cannot become {new_status}", "allowed": sorted(CLAIM_TRANSITIONS.get(current, set()))}), 409
    updated = update_insurance_claim(claim_id, payload)
    if not updated:
        return jsonify({"error": "Claim not found"}), 404
    log_audit_event("update", "insurance_claims", str(claim_id), {"claim_id": claim_id})
    return jsonify({"status": "ok"})


@billing_bp.delete("/api/billing/claims/<int:claim_id>")
@require_permissions("billing.claims.write")
def billing_delete_claim(claim_id):
    deleted = delete_insurance_claim(claim_id, actor=g.current_user.get("username"))
    if not deleted:
        return jsonify({"error": "Claim not found"}), 404
    log_audit_event("delete", "insurance_claims", str(claim_id), {"claim_id": claim_id})
    return jsonify({"status": "ok"})
