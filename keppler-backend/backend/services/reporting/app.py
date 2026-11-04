"""reporting-service: cross-domain read aggregation (reports, dashboard).

Reads the shared database directly rather than calling the other services
over the network -- these endpoints aggregate across many domains (billing,
patients, OP, accounts) and a network fan-out per request would be slower
and more fragile than the direct-SQL aggregation utils/database.py already
implements for them.
"""
import os
import sys

_HERE = os.path.dirname(os.path.abspath(__file__))
_BACKEND_ROOT = os.path.dirname(os.path.dirname(_HERE))
if _BACKEND_ROOT not in sys.path:
    sys.path.insert(0, _BACKEND_ROOT)

from shared.app_factory import create_service_app

app = create_service_app(__name__)

from modules.reports.routes import reports_bp

app.register_blueprint(reports_bp)

from modules.dashboard.routes import dashboard_bp

app.register_blueprint(dashboard_bp)


if __name__ == "__main__":
    port = int(os.getenv("PORT", "8019"))
    app.run(host="0.0.0.0", port=port, debug=os.getenv("FLASK_DEBUG", "").lower() == "true")
