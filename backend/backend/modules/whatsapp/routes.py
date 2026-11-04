from flask import Blueprint, request, jsonify, current_app, g, send_file
from shared.session_auth import (
    require_permissions,
    require_session,
)
from utils.database import (
    get_connection,
    get_whatsapp_media,
    get_whatsapp_settings,
    save_whatsapp_settings,
)
from core.secrets import encrypt_secret, encryption_configured
from core import whatsapp as twilio_whatsapp
import io
import os
import requests
import json
from datetime import datetime

whatsapp_bp = Blueprint("whatsapp", __name__, url_prefix="/api/whatsapp")

WHATSAPP_VERIFY_TOKEN = os.getenv("WHATSAPP_VERIFY_TOKEN", "hospai_secret_123")
WHATSAPP_ACCESS_TOKEN = os.getenv("WHATSAPP_ACCESS_TOKEN", "")
WHATSAPP_PHONE_ID = os.getenv("WHATSAPP_PHONE_ID", "")


def send_whatsapp_message(to_phone, message_text):
    if not WHATSAPP_ACCESS_TOKEN or not WHATSAPP_PHONE_ID:
        print("WhatsApp API credentials missing. Simulating send to", to_phone)
        return True

    url = f"https://graph.facebook.com/v17.0/{WHATSAPP_PHONE_ID}/messages"
    headers = {
        "Authorization": f"Bearer {WHATSAPP_ACCESS_TOKEN}",
        "Content-Type": "application/json",
    }
    data = {
        "messaging_product": "whatsapp",
        "recipient_type": "individual",
        "to": to_phone,
        "type": "text",
        "text": {"preview_url": False, "body": message_text},
    }
    response = requests.post(url, headers=headers, json=data)
    if response.status_code not in (200, 201):
        print(f"Failed to send WhatsApp message: {response.text}")
        return False
    return True


@whatsapp_bp.route("/webhook", methods=["GET"])
def verify_webhook():
    """Verify webhook challenge from Meta"""
    mode = request.args.get("hub.mode")
    token = request.args.get("hub.verify_token")
    challenge = request.args.get("hub.challenge")

    if mode and token:
        if mode == "subscribe" and token == WHATSAPP_VERIFY_TOKEN:
            return challenge, 200
        else:
            return "Forbidden", 403
    return "OK", 200


@whatsapp_bp.route("/media/<token>", methods=["GET"])
def media(token):
    """Serves a file previously stashed by store_whatsapp_media() so Twilio's
    servers can fetch it as a message attachment. Deliberately unauthenticated
    (no session cookie) -- Twilio can't send one -- security comes from the
    token being an unguessable random UUID, same trust model as the webhook
    routes above. This route was referenced (media_url construction in
    patients/routes.py) but never actually registered, so WhatsApp document
    attachments have been silently failing; this is the fix."""
    # Default one week: long enough for a patient to open the link in an SMS,
    # short enough that a forwarded bill or discharge summary stops resolving.
    ttl_hours = int(os.getenv("PATIENT_DOCUMENT_LINK_TTL_HOURS", "168") or 0)
    content, mime_type = get_whatsapp_media(token, max_age_hours=ttl_hours or None)
    if content is None:
        return jsonify({"error": "Not found"}), 404
    return send_file(
        io.BytesIO(content),
        mimetype=mime_type or "application/octet-stream",
        as_attachment=False,
    )


def _public_request_url():
    """The URL Twilio signed: its view of this route, not the internal one
    behind the gateway (which is http://patients-service:8012/...)."""
    base = (os.getenv("PUBLIC_BASE_URL") or "").strip().rstrip("/")
    if not base:
        return request.url
    query = request.query_string.decode()
    return f"{base}{request.path}" + (f"?{query}" if query else "")


def _twiml_ok():
    return (
        '<?xml version="1.0" encoding="UTF-8"?><Response></Response>',
        200,
        {"Content-Type": "text/xml"},
    )


