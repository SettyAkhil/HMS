"""patients-service: patients, EMR, ICU flowsheet, clinical orders/care plan, documents, bulk import, WhatsApp/SMS patient messaging."""
import os
import sys

_HERE = os.path.dirname(os.path.abspath(__file__))
_BACKEND_ROOT = os.path.dirname(os.path.dirname(_HERE))
if _BACKEND_ROOT not in sys.path:
    sys.path.insert(0, _BACKEND_ROOT)

from shared.app_factory import create_service_app
from core.celery_app import celery_init_app

app = create_service_app(__name__)
# bulk_import dispatches Celery tasks (modules/bulk_import/tasks.py) -- this is
# the only module across all services that does, so only this service needs
# a Celery app wired in.
celery = celery_init_app(app)

from modules.patients.routes import patients_bp

app.register_blueprint(patients_bp)

from modules.emr.routes import emr_bp

app.register_blueprint(emr_bp)

from modules.documents.routes import documents_bp

app.register_blueprint(documents_bp)

from modules.bulk_import.routes import bulk_import_bp

app.register_blueprint(bulk_import_bp)

from modules.whatsapp.routes import whatsapp_bp

app.register_blueprint(whatsapp_bp)

from modules.messaging.routes import messaging_bp

app.register_blueprint(messaging_bp)

from modules.icu.routes import icu_bp

app.register_blueprint(icu_bp)

from modules.clinical.routes import clinical_bp

app.register_blueprint(clinical_bp)

from modules.ot.routes import ot_bp

app.register_blueprint(ot_bp)


if __name__ == "__main__":
    port = int(os.getenv("PORT", "8012"))
    app.run(host="0.0.0.0", port=port, debug=os.getenv("FLASK_DEBUG", "").lower() == "true")
