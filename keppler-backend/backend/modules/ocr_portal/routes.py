import json

from flask import Blueprint, g, jsonify, request, Response
from werkzeug.utils import secure_filename

from shared.session_auth import require_permissions
from shared.hospital import current_hospital_id
from shared.audit import log_audit_event

from ai.local_ocr_portal import OcrPortalError
from ai import local_ocr_portal as ocr

ocr_portal_bp = Blueprint("ocr_portal", __name__)

MAX_UPLOAD_BYTES = 50 * 1024 * 1024  # 50MB -- these are scanned multi-page medical PDFs


@ocr_portal_bp.errorhandler(OcrPortalError)
def _handle_ocr_portal_error(exc: OcrPortalError):
    return jsonify({"error": exc.message}), exc.status_code


def _identity():
    return current_hospital_id(), g.current_user.get("username")


# ---- OCR: upload / job status / result / export ----------------------------


@ocr_portal_bp.get("/api/ocr-portal/blueprints")
@require_permissions("patients.documents.write")
def ocr_portal_blueprints():
    hospital_id, username = _identity()
    return jsonify({"blueprints": ocr.list_ocr_blueprints(hospital_id, username)})


@ocr_portal_bp.post("/api/ocr-portal/upload")
@require_permissions("patients.documents.write")
def ocr_portal_upload():
    if "file" not in request.files:
        return jsonify({"error": "Missing file"}), 400
    uploaded_file = request.files["file"]
    filename = secure_filename(uploaded_file.filename or "") or "document"
    file_bytes = uploaded_file.read()
    if not file_bytes:
        return jsonify({"error": "Uploaded file is empty."}), 400
    if len(file_bytes) > MAX_UPLOAD_BYTES:
        return jsonify({"error": "File is too large (50MB limit)."}), 400

    blueprint = request.form.get("blueprint", "Universal OCR (Any Text)")
    hospital_id, username = _identity()
    result = ocr.upload_ocr_document(
        hospital_id, username, filename, file_bytes, uploaded_file.mimetype, blueprint
    )
    log_audit_event(
        "create", "ocr_portal_jobs", result.get("job_id"), {"filename": filename}
    )
    return jsonify(result)


@ocr_portal_bp.get("/api/ocr-portal/jobs/<job_id>")
@require_permissions("patients.documents.write")
def ocr_portal_job_status(job_id):
    hospital_id, username = _identity()
    return jsonify(ocr.get_ocr_job(hospital_id, username, job_id))


@ocr_portal_bp.get("/api/ocr-portal/jobs/<job_id>/result")
@require_permissions("patients.documents.write")
def ocr_portal_job_result(job_id):
    hospital_id, username = _identity()
    return jsonify(ocr.get_ocr_job_result(hospital_id, username, job_id))


@ocr_portal_bp.get("/api/ocr-portal/jobs/<job_id>/export")
@require_permissions("patients.documents.write")
def ocr_portal_job_export(job_id):
    fmt = request.args.get("format", "md")
    hospital_id, username = _identity()
    content, content_type = ocr.export_ocr_job(hospital_id, username, job_id, fmt)
    return Response(
        content,
        mimetype=content_type,
        headers={"Content-Disposition": f'attachment; filename="{job_id}.{fmt}"'},
    )


# ---- Vault -------------------------------------------------------------------


@ocr_portal_bp.get("/api/ocr-portal/vault")
@require_permissions("patients.documents.write")
def ocr_portal_vault_list():
    hospital_id, username = _identity()
    return jsonify(ocr.list_vault_documents(hospital_id, username))


@ocr_portal_bp.get("/api/ocr-portal/vault/<int:doc_id>")
@require_permissions("patients.documents.write")
def ocr_portal_vault_detail(doc_id):
    hospital_id, username = _identity()
    return jsonify(ocr.get_vault_document(hospital_id, username, doc_id))


@ocr_portal_bp.delete("/api/ocr-portal/vault/<int:doc_id>")
@require_permissions("patients.documents.write")
def ocr_portal_vault_delete(doc_id):
    hospital_id, username = _identity()
    ocr.delete_vault_document(hospital_id, username, doc_id)
    log_audit_event("delete", "ocr_portal_vault", str(doc_id))
    return jsonify({"message": "Document deleted."})


