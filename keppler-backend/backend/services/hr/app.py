"""hr-service: employees, departments, attendance, payroll, leaves, audit log."""
import os
import sys

_HERE = os.path.dirname(os.path.abspath(__file__))
_BACKEND_ROOT = os.path.dirname(os.path.dirname(_HERE))
if _BACKEND_ROOT not in sys.path:
    sys.path.insert(0, _BACKEND_ROOT)

from shared.app_factory import create_service_app

app = create_service_app(__name__)

from modules.hr.routes import hr_bp

app.register_blueprint(hr_bp)

from modules.audit.routes import audit_bp

app.register_blueprint(audit_bp)


if __name__ == "__main__":
    port = int(os.getenv("PORT", "8017"))
    app.run(host="0.0.0.0", port=port, debug=os.getenv("FLASK_DEBUG", "").lower() == "true")
