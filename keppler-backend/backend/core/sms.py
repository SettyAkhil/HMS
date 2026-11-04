"""Twilio SMS messaging helpers.

Mirrors core/whatsapp.py exactly, minus the "whatsapp:" prefix -- same Twilio
account (account_sid/auth_token resolved the same way, via whatsapp_settings
then env vars), just a different "from" number and no 24-hour-session/template
restriction (that's a WhatsApp Business API rule, not an SMS one).

Best-effort integration: send_sms_message swallows and logs its own errors so
a failed/unconfigured send never breaks the request that triggered it.

Credentials:
  1. The whatsapp_settings DB table (account_sid/auth_token only -- same
     Twilio account as WhatsApp, set via Settings -> WhatsApp Business API).
  2. Env vars as a server-level fallback:
       TWILIO_ACCOUNT_SID
       TWILIO_AUTH_TOKEN
       TWILIO_SMS_FROM               e.g. +14155550100
       SMS_DEFAULT_COUNTRY_CODE      optional, defaults to +91
       TWILIO_MESSAGING_SERVICE_SID  optional; sends through a Messaging
                                     Service instead of TWILIO_SMS_FROM. This
                                     is how an Indian DLT-registered sender ID
                                     is used -- India rejects SMS from an
                                     unregistered number, and the message text
                                     must match a DLT-approved template.
TWILIO_SMS_FROM is env-only for now -- there's no Settings UI field for it yet
(the whatsapp_settings table/screen is WhatsApp-specific); add one later if an
admin needs to change it without a redeploy.
"""

import logging
import os
import re

logger = logging.getLogger(__name__)


def _resolve_credentials():
    """Returns (account_sid, auth_token, sms_from, default_country_code)."""
    try:
        from utils.database import get_whatsapp_settings
        from core.secrets import decrypt_secret

        row = get_whatsapp_settings()
    except Exception:
        row = None
        logger.exception("Failed to read whatsapp_settings; falling back to env vars")

    if row and row.get("account_sid") and row.get("auth_token_encrypted"):
        try:
            auth_token = decrypt_secret(row["auth_token_encrypted"])
        except Exception:
            logger.exception(
                "Stored WhatsApp auth token could not be decrypted; falling back to env vars"
            )
        else:
            return (
                row["account_sid"],
                auth_token,
                os.getenv("TWILIO_SMS_FROM"),
                row.get("default_country_code")
                or os.getenv("SMS_DEFAULT_COUNTRY_CODE", "+91"),
            )

    return (
        os.getenv("TWILIO_ACCOUNT_SID"),
        os.getenv("TWILIO_AUTH_TOKEN"),
        os.getenv("TWILIO_SMS_FROM"),
        os.getenv("SMS_DEFAULT_COUNTRY_CODE", "+91"),
    )


def is_configured() -> bool:
    account_sid, auth_token, sms_from, _country = _resolve_credentials()
    return bool(
        account_sid
        and auth_token
        and (sms_from or os.getenv("TWILIO_MESSAGING_SERVICE_SID"))
    )


def _normalize_number(raw_phone: str, default_country_code: str = "+91"):
    if not raw_phone:
        return None
    digits = re.sub(r"[^\d+]", "", raw_phone)
    if not digits:
        return None
    if digits.startswith("+"):
        return digits
    if len(digits) == 10:
        return f"{default_country_code}{digits}"
    return f"+{digits}"


def deliver_sms(to_phone: str, body: str, status_callback: str = None) -> dict:
    """Send a plain SMS and report what happened -- same result shape as
    core.whatsapp.deliver_whatsapp: {"ok", "sid", "to", "error", "error_code"}."""
    result = {"ok": False, "sid": None, "to": None, "error": None, "error_code": None}
    account_sid, auth_token, from_number, default_country_code = _resolve_credentials()
    messaging_service_sid = os.getenv("TWILIO_MESSAGING_SERVICE_SID")
    if not account_sid or not auth_token or not (from_number or messaging_service_sid):
        result["error"] = "SMS is not configured (Twilio account SID, auth token and TWILIO_SMS_FROM or TWILIO_MESSAGING_SERVICE_SID are required)."
        result["error_code"] = "not_configured"
        logger.info("SMS not configured; skipping send.")
        return result

    normalized_to = _normalize_number(to_phone, default_country_code)
    if not normalized_to:
        result["error"] = "No usable phone number."
        result["error_code"] = "invalid_number"
        logger.warning("No usable phone number for SMS message; skipping send.")
        return result
    result["to"] = normalized_to

    try:
        from twilio.rest import Client

        client = Client(account_sid, auth_token)
        kwargs = {"to": normalized_to, "body": body}
        if messaging_service_sid:
            kwargs["messaging_service_sid"] = messaging_service_sid
        else:
            kwargs["from_"] = from_number
        if status_callback:
            kwargs["status_callback"] = status_callback
        message = client.messages.create(**kwargs)
        result["ok"] = True
        result["sid"] = getattr(message, "sid", None)
    except Exception as exc:
        code = getattr(exc, "code", None)
        result["error_code"] = str(code) if code else None
        result["error"] = getattr(exc, "msg", None) or str(exc) or exc.__class__.__name__
        logger.exception("Failed to send SMS message to %s", to_phone)
    return result


def send_sms_message(to_phone: str, body: str) -> bool:
    """Send a plain SMS; returns True only on a confirmed Twilio accept."""
    return deliver_sms(to_phone, body)["ok"]