@whatsapp_bp.route("/webhook", methods=["POST"])
def receive_webhook():
    """Receive messages from WhatsApp.

    Two formats arrive here. Twilio -- the provider every send in this app
    goes through (core/whatsapp.py) -- posts a form with From/Body. Meta's
    Cloud API posts JSON. Only the JSON path used to exist, so a patient's
    reply to a Twilio-sent rating request was never recorded."""
    if request.form.get("From") and "Body" in request.form:
        if not twilio_whatsapp.request_is_from_twilio(
            _public_request_url(),
            request.form.to_dict(),
            request.headers.get("X-Twilio-Signature", ""),
        ):
            return "Forbidden", 403
        sender_phone = "".join(
            ch for ch in request.form.get("From", "") if ch.isdigit()
        )
        text = (request.form.get("Body") or "").strip()
        if sender_phone and text:
            handle_incoming_message(
                sender_phone, text, reply=twilio_whatsapp.send_whatsapp_message
            )
        return _twiml_ok()

    data = request.get_json(silent=True) or {}

    if data.get("object") == "whatsapp_business_account":
        for entry in data.get("entry", []):
            for change in entry.get("changes", []):
                value = change.get("value", {})
                if "messages" in value:
                    for message in value["messages"]:
                        sender_phone = message.get("from")
                        text = message.get("text", {}).get("body", "").strip()
                        if sender_phone and text:
                            handle_incoming_message(sender_phone, text)
        return "OK", 200

    return "Not Found", 404


def handle_incoming_message(phone, text, reply=None):
    """reply sends the thank-you / escalation message back; defaults to the
    Meta Graph sender below, the Twilio webhook passes core.whatsapp's."""
    reply = reply or send_whatsapp_message
    rating, comment = parse_rating_and_comment(text)

    # Matched on the last 10 digits: the feedback window is opened with
    # whatever the patient record holds ("9876543210"), while the reply comes
    # back in international form ("919876543210").
    with get_connection() as conn:
        feedback = conn.execute(
            """
            SELECT * FROM patient_feedback
            WHERE RIGHT(regexp_replace(phone_number, '[^0-9]', '', 'g'), 10) = ?
              AND (rating IS NULL AND comment IS NULL)
            ORDER BY received_at DESC LIMIT 1
        """,
            (phone[-10:],),
        ).fetchone()

    # Determine status and escalation
    status = "New"
    if rating in (1, 2):
        status = "Escalated"
        escalation_msg = get_template(
            "escalation_message",
            "We're sorry your experience didn't meet expectations. A member of our patient care team will follow up with you shortly.",
        )
        reply(phone, escalation_msg)
    else:
        # Standard thank you
        thank_you = get_template(
            "thank_you", "Thank you for your feedback! We appreciate it."
        )
        reply(phone, thank_you)

    if not feedback:
        # Create an orphan feedback or link it dynamically if missing init_feedback
        with get_connection() as conn:
            patient = conn.execute(
                "SELECT id FROM patients WHERE phone = ? OR phone LIKE ? ORDER BY id DESC LIMIT 1",
                (phone, f"%{phone[-10:]}"),
            ).fetchone()

        patient_id = patient["id"] if patient else None

        with get_connection(autocommit=True) as conn:
            conn.execute(
                """
                INSERT INTO patient_feedback (patient_id, phone_number, rating, comment, status)
                VALUES (?, ?, ?, ?, ?)
            """,
                (patient_id, phone, rating, comment if comment else None, status),
            )
        return

    with get_connection(autocommit=True) as conn:
        conn.execute(
            """
            UPDATE patient_feedback 
            SET rating = ?, comment = ?, status = ?, received_at = CURRENT_TIMESTAMP
            WHERE id = ?
        """,
            (rating, comment if comment else None, status, feedback["id"]),
        )


def parse_rating_and_comment(text):
    text_stripped = text.strip()
    if not text_stripped:
        return None, ""

    # Check if the first word is a number or known word
    parts = text_stripped.split(maxsplit=1)
    first_token = parts[0].lower().replace(",", "").replace(".", "")

    rating = None
    if first_token in ["1", "one", "poor"]:
        rating = 1
    elif first_token in ["2", "two", "fair"]:
        rating = 2
    elif first_token in ["3", "three", "good"]:
        rating = 3
    elif first_token in ["4", "four", "very good", "verygood"]:
        rating = 4
    elif first_token in ["5", "five", "excellent"]:
        rating = 5

    # If the first token was a rating, the comment is the rest of the text
    if rating is not None:
        comment = parts[1].strip() if len(parts) > 1 else ""
    else:
        # No valid rating found at the start, treat entire text as comment
        comment = text_stripped

    return rating, comment


