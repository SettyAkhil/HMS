"""Real audit trail read API -- the write side (log_audit_event, called from
~74% of this backend's write routes) has existed for a while; this was the
missing read side, previously living oddly under modules/hr/routes.py."""
from flask import Blueprint, request, jsonify

from shared.session_auth import require_permissions
from shared.responses import rows_to_dicts
from shared.hospital import current_hospital_id
from utils.database import get_audit_logs

audit_bp = Blueprint("audit", __name__)


@audit_bp.get("/api/audit/logs")
@require_permissions("audit.read")
def audit_logs_list():
    module_name = request.args.get("module")
    limit = request.args.get("limit", default=100, type=int)
    offset = request.args.get("offset", default=0, type=int)
    rows, total = get_audit_logs(
        module_name=module_name,
        limit=limit,
        offset=offset,
        hospital_id=current_hospital_id(),
    )
    return jsonify({"logs": rows_to_dicts(rows), "total": total, "offset": offset})
