"""Patient messaging: the one route every screen uses to send a patient an SMS
or a WhatsApp message, optionally with a PDF (bill, discharge summary, EMR
report, lab report, patient journey).

Why one route rather than a send per module: the frontend's records (bills,
OP encounters, discharge summaries) mostly live in the browser, so the
document is rendered there and posted here as a PDF. What this service owns is
the part a browser cannot do -- holding the Twilio credentials, giving the PDF
a URL Twilio's servers can fetch, and keeping a log of what was actually
handed to the provider, so "the patient was notified" is a fact on record and
not an assumption.

Channels
  whatsapp  The PDF is attached as media. Needs PUBLIC_BASE_URL (Twilio
            fetches the file over the open internet; localhost won't do).
  sms       SMS cannot carry a file, so a document goes as a link in the text.
            Same PUBLIC_BASE_URL requirement.

Without PUBLIC_BASE_URL the text still goes, and the response says the
document did not (document_attached: false) -- a bill notice without the bill
is still worth sending, but the desk has to know to hand over the PDF.

The {link} placeholder
  A message may contain "{link}"; it becomes the document URL. Any line
  holding {link} is dropped when there is no URL, so templates should keep the
  link on its own line. With a document and no {link} in an SMS, the link is
  appended. (Indian SMS must match a DLT-registered template exactly, which is
  why the position of the link is the template's to decide, not this code's.)

WhatsApp templates
  Business-initiated WhatsApp outside a 24-hour customer session must use a
  pre-approved template, or Twilio rejects it with error 63016. Map a message
  kind to a Twilio Content SID with WHATSAPP_TEMPLATE_SIDS, a JSON object such
  as {"bill": "HX...", "feedback_request": "HX..."}. Templates receive:
    {{1}} patient name
    {{2}} the message, flattened onto one line (WhatsApp variables cannot
          contain newlines)
    {{3}} the document path relative to PUBLIC_BASE_URL -- a media template's
          URL should be "<PUBLIC_BASE_URL>/{{3}}"
"""

import base64
import binascii
import json
import logging
import os
import re

from flask import Blueprint, g, jsonify, request

from core import sms as sms_provider
from core import whatsapp as whatsapp_provider
from shared.hospital import current_hospital_id
from shared.session_auth import require_permissions
from utils.database import (
    get_connection,
    insert_patient_message,
    list_patient_messages,
    store_whatsapp_media,
    update_patient_message_delivery,
)

messaging_bp = Blueprint("messaging", __name__)
logger = logging.getLogger(__name__)

CHANNELS = ("sms", "whatsapp")
KINDS = (
    "appointment_booked",
    "op_registered",
    "op_called",
    "op_nurse_call",
    "bill",
    "discharge_summary",
    "emr_report",
    "lab_report",
    "patient_journey",
    "feedback_request",
    "custom",
)
# Twilio's own ceiling for WhatsApp media is higher, but every document here
# is a generated text/table PDF of a few tens of kB; anything near this size
# is a mistake (a scanned image embedded in the PDF), not a bill.
MAX_DOCUMENT_BYTES = 5 * 1024 * 1024
MAX_MESSAGE_CHARS = 1500

# What a desk should do about the errors it will actually meet. Twilio's own
# text for these is accurate but written for developers.
ERROR_HINTS = {
    "not_configured": "Messaging is not set up on the server yet.",
    "invalid_number": "The phone number on the record is not usable.",
    "21211": "The phone number is not a valid mobile number.",
    "21408": "SMS to this country is not enabled on the Twilio account.",
    "21608": "Twilio trial accounts can only message verified numbers.",
    "21610": "This patient has opted out (replied STOP).",
    "21614": "This number cannot receive SMS.",
    "63003": "This number is not on WhatsApp.",
    "63007": "The WhatsApp sender number is not set up in Twilio.",
    "63016": "WhatsApp only allows a free-form message within 24 hours of the "
    "patient's last message. An approved template is needed for this message "
    "type (WHATSAPP_TEMPLATE_SIDS).",
    "63018": "Twilio rate limit reached; try again shortly.",
}


def _public_base_url():
    return (os.getenv("PUBLIC_BASE_URL") or "").strip().rstrip("/")


