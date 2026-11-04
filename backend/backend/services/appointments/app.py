"""appointments-service: appointments, OP visits/workflow, queue."""
import os
import sys

_HERE = os.path.dirname(os.path.abspath(__file__))
_BACKEND_ROOT = os.path.dirname(os.path.dirname(_HERE))
if _BACKEND_ROOT not in sys.path:
    sys.path.insert(0, _BACKEND_ROOT)

from shared.app_factory import create_service_app

app = create_service_app(__name__)

from modules.appointments.routes import appointments_bp

app.register_blueprint(appointments_bp)

from modules.op.routes import op_bp

app.register_blueprint(op_bp)

from modules.queue.routes import bp as queue_bp

app.register_blueprint(queue_bp)


if __name__ == "__main__":
    port = int(os.getenv("PORT", "8013"))
    app.run(host="0.0.0.0", port=port, debug=os.getenv("FLASK_DEBUG", "").lower() == "true")
