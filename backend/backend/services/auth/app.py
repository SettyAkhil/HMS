"""auth-service: sessions, users, hospitals (tenant + platform admin)."""
import os
import sys

_HERE = os.path.dirname(os.path.abspath(__file__))
_BACKEND_ROOT = os.path.dirname(os.path.dirname(_HERE))
if _BACKEND_ROOT not in sys.path:
    sys.path.insert(0, _BACKEND_ROOT)

from shared.app_factory import create_service_app

app = create_service_app(__name__)

# auth-service is the sole owner of schema migrations and demo-user seeding --
# every other service skips init_database() to avoid concurrent migration races.
if "pytest" not in sys.modules:
    from utils.database import init_database

    init_database()
    if os.getenv("SEED_DEMO_USERS", "true").strip().lower() != "false":
        from core.auth import create_default_users

        create_default_users()

from modules.auth.routes import auth_bp

app.register_blueprint(auth_bp)

from modules.admin.routes import admin_bp

app.register_blueprint(admin_bp)


if __name__ == "__main__":
    port = int(os.getenv("PORT", "8011"))
    app.run(host="0.0.0.0", port=port, debug=os.getenv("FLASK_DEBUG", "").lower() == "true")
