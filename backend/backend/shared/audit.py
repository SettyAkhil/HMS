import json

from flask import g, request

from utils.database import add_audit_log
from shared.hospital import current_hospital_id


def log_audit_event(action, module_name, entity_key=None, payload=None):
    actor = (getattr(g, "current_user", None) or {}).get("username")
    serialized_payload = None
    if payload is not None:
        try:
            serialized_payload = json.dumps(payload, separators=(",", ":"), default=str)
        except Exception:
            serialized_payload = str(payload)
    try:
        hospital_id = current_hospital_id()
    except Exception:
        # Routes that call this before a request context has a current_user
        # (rare -- most callers are already behind @require_permissions)
        # must never fail the underlying action just because audit logging
        # couldn't resolve a tenant.
        hospital_id = None
    add_audit_log(
        {
            "actor_username": actor,
            "action": action,
            "module_name": module_name,
            "entity_key": entity_key,
            "payload": serialized_payload,
            "ip_address": request.headers.get("X-Forwarded-For", request.remote_addr),
            "hospital_id": hospital_id,
        }
    )
