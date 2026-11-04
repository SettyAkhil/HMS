from core.export import generate_pdf, generate_word
from core.storage import ObjectStorage
from flask import Blueprint, jsonify, request, g, send_file
from werkzeug.exceptions import BadRequest
import os
import io
import csv
import uuid
import time
from datetime import datetime
from io import BytesIO

from shared.session_auth import require_permissions
from shared.audit import log_audit_event
from shared.responses import (
    row_to_dict,
    rows_to_dicts,
    validate_required_fields,
)
from shared.hospital import current_hospital_id
from shared.reports import build_reports_export_text

from utils.database import get_reports_overview

reports_bp = Blueprint("reports", __name__)


@reports_bp.get("/api/reports/overview")
@require_permissions("reports.read")
def reports_overview():
    return jsonify(get_reports_overview(hospital_id=current_hospital_id()))


@reports_bp.get("/api/reports/export/csv")
@require_permissions("reports.read")
def reports_export_csv():
    overview = get_reports_overview(hospital_id=current_hospital_id())
    csv_stream = io.StringIO()
    writer = csv.writer(csv_stream)
    writer.writerow(["section", "label", "value"])
    writer.writerow(
        ["billing", "total_billed", overview["billing_summary"]["total_billed"]]
    )
    writer.writerow(
        ["billing", "total_collected", overview["billing_summary"]["total_collected"]]
    )
    writer.writerow(["billing", "total_due", overview["billing_summary"]["total_due"]])
    writer.writerow(
        ["accounts", "net_position", overview["accounts_summary"]["net_position"]]
    )
    writer.writerow(
        [
            "operations",
            "monthly_op",
            overview["hospital_summary"]["ip_op_counts"]["monthly_op"],
        ]
    )
    writer.writerow(
        [
            "operations",
            "monthly_ip",
            overview["hospital_summary"]["ip_op_counts"]["monthly_ip"],
        ]
    )
    writer.writerow(
        ["operations", "average_los_days", overview["alos_summary"]["average_los_days"]]
    )
    for row in overview.get("clinic_income", []):
        writer.writerow(["clinic_income", row["label"], row["count"]])
    for row in overview.get("discount_by_module", []):
        writer.writerow(["discount_by_module", row["label"], row["count"]])
    for row in overview.get("payment_status_breakdown", []):
        writer.writerow(["payment_status", row["label"], row["count"]])

    payload = io.BytesIO(csv_stream.getvalue().encode("utf-8"))
    payload.seek(0)
    return send_file(
        payload,
        mimetype="text/csv",
        as_attachment=True,
        download_name="reports-overview.csv",
    )


@reports_bp.get("/api/reports/export/pdf")
@require_permissions("reports.read")
def reports_export_pdf():
    overview = get_reports_overview(hospital_id=current_hospital_id())
    pdf_bytes = generate_pdf(
        "Hospital Operations",
        "reports_overview",
        build_reports_export_text(overview),
        datetime.now().strftime("%Y-%m-%d %H:%M"),
    )
    return send_file(
        io.BytesIO(pdf_bytes),
        mimetype="application/pdf",
        as_attachment=True,
        download_name="reports-overview.pdf",
    )


@reports_bp.get("/api/reports/export/word")
@require_permissions("reports.read")
def reports_export_word():
    overview = get_reports_overview(hospital_id=current_hospital_id())
    word_bytes = generate_word(
        "Hospital Operations",
        "reports_overview",
        build_reports_export_text(overview),
        datetime.now().strftime("%Y-%m-%d %H:%M"),
    )
    return send_file(
        io.BytesIO(word_bytes),
        mimetype="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        as_attachment=True,
        download_name="reports-overview.docx",
    )
