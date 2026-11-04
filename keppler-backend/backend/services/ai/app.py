"""ai-service: in-repo Symptom AI / OCR portal / AI-assisted exports.

Distinct from the separate, already-existing AI/document backend at
localhost:8000 (SmartOCR/SymptomAI/ClinicalSummaries frontend components) --
that service is untouched and gets its own gateway route, not merged here.
"""
import os
import sys

_HERE = os.path.dirname(os.path.abspath(__file__))
_BACKEND_ROOT = os.path.dirname(os.path.dirname(_HERE))
if _BACKEND_ROOT not in sys.path:
    sys.path.insert(0, _BACKEND_ROOT)

from shared.app_factory import create_service_app

app = create_service_app(__name__)


@app.get("/api/languages")
def languages():
    from flask import jsonify
    from utils.ocr import LANGUAGE_NAMES

    return jsonify({"languages": LANGUAGE_NAMES})


from modules.symptom_ai.routes import symptom_ai_bp

app.register_blueprint(symptom_ai_bp)

from modules.ocr_portal.routes import ocr_portal_bp

app.register_blueprint(ocr_portal_bp)

from modules.ai_exports.routes import ai_exports_bp

app.register_blueprint(ai_exports_bp)

# Pre-warm the Whisper model at boot rather than on first request -- a cold
# request otherwise pays for both the Hugging Face Hub download AND the
# model load, which is exactly what blew past gunicorn's request timeout and
# got SIGKILLed. Best-effort: if this fails (offline, registry hiccup), the
# provider's own lazy-load in ai/whisper_provider.py still covers it on the
# first real request -- this is purely an optimization, startup must not
# crash because of it.
try:
    from ai.service import transcription_provider as _transcription_provider

    _transcription_provider._get_model()
except Exception:
    pass


if __name__ == "__main__":
    port = int(os.getenv("PORT", "8018"))
    app.run(host="0.0.0.0", port=port, debug=os.getenv("FLASK_DEBUG", "").lower() == "true")
