"""OT / Surgery: case booking, the digital 14-page booklet (PAC, WHO safety
checklist, anaesthesia/operation record, PACU/Aldrete recovery), and the
status gate that enforces each stage's clearance before letting a case move
on. Replaces the previous localStorage-only src/services/surgeryDb.ts, which
had no backend at all and let every stage-transition button fire
unconditionally -- see ensure_ot_tables() in utils/database.py for why the
booklet is stored whole as JSON."""
from datetime import datetime

from flask import Blueprint, request, jsonify, g

from shared.session_auth import require_permissions
from shared.audit import log_audit_event
from shared.responses import rows_to_dicts, validate_required_fields

from utils.database import (
    new_invoice_no,
    create_ot_case,
    list_ot_cases,
    get_ot_case,
    save_ot_booklet_section,
    save_ot_booklet_full,
    update_ot_case_status,
    mark_ot_case_billed,
    list_ot_cases_pacu_ready,
    create_invoice,
)
import json

ot_bp = Blueprint("ot", __name__)


def _case_dict(row, include_booklet=True):
    if not row:
        return None
    record = dict(row)
    if include_booklet:
        try:
            record["booklet"] = json.loads(record["booklet"]) if record.get("booklet") else {}
        except (TypeError, ValueError):
            record["booklet"] = {}
    else:
        record.pop("booklet", None)
    return record


@ot_bp.get("/api/ot/cases")
@require_permissions("patients.read")
def ot_list_cases():
    status = request.args.get("status")
    patient_id = request.args.get("patient_id")
    rows = list_ot_cases(status=status, patient_id=patient_id)
    return jsonify({"cases": [_case_dict(r) for r in rows]})


@ot_bp.get("/api/ot/cases/pacu-ready")
@require_permissions("patients.read")
def ot_pacu_ready():
    """Cases cleared out of PACU but not yet picked up by a bed allocation --
    the ward-side hand-off, mirroring ER's pending bed-requests."""
    return jsonify({"cases": list_ot_cases_pacu_ready()})


@ot_bp.post("/api/ot/cases")
@require_permissions("patients.clinical.write")
def ot_create_case():
    payload = request.get_json(force=True) or {}
    validation_error = validate_required_fields(payload, ["patient_id", "procedure_name"])
    if validation_error:
        return validation_error
    row = create_ot_case(payload, created_by=(g.current_user or {}).get("username"))
    record = _case_dict(row)
    log_audit_event("create", "ot_cases", str(record["id"]), {"patient_id": payload["patient_id"]})
    return jsonify(record)


@ot_bp.get("/api/ot/cases/<int:case_id>")
@require_permissions("patients.read")
def ot_get_case(case_id):
    row = get_ot_case(case_id)
    if not row:
        return jsonify({"error": "Case not found"}), 404
    return jsonify(_case_dict(row))


@ot_bp.put("/api/ot/cases/<int:case_id>/booklet")
@require_permissions("patients.clinical.write")
def ot_save_booklet(case_id):
    if not get_ot_case(case_id):
        return jsonify({"error": "Case not found"}), 404
    payload = request.get_json(force=True) or {}
    booklet = payload.get("booklet")
    if not isinstance(booklet, dict):
        return jsonify({"error": "booklet must be an object"}), 400
    row = save_ot_booklet_full(case_id, booklet)
    log_audit_event("update", "ot_cases", str(case_id), {"section": "booklet"})
    return jsonify(_case_dict(row))


@ot_bp.post("/api/ot/cases/<int:case_id>/pac")
@require_permissions("patients.clinical.write")
def ot_save_pac(case_id):
    if not get_ot_case(case_id):
        return jsonify({"error": "Case not found"}), 404
    payload = request.get_json(force=True) or {}
    row = save_ot_booklet_section(case_id, "pac", payload)
    log_audit_event("update", "ot_cases", str(case_id), {"section": "pac"})
    return jsonify(_case_dict(row))


@ot_bp.post("/api/ot/cases/<int:case_id>/who-checklist")
@require_permissions("patients.clinical.write")
def ot_save_who_checklist(case_id):
    if not get_ot_case(case_id):
        return jsonify({"error": "Case not found"}), 404
    payload = request.get_json(force=True) or {}
    row = save_ot_booklet_section(case_id, "whoChecklist", payload)
    log_audit_event("update", "ot_cases", str(case_id), {"section": "whoChecklist"})
    return jsonify(_case_dict(row))