def get_template(key, default):
    with get_connection() as conn:
        row = conn.execute(
            "SELECT content FROM whatsapp_templates WHERE template_key = ?", (key,)
        ).fetchone()
    if row:
        return row["content"]
    return default


@whatsapp_bp.route("/init_feedback", methods=["POST"])
@require_session
def init_feedback():
    data = request.json
    patient_id = data.get("patient_id")
    phone = data.get("phone")

    if not patient_id or not phone:
        return jsonify({"error": "Missing patient_id or phone"}), 400

    # Clean phone
    phone = "".join(filter(str.isdigit, phone))

    # Store in database to open feedback window
    with get_connection(autocommit=True) as conn:
        # Resolve patient_id (e.g. PAT-100001) to integer id
        patient = conn.execute(
            "SELECT id FROM patients WHERE patient_id = ?", (patient_id,)
        ).fetchone()
        real_patient_id = patient["id"] if patient else patient_id

        conn.execute(
            """
            INSERT INTO patient_feedback (patient_id, phone_number, status)
            VALUES (?, ?, 'Pending')
        """,
            (real_patient_id, phone),
        )

    return jsonify({"success": True}), 200


@whatsapp_bp.route("/settings", methods=["GET"])
@require_permissions("admin.use")
def get_whatsapp_business_settings():
    """Returns the WhatsApp Business (Twilio) config used for sending
    messages/EMR app-wide. The auth token is never returned, only whether one
    is set, so the settings screen can show "a key is configured" without
    re-exposing the secret."""
    row = get_whatsapp_settings()
    if row and row.get("account_sid"):
        return jsonify(
            {
                "source": "database",
                "account_sid": row.get("account_sid") or "",
                "auth_token_set": bool(row.get("auth_token_encrypted")),
                "whatsapp_from": row.get("whatsapp_from") or "",
                "default_country_code": row.get("default_country_code") or "+91",
                "updated_by": row.get("updated_by"),
                "updated_at": (
                    row["updated_at"].isoformat()
                    if row.get("updated_at") and hasattr(row["updated_at"], "isoformat")
                    else row.get("updated_at")
                ),
                "encryption_configured": encryption_configured(),
            }
        )
    env_configured = bool(
        os.getenv("TWILIO_ACCOUNT_SID")
        and os.getenv("TWILIO_AUTH_TOKEN")
        and os.getenv("TWILIO_WHATSAPP_FROM")
    )
    return jsonify(
        {
            "source": "environment" if env_configured else "none",
            "account_sid": os.getenv("TWILIO_ACCOUNT_SID", "") if env_configured else "",
            "auth_token_set": bool(os.getenv("TWILIO_AUTH_TOKEN")),
            "whatsapp_from": os.getenv("TWILIO_WHATSAPP_FROM", ""),
            "default_country_code": os.getenv("WHATSAPP_DEFAULT_COUNTRY_CODE", "+91"),
            "updated_by": None,
            "updated_at": None,
            "encryption_configured": encryption_configured(),
        }
    )


@whatsapp_bp.route("/settings", methods=["PUT"])
@require_permissions("admin.use")
def update_whatsapp_business_settings():
    """Saves the platform-wide WhatsApp Business (Twilio) credentials. Once
    saved here, this DB row takes priority over TWILIO_* env vars for every
    WhatsApp send in the app (see core/whatsapp.py) -- no redeploy needed."""
    if not encryption_configured():
        return (
            jsonify(
                {
                    "error": (
                        "SETTINGS_ENCRYPTION_KEY is not set on the server. "
                        "Ask whoever manages the deployment to set it before "
                        "storing this key, so it's encrypted at rest."
                    )
                }
            ),
            500,
        )

    data = request.json or {}
    account_sid = (data.get("account_sid") or "").strip()
    auth_token = (data.get("auth_token") or "").strip()
    whatsapp_from = (data.get("whatsapp_from") or "").strip()
    default_country_code = (data.get("default_country_code") or "+91").strip()

    if not account_sid or not whatsapp_from:
        return jsonify({"error": "account_sid and whatsapp_from are required"}), 400

    existing = get_whatsapp_settings()
    if auth_token:
        auth_token_encrypted = encrypt_secret(auth_token)
    elif existing and existing.get("auth_token_encrypted"):
        # Blank auth_token means "keep the one already saved" -- the settings
        # screen never gets the real token back to resubmit, so this is the
        # only way to update the other fields without re-entering it.
        auth_token_encrypted = existing["auth_token_encrypted"]
    else:
        return jsonify({"error": "auth_token is required"}), 400

    save_whatsapp_settings(
        account_sid,
        auth_token_encrypted,
        whatsapp_from,
        default_country_code,
        g.current_user.get("username"),
    )
    return jsonify({"success": True}), 200