@ocr_portal_bp.get("/api/ocr-portal/vault/<int:doc_id>/export/<fmt>")
@require_permissions("patients.documents.write")
def ocr_portal_vault_export(doc_id, fmt):
    hospital_id, username = _identity()
    content, content_type = ocr.export_vault_document(
        hospital_id, username, doc_id, fmt
    )
    return Response(
        content,
        mimetype=content_type,
        headers={
            "Content-Disposition": f'attachment; filename="document-{doc_id}.{fmt}"'
        },
    )


# ---- Assistant (RAG chat) -----------------------------------------------------


@ocr_portal_bp.post("/api/ocr-portal/assistant/ingest")
@require_permissions("patients.documents.write")
def ocr_portal_assistant_ingest():
    doc_ids = (request.get_json(silent=True) or {}).get("doc_ids", [])
    hospital_id, username = _identity()
    return jsonify(ocr.ingest_vault_docs(hospital_id, username, doc_ids))


@ocr_portal_bp.get("/api/ocr-portal/assistant/kb")
@require_permissions("patients.documents.write")
def ocr_portal_assistant_kb():
    hospital_id, username = _identity()
    return jsonify(ocr.list_kb_documents(hospital_id, username))


@ocr_portal_bp.delete("/api/ocr-portal/assistant/kb/<int:doc_id>")
@require_permissions("patients.documents.write")
def ocr_portal_assistant_kb_delete(doc_id):
    hospital_id, username = _identity()
    ocr.remove_kb_document(hospital_id, username, doc_id)
    return jsonify({"message": "Removed from knowledge base."})


@ocr_portal_bp.post("/api/ocr-portal/assistant/chat")
@require_permissions("patients.documents.write")
def ocr_portal_assistant_chat():
    payload = request.get_json(silent=True) or {}
    message = (payload.get("message") or "").strip()
    if not message:
        return jsonify({"error": "Message is required."}), 400
    session_id = payload.get("session_id", "default")
    doc_ids = payload.get("doc_ids")
    hospital_id, username = _identity()
    return jsonify(
        ocr.send_chat_message(hospital_id, username, message, session_id, doc_ids)
    )


@ocr_portal_bp.get("/api/ocr-portal/assistant/history")
@require_permissions("patients.documents.write")
def ocr_portal_assistant_history():
    session_id = request.args.get("session_id", "default")
    hospital_id, username = _identity()
    return jsonify(ocr.get_chat_history(hospital_id, username, session_id))


@ocr_portal_bp.delete("/api/ocr-portal/assistant/history")
@require_permissions("patients.documents.write")
def ocr_portal_assistant_history_clear():
    session_id = request.args.get("session_id", "default")
    hospital_id, username = _identity()
    ocr.clear_chat_history(hospital_id, username, session_id)
    return jsonify({"message": "Chat history cleared."})


# ---- AI Parser for Prescriptions ----

_PRESCRIPTION_PARSE_PROMPT = """You are a medical AI assistant. Extract the prescribed medicines from the following OCR text of a doctor's prescription.
Return ONLY a JSON array of objects, with each object containing:
- "name": Medicine name
- "quantity": Number to dispense (default to 1 if not specified but implies a course)
- "dosage": E.g., "1-0-1" or "500mg twice daily"
- "unit_price": 0

OCR Text:
{text}

Output ONLY valid JSON.
"""


@ocr_portal_bp.post("/api/ocr-portal/parse-prescription")
@require_permissions("patients.documents.write")
def parse_prescription():
    payload = request.get_json(silent=True) or {}
    text = payload.get("text", "")
    if not text:
        return jsonify({"error": "No text provided"}), 400

    try:
        response_text = ocr.llm_provider.generate(
            _PRESCRIPTION_PARSE_PROMPT.format(text=text), json_mode=True
        )
        parsed = json.loads((response_text or "").strip())

        medicines_list = []
        if isinstance(parsed, list):
            medicines_list = parsed
        elif isinstance(parsed, dict):
            # Sometimes models wrap the array in an object, e.g. {"medicines": [...]}
            for val in parsed.values():
                if isinstance(val, list):
                    medicines_list = val
                    break
            if not medicines_list and "medicines" in parsed:
                medicines_list = parsed["medicines"]

        return jsonify({"medicines": medicines_list})
    except Exception as exc:
        return jsonify({"error": str(exc), "medicines": []}), 500