def _template_sids():
    raw = (os.getenv("WHATSAPP_TEMPLATE_SIDS") or "").strip()
    if not raw:
        return {}
    try:
        value = json.loads(raw)
        return value if isinstance(value, dict) else {}
    except ValueError:
        logger.warning("WHATSAPP_TEMPLATE_SIDS is not valid JSON; ignoring it")
        return {}


def render_body(message, link, document_title, channel):
    """Fills {link}; see the module docstring for the rules."""
    if link:
        body = message.replace("{link}", link)
        if channel == "sms" and "{link}" not in message:
            body = f"{body.rstrip()}\n{document_title or 'Document'}: {link}"
        return body.strip()
    lines = [line for line in message.splitlines() if "{link}" not in line]
    return "\n".join(lines).strip()


def _decode_pdf(document):
    """Returns (pdf_bytes, error). Only PDFs: the URL is unauthenticated and
    served with the stored MIME type, so accepting arbitrary uploads would turn
    it into a public file host."""
    raw = document.get("content_base64") or ""
    if "," in raw[:100] and raw.startswith("data:"):
        raw = raw.split(",", 1)[1]
    try:
        content = base64.b64decode(raw, validate=True)
    except (binascii.Error, ValueError):
        return None, "document.content_base64 is not valid base64"
    if not content.startswith(b"%PDF"):
        return None, "document must be a PDF"
    if len(content) > MAX_DOCUMENT_BYTES:
        return None, "document is larger than 5 MB"
    return content, None


def _status_callback_url():
    base = _public_base_url()
    return f"{base}/api/messaging/status-callback" if base else None


def _open_feedback_window(patient_id, phone):
    """A rating request opens a pending patient_feedback row, so the patient's
    WhatsApp reply ("4 nurses were kind") is filed against this visit by
    modules/whatsapp/routes.py:handle_incoming_message."""
    digits = "".join(ch for ch in phone if ch.isdigit())
    with get_connection(autocommit=True) as conn:
        patient = (
            conn.execute(
                "SELECT id FROM patients WHERE patient_id = ?", (patient_id,)
            ).fetchone()
            if patient_id
            else None
        )
        conn.execute(
            "INSERT INTO patient_feedback (patient_id, phone_number, status) VALUES (?, ?, 'Pending')",
            (patient["id"] if patient else None, digits),
        )


@messaging_bp.get("/api/messaging/status")
@require_permissions("patients.read")
def messaging_status():
    """What the send screen tells the desk before anyone presses Send."""
    templates = _template_sids()
    return jsonify(
        {
            "provider": "twilio",
            "sms": {"configured": sms_provider.is_configured()},
            "whatsapp": {
                "configured": whatsapp_provider.is_configured(),
                "templates": sorted(k for k in templates if k in KINDS),
            },
            "document_links": bool(_public_base_url()),
            "delivery_receipts": bool(_public_base_url()),
        }
    )