@whatsapp_bp.route("/templates", methods=["GET"])
@require_permissions("patient_experience.read")
def list_templates():
    with get_connection() as conn:
        rows = conn.execute(
            "SELECT * FROM whatsapp_templates ORDER BY id ASC"
        ).fetchall()
    return jsonify({"templates": [dict(r) for r in rows]})


@whatsapp_bp.route("/templates", methods=["PUT"])
@require_permissions("patient_experience.write")
def update_template():
    data = request.json
    key = data.get("template_key")
    content = data.get("content")

    if not key or not content:
        return jsonify({"error": "Missing template_key or content"}), 400

    with get_connection(autocommit=True) as conn:
        conn.execute(
            """
            INSERT INTO whatsapp_templates (template_key, content)
            VALUES (?, ?)
            ON CONFLICT(template_key) DO UPDATE SET content = excluded.content, updated_at = CURRENT_TIMESTAMP
        """,
            (key, content),
        )

    return jsonify({"success": True}), 200


@whatsapp_bp.route("/feedback", methods=["GET"])
@require_permissions("patient_experience.read")
def list_feedback():
    with get_connection() as conn:
        rows = conn.execute("""
            SELECT f.*, p.name as patient_name 
            FROM patient_feedback f
            LEFT JOIN patients p ON f.patient_id = p.id
            WHERE f.rating IS NOT NULL OR f.comment IS NOT NULL
            ORDER BY f.received_at DESC
        """).fetchall()
    return jsonify({"feedback": [dict(r) for r in rows]}), 200


@whatsapp_bp.route("/feedback", methods=["POST"])
@require_session
def add_manual_feedback():
    data = request.json
    patient_id = data.get("patient_id")
    phone = data.get("phone", "")
    comment = data.get("comment", "")

    if not comment:
        return jsonify({"error": "Comment is required"}), 400

    with get_connection(autocommit=True) as conn:
        # Try to resolve patient_id string to integer if provided
        real_patient_id = None
        if patient_id:
            patient = conn.execute(
                "SELECT id FROM patients WHERE patient_id = %s", (patient_id,)
            ).fetchone()
            real_patient_id = patient["id"] if patient else None

        conn.execute(
            """
            INSERT INTO patient_feedback (patient_id, phone_number, comment, status, received_at)
            VALUES (%s, %s, %s, 'New', CURRENT_TIMESTAMP)
        """,
            (real_patient_id, phone, comment),
        )

    return jsonify({"success": True}), 201


@whatsapp_bp.route("/feedback/<int:feedback_id>/status", methods=["PUT"])
@require_permissions("patient_experience.write")
def update_feedback_status(feedback_id):
    status = request.json.get("status")
    if not status:
        return jsonify({"error": "Missing status"}), 400

    with get_connection(autocommit=True) as conn:
        conn.execute(
            "UPDATE patient_feedback SET status = ? WHERE id = ?", (status, feedback_id)
        )
    return jsonify({"success": True}), 200


@whatsapp_bp.route("/feedback/summary", methods=["GET"])
@require_permissions("patient_experience.read")
def feedback_summary():
    with get_connection() as conn:
        total = conn.execute(
            "SELECT COUNT(*) as c FROM patient_feedback WHERE rating IS NOT NULL OR comment IS NOT NULL"
        ).fetchone()["c"]
        avg_rating = conn.execute(
            "SELECT AVG(rating) as avg_r FROM patient_feedback WHERE rating IS NOT NULL"
        ).fetchone()["avg_r"]
        unresolved_low = conn.execute(
            "SELECT COUNT(*) as c FROM patient_feedback WHERE rating IN (1, 2) AND status = 'Escalated'"
        ).fetchone()["c"]

    return (
        jsonify(
            {
                "total_responses": total or 0,
                "average_rating": float(avg_rating) if avg_rating else 0.0,
                "unresolved_low_rated": unresolved_low or 0,
            }
        ),
        200,
    )
