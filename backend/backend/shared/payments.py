import base64
import hashlib
import hmac
import json
import os
from urllib import error as urllib_error
from urllib import request as urllib_request

from flask import jsonify

RAZORPAY_KEY_ID = (os.getenv("RAZORPAY_KEY_ID") or "").strip()
RAZORPAY_KEY_SECRET = (os.getenv("RAZORPAY_KEY_SECRET") or "").strip()
RAZORPAY_API_BASE = "https://api.razorpay.com/v1"


def is_razorpay_configured():
    return bool(RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET)


def require_razorpay_configured():
    if is_razorpay_configured():
        return None
    return (
        jsonify(
            {
                "error": "Razorpay is not configured. Set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET."
            }
        ),
        503,
    )


def to_amount_paise(value):
    try:
        amount = float(value)
    except (TypeError, ValueError):
        return None
    if amount <= 0:
        return None
    return int(round(amount * 100))


def _razorpay_auth_header():
    encoded = base64.b64encode(
        f"{RAZORPAY_KEY_ID}:{RAZORPAY_KEY_SECRET}".encode("utf-8")
    ).decode("ascii")
    return f"Basic {encoded}"


def create_razorpay_order(amount_paise, currency="INR", receipt=None, notes=None):
    payload = {
        "amount": int(amount_paise),
        "currency": currency or "INR",
    }
    if receipt:
        payload["receipt"] = str(receipt)
    if isinstance(notes, dict) and notes:
        payload["notes"] = notes

    req = urllib_request.Request(
        f"{RAZORPAY_API_BASE}/orders",
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Authorization": _razorpay_auth_header(),
            "Content-Type": "application/json",
        },
        method="POST",
    )
    try:
        with urllib_request.urlopen(req, timeout=20) as response:
            return json.loads(response.read().decode("utf-8"))
    except urllib_error.HTTPError as exc:
        body = exc.read().decode("utf-8", errors="ignore")
        try:
            payload = json.loads(body)
        except json.JSONDecodeError:
            payload = {}
        message = (
            payload.get("error", {}).get("description")
            or payload.get("error", {}).get("code")
            or body
            or "Razorpay order creation failed."
        )
        raise RuntimeError(message) from exc
    except Exception as exc:
        raise RuntimeError("Unable to reach Razorpay.") from exc


def verify_razorpay_signature(order_id, payment_id, signature):
    # An empty secret would make the expected HMAC computable by anyone.
    if not RAZORPAY_KEY_SECRET:
        return False
    signed_payload = f"{order_id}|{payment_id}".encode("utf-8")
    expected = hmac.new(
        RAZORPAY_KEY_SECRET.encode("utf-8"),
        signed_payload,
        hashlib.sha256,
    ).hexdigest()
    return hmac.compare_digest(expected, str(signature or ""))


def normalize_payment_mode(value):
    allowed_modes = {"cash", "card", "upi", "bank"}
    mode = (value or "").strip().lower()
    return mode if mode in allowed_modes else "upi"
