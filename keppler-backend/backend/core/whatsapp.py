"""Twilio WhatsApp messaging helpers.

Best-effort integration: every public function here swallows and logs its own
errors so a failed/unconfigured WhatsApp send never breaks the request that
triggered it (an appointment status update, a prescription save, etc).

Credentials come from either of two places, checked in this order:
  1. The whatsapp_settings DB table -- set by a platform admin through
     Settings (Settings.tsx), applies instantly, no redeploy needed.
  2. Env vars, as a server-level fallback (see .env.example):
       TWILIO_ACCOUNT_SID
       TWILIO_AUTH_TOKEN
       TWILIO_WHATSAPP_FROM        e.g. +14155238886 (no "whatsapp:" prefix)
       WHATSAPP_DEFAULT_COUNTRY_CODE  optional, defaults to +91
PUBLIC_BASE_URL (publicly reachable HTTPS origin of this backend) is still
env-only, required only for messages that attach a PDF (Twilio's servers
fetch media over the open internet, so this can't be localhost).

Note: WhatsApp Business API only allows freeform, business-initiated
messages within an active 24-hour customer service session. Outside that
window (the common case for "doctor is ready for you" / "here is your
prescription" notifications), Twilio requires the message to use a
pre-approved Content Template rather than a raw body string. Get templates
approved in the Twilio console before relying on this in production; until
then, sends outside a session window will fail and are logged, not raised.
"""

import logging
import os
import re

logger = logging.getLogger(__name__)


def _resolve_credentials():
    """Returns (account_sid, auth_token, whatsapp_from, default_country_code).
    Re-reads the DB on every call rather than caching -- WhatsApp sends are
    low-frequency (one per appointment/prescription/etc), so the extra query
    is cheap, and it means an admin's settings update takes effect on the
    very next send with no cache to invalidate."""
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
                row.get("whatsapp_from") or os.getenv("TWILIO_WHATSAPP_FROM"),
                row.get("default_country_code")
                or os.getenv("WHATSAPP_DEFAULT_COUNTRY_CODE", "+91"),
            )

    return (
        os.getenv("TWILIO_ACCOUNT_SID"),
        os.getenv("TWILIO_AUTH_TOKEN"),
        os.getenv("TWILIO_WHATSAPP_FROM"),
        os.getenv("WHATSAPP_DEFAULT_COUNTRY_CODE", "+91"),
    )


def is_configured() -> bool:
    account_sid, auth_token, whatsapp_from, _country = _resolve_credentials()
    return bool(account_sid and auth_token and whatsapp_from)


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


def _twilio_error(exc):
    """(error_code, message) from a Twilio exception, or a generic pair for
    anything else (network errors, a bad SDK install)."""
    code = getattr(exc, "code", None)
    message = getattr(exc, "msg", None) or str(exc) or exc.__class__.__name__
    return (str(code) if code else None), message


def deliver_whatsapp(
    to_phone: str,
    body: str,
    media_url: str = None,
    status_callback: str = None,
    content_sid: str = None,
    content_variables: dict = None,
) -> dict:
    """Send a WhatsApp message and report what happened.

    Same send as send_whatsapp_message, but returns
    {"ok", "sid", "to", "error", "error_code"} instead of a bool, so a caller
    that shows the outcome to staff (modules/messaging) can say *why* a message
    did not go -- "outside the 24-hour window" and "not configured" call for
    very different next steps. error_code is Twilio's numeric code as a string,
    or "not_configured" / "invalid_number" for failures caught before Twilio.

    content_sid switches to a pre-approved Content Template (required for
    business-initiated messages outside a 24-hour session); body is then
    ignored by Twilio and content_variables fills the template."""
    result = {"ok": False, "sid": None, "to": None, "error": None, "error_code": None}
    account_sid, auth_token, from_number, default_country_code = _resolve_credentials()
    if not account_sid or not auth_token or not from_number:
        result["error"] = "WhatsApp is not configured (Twilio account SID, auth token and WhatsApp sender are all required)."
        result["error_code"] = "not_configured"
        logger.info("WhatsApp not configured; skipping send.")
        return result

    normalized_to = _normalize_number(to_phone, default_country_code)
    if not normalized_to:
        result["error"] = "No usable phone number."
        result["error_code"] = "invalid_number"
        logger.warning("No usable phone number for WhatsApp message; skipping send.")
        return result
    result["to"] = normalized_to

    try:
        from twilio.rest import Client

        client = Client(account_sid, auth_token)
        kwargs = {
            "from_": f"whatsapp:{from_number}",
            "to": f"whatsapp:{normalized_to}",
        }
        if content_sid:
            import json

            kwargs["content_sid"] = content_sid
            kwargs["content_variables"] = json.dumps(content_variables or {})
        else:
            kwargs["body"] = body
            if media_url:
                kwargs["media_url"] = [media_url]
        if status_callback:
            kwargs["status_callback"] = status_callback
        message = client.messages.create(**kwargs)
        result["ok"] = True
        result["sid"] = getattr(message, "sid", None)
    except Exception as exc:
        result["error_code"], result["error"] = _twilio_error(exc)
        logger.exception("Failed to send WhatsApp message to %s", to_phone)
    return result


def send_whatsapp_message(to_phone: str, body: str, media_url: str = None) -> bool:
    """Send a WhatsApp message; returns True only on a confirmed Twilio accept."""
    return deliver_whatsapp(to_phone, body, media_url=media_url)["ok"]


def request_is_from_twilio(url: str, params: dict, signature: str) -> bool:
    """Validates X-Twilio-Signature on an inbound webhook (delivery status
    callbacks, patient replies). Those routes cannot carry a session cookie,
    so the signature -- an HMAC over the URL and form body keyed by the auth
    token -- is the only proof the request came from Twilio rather than from
    anyone who learned the URL."""
    _account_sid, auth_token, _from, _country = _resolve_credentials()
    if not auth_token or not signature:
        return False
    try:
        from twilio.request_validator import RequestValidator

        return RequestValidator(auth_token).validate(url, params, signature)
    except Exception:
        logger.exception("Could not validate Twilio signature")
        return False