@messaging_bp.post("/api/messaging/send")
@require_permissions("patients.read")
def send_patient_message():
    """Body:
      phone, patient_name, patient_id (optional), kind, channels: ["sms", "whatsapp"],
      message, document (optional): {title, filename, content_base64}
    Returns one result per channel; HTTP 200 even when a channel failed, since
    a partial send (SMS went, WhatsApp did not) is the normal case to report."""
    data = request.get_json(silent=True) or {}
    phone = str(data.get("phone") or "").strip()
    patient_name = str(data.get("patient_name") or "").strip() or "Patient"
    patient_id = str(data.get("patient_id") or "").strip() or None
    kind = str(data.get("kind") or "custom").strip()
    message = str(data.get("message") or "").strip()
    channels = [c for c in (data.get("channels") or []) if c in CHANNELS]
    document = data.get("document") or None

    if not re.sub(r"\D", "", phone):
        return jsonify({"error": "phone is required"}), 400
    if not message:
        return jsonify({"error": "message is required"}), 400
    if len(message) > MAX_MESSAGE_CHARS:
        return jsonify({"error": f"message is longer than {MAX_MESSAGE_CHARS} characters"}), 400
    if not channels:
        return jsonify({"error": "choose at least one of: sms, whatsapp"}), 400
    if kind not in KINDS:
        return jsonify({"error": f"unknown kind {kind!r}"}), 400

    hospital_id = current_hospital_id()
    created_by = (getattr(g, "current_user", None) or {}).get("username")

    media_token = None
    document_title = None
    if document:
        document_title = str(document.get("title") or "Document").strip()[:200]
        content, error = _decode_pdf(document)
        if error:
            return jsonify({"error": error}), 400
        media_token = store_whatsapp_media(content, mime_type="application/pdf")

    base = _public_base_url()
    link = f"{base}/api/whatsapp/media/{media_token}" if media_token and base else None
    status_callback = _status_callback_url()
    template_sid = _template_sids().get(kind)

    results = []
    for channel in channels:
        body = render_body(message, link, document_title, channel)
        if channel == "sms":
            outcome = sms_provider.deliver_sms(phone, body, status_callback=status_callback)
        else:
            outcome = whatsapp_provider.deliver_whatsapp(
                phone,
                body,
                media_url=link,
                status_callback=status_callback,
                content_sid=template_sid,
                content_variables=(
                    {
                        "1": patient_name,
                        "2": " · ".join(l.strip() for l in body.splitlines() if l.strip())[:900],
                        "3": f"api/whatsapp/media/{media_token}" if media_token else "",
                    }
                    if template_sid
                    else None
                ),
            )

        if outcome["ok"]:
            status = "sent"
        elif outcome.get("error_code") == "not_configured":
            status = "not_configured"
        else:
            status = "failed"

        try:
            message_id = insert_patient_message(
                hospital_id,
                patient_id,
                patient_name,
                outcome.get("to") or phone,
                channel,
                kind,
                body,
                status,
                document_title=document_title,
                media_token=media_token,
                provider_sid=outcome.get("sid"),
                error=outcome.get("error"),
                error_code=outcome.get("error_code"),
                created_by=created_by,
            )
        except Exception:
            # The send already happened (or didn't); losing the log row must not
            # turn a delivered message into an error the desk retries.
            logger.exception("Failed to log patient message")
            message_id = None

        results.append(
            {
                "channel": channel,
                "status": status,
                "id": message_id,
                "provider_sid": outcome.get("sid"),
                "error": outcome.get("error"),
                "error_code": outcome.get("error_code"),
                "hint": ERROR_HINTS.get(outcome.get("error_code") or ""),
                "document_attached": bool(document and link),
                "template": bool(channel == "whatsapp" and template_sid),
            }
        )

    if kind == "feedback_request" and any(
        r["channel"] == "whatsapp" and r["status"] == "sent" for r in results
    ):
        try:
            _open_feedback_window(patient_id, phone)
        except Exception:
            logger.exception("Failed to open feedback window for %s", patient_id)

    return jsonify(
        {
            "results": results,
            "document": {
                "stored": bool(media_token),
                "linked": bool(link),
                "reason": (
                    None
                    if not document or link
                    else "PUBLIC_BASE_URL is not set on the server, so the document could not be attached."
                ),
            },
        }
    )


@messaging_bp.get("/api/messaging/log")
@require_permissions("patients.read")
def messaging_log():
    rows = list_patient_messages(
        current_hospital_id(),
        patient_id=(request.args.get("patient_id") or "").strip() or None,
        limit=request.args.get("limit", 100),
    )
    for row in rows:
        row.pop("media_token", None)
        for key in ("created_at", "updated_at"):
            if row.get(key) is not None and hasattr(row[key], "isoformat"):
                row[key] = row[key].isoformat()
    return jsonify({"messages": rows})


@messaging_bp.post("/api/messaging/status-callback")
def messaging_status_callback():
    """Twilio delivery receipts (sent -> delivered -> read, or failed /
    undelivered). Unauthenticated by necessity; the Twilio signature is the
    authentication."""
    base = _public_base_url()
    url = f"{base}{request.path}" if base else request.url
    if not whatsapp_provider.request_is_from_twilio(
        url, request.form.to_dict(), request.headers.get("X-Twilio-Signature", "")
    ):
        return "Forbidden", 403
    sid = request.form.get("MessageSid")
    status = (request.form.get("MessageStatus") or "").lower()
    if sid and status:
        update_patient_message_delivery(sid, status, request.form.get("ErrorCode") or None)
    return "", 204
