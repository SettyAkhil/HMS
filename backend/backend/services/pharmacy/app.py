"""pharmacy-service: inventory, prescriptions, sales."""
import os
import sys

_HERE = os.path.dirname(os.path.abspath(__file__))
_BACKEND_ROOT = os.path.dirname(os.path.dirname(_HERE))
if _BACKEND_ROOT not in sys.path:
    sys.path.insert(0, _BACKEND_ROOT)

from shared.app_factory import create_service_app

app = create_service_app(__name__)

from modules.pharmacy.routes import pharmacy_bp

app.register_blueprint(pharmacy_bp)


if __name__ == "__main__":
    port = int(os.getenv("PORT", "8016"))
    app.run(host="0.0.0.0", port=port, debug=os.getenv("FLASK_DEBUG", "").lower() == "true")
