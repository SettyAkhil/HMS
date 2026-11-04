"""er-service: emergency room visits/consents/LAMA, bed management."""
import os
import sys

_HERE = os.path.dirname(os.path.abspath(__file__))
_BACKEND_ROOT = os.path.dirname(os.path.dirname(_HERE))
if _BACKEND_ROOT not in sys.path:
    sys.path.insert(0, _BACKEND_ROOT)

from shared.app_factory import create_service_app

app = create_service_app(__name__)

from modules.er.routes import er_bp

app.register_blueprint(er_bp)

from modules.beds.routes import beds_bp

app.register_blueprint(beds_bp)


if __name__ == "__main__":
    port = int(os.getenv("PORT", "8014"))
    app.run(host="0.0.0.0", port=port, debug=os.getenv("FLASK_DEBUG", "").lower() == "true")