@ot_bp.post("/api/ot/cases/<int:case_id>/pacu")
@require_permissions("patients.clinical.write")
def ot_save_pacu(case_id):
    """Saving the PACU/Aldrete section is also the billing trigger: once the
    patient is no longer 'In PACU', this case is done recovering and the
    surgery gets invoiced exactly once (billed_at gates the second call),
    fixing the old client-side dedup bug that matched on patientId alone."""
    case_row = get_ot_case(case_id)
    if not case_row:
        return jsonify({"error": "Case not found"}), 404
    payload = request.get_json(force=True) or {}
    row = save_ot_booklet_section(case_id, "recoveryAldrete", payload)
    log_audit_event("update", "ot_cases", str(case_id), {"section": "recoveryAldrete"})

    discharge_status = payload.get("dischargeStatus")
    billed = False
    invoice_id = case_row["invoice_id"]
    if discharge_status and discharge_status != "In PACU" and not case_row["billed_at"]:
        total_amount = float(case_row["total_amount"] or 0)
        if total_amount > 0:
            invoice_id = create_invoice({
                "invoice_no": new_invoice_no(f"INV-OT-{case_id}"),
                "patient_id": case_row["patient_id"],
                "module": "OT",
                "total_amount": total_amount,
                "created_by": (g.current_user or {}).get("username"),
            })
            billed = mark_ot_case_billed(case_id, invoice_id)
            if billed:
                log_audit_event("create", "invoices", str(invoice_id), {
                    "module": "OT", "case_id": case_id, "total_amount": total_amount,
                })

    record = _case_dict(get_ot_case(case_id))
    record["billed_now"] = billed
    return jsonify(record)


_STATUS_ORDER = [
    "PAC Pending", "PAC Cleared", "Pre-Op Holding", "In Surgery",
    "PACU Recovery", "Completed", "Cancelled",
]


@ot_bp.patch("/api/ot/cases/<int:case_id>/status")
@require_permissions("patients.clinical.write")
def ot_update_status(case_id):
    """The enforcement gate backing every stage-transition button in the UI --
    each target status requires the booklet section that proves the stage was
    actually done, not just clicked through."""
    row = get_ot_case(case_id)
    if not row:
        return jsonify({"error": "Case not found"}), 404
    payload = request.get_json(force=True) or {}
    new_status = payload.get("status")
    if new_status not in _STATUS_ORDER:
        return jsonify({"error": f"Invalid status: {new_status}"}), 400

    try:
        booklet = json.loads(row["booklet"]) if row["booklet"] else {}
    except (TypeError, ValueError):
        booklet = {}

    if new_status == "PAC Cleared":
        clearance = (booklet.get("pac") or {}).get("clearanceStatus")
        if clearance not in ("Cleared", "High Risk Cleared"):
            return jsonify({
                "error": "PAC not cleared",
                "reason": "Pre-anaesthetic assessment must be completed and cleared before this case can proceed.",
            }), 409
    elif new_status == "PACU Recovery":
        who = booklet.get("whoChecklist") or {}
        sign_in = who.get("signIn") or {}
        time_out = who.get("timeOut") or {}
        sign_out = who.get("signOut") or {}
        if not (sign_in.get("signedByNurse") and time_out.get("signedBySurgeon") and sign_out.get("signedByScrubNurse")):
            return jsonify({
                "error": "WHO safety checklist incomplete",
                "reason": "Sign-In, Time-Out, and Sign-Out must all be signed before transfer to PACU.",
            }), 409
    elif new_status == "Completed":
        recovery = booklet.get("recoveryAldrete") or {}
        total_score = (recovery.get("aldreteScore") or {}).get("totalScore")
        if total_score is None or recovery.get("dischargeStatus") == "In PACU":
            return jsonify({
                "error": "PACU recovery incomplete",
                "reason": "An Aldrete recovery score and a discharge-ready status are required before completing this case.",
            }), 409

    updated = update_ot_case_status(case_id, new_status)
    log_audit_event("update", "ot_cases", str(case_id), {"status": new_status})
    return jsonify(_case_dict(updated))
