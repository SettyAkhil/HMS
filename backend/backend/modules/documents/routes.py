from ai.service import extract_text_from_image, classify_and_extract_entities
from shared.uploads import STORAGE
from core.export import generate_pdf, generate_word
from core.storage import ObjectStorage
from flask import Blueprint, jsonify, request, g, send_file
from werkzeug.exceptions import BadRequest
import os
import io
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

from utils.database import (
    delete_certificate,
    delete_document,
    get_document,
    update_document_ocr,
)

documents_bp = Blueprint("documents", __name__)


@documents_bp.get("/api/documents/<int:document_id>/file")
@require_permissions("patients.read")
def document_file(document_id):
    document = get_document(document_id, hospital_id=current_hospital_id())
    if not document:
        return jsonify({"error": "Document not found"}), 404

    mime_type = document["mime_type"] or "application/octet-stream"
    file_name = (
        document["file_name"]
        or os.path.basename(document["file_path"] or "")
        or "document.bin"
    )

    file_data = document["file_data"]
    if file_data:
        return send_file(
            io.BytesIO(file_data),
            mimetype=mime_type,
            as_attachment=False,
            download_name=file_name,
        )

    file_path = document["file_path"]
    file_bytes = STORAGE.read(file_path)
    if file_bytes:
        return send_file(
            io.BytesIO(file_bytes),
            mimetype=mime_type,
            as_attachment=False,
            download_name=file_name,
        )

    return jsonify({"error": "Document file content unavailable"}), 404


@documents_bp.delete("/api/documents/<int:document_id>")
@require_permissions("patients.documents.write")
def document_delete(document_id):
    hospital_id = current_hospital_id()
    document = get_document(document_id, hospital_id=hospital_id)
    if not document:
        return jsonify({"error": "Document not found"}), 404

    deleted = delete_document(
        document_id, hospital_id=hospital_id, actor=g.current_user.get("username")
    )
    if not deleted:
        return jsonify({"error": "Document not found"}), 404

    STORAGE.delete(document["file_path"])

    return jsonify({"status": "ok"})


@documents_bp.post("/api/documents/<int:document_id>/ocr")
@require_permissions("patients.documents.write")
def document_process_ocr(document_id):
    hospital_id = current_hospital_id()
    document = get_document(document_id, hospital_id=hospital_id)
    if not document:
        return jsonify({"error": "Document not found"}), 404

    payload = request.get_json(silent=True)
    payload = payload if isinstance(payload, dict) else {}
    requested_language = payload.get("language") or document["ocr_language"] or "en"
    file_name = (
        document["file_name"]
        or os.path.basename(document["file_path"] or "")
        or "document"
    )

    file_bytes = document["file_data"]
    if not file_bytes:
        file_path = document["file_path"]
        if not file_path:
            return jsonify({"error": "Document file content unavailable"}), 404
        file_bytes = STORAGE.read(file_path)
        if not file_bytes:
            return jsonify({"error": "Document file content unavailable"}), 404

    ocr_text = extract_text_from_image(
        file_bytes, requested_language, document["doc_type"], filename=file_name
    )
    if isinstance(ocr_text, str) and ocr_text.startswith("OCR Error:"):
        return jsonify({"error": ocr_text}), 400

    structured_data = None
    try:
        structured_data = classify_and_extract_entities(ocr_text, document["doc_type"])
    except Exception:
        # Structured extraction is best-effort enrichment; OCR persistence must not fail if it errors.
        pass

    updated = update_document_ocr(
        document_id,
        ocr_text,
        requested_language,
        hospital_id=hospital_id,
        structured_data=structured_data,
    )
    if not updated:
        return jsonify({"error": "Document not found"}), 404

    return jsonify(
        {
            "document_id": document_id,
            "ocr_text": ocr_text,
            "ocr_language": requested_language,
            "structured_data": structured_data,
            "updated": True,
        }
    )


@documents_bp.delete("/api/certificates/<int:certificate_id>")
@require_permissions("patients.clinical.write")
def patient_certificates_delete(certificate_id):
    deleted = delete_certificate(certificate_id, actor=g.current_user.get("username"))
    if not deleted:
        return jsonify({"error": "Certificate not found"}), 404
    log_audit_event(
        "delete",
        "certificates",
        str(certificate_id),
        {"certificate_id": certificate_id},
    )
    return jsonify({"status": "ok"})
