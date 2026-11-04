"""billing-service: invoices, payments, insurance claims, finance ledger."""
import os
import sys

_HERE = os.path.dirname(os.path.abspath(__file__))
_BACKEND_ROOT = os.path.dirname(os.path.dirname(_HERE))
if _BACKEND_ROOT not in sys.path:
    sys.path.insert(0, _BACKEND_ROOT)

from shared.app_factory import create_service_app
from shared.payments import is_razorpay_configured, RAZORPAY_KEY_ID

app = create_service_app(__name__)


@app.get("/api/payments/razorpay/config")
def razorpay_config():
    from flask import jsonify

    return jsonify(
        {
            "configured": is_razorpay_configured(),
            "key_id": RAZORPAY_KEY_ID if is_razorpay_configured() else "",
        }
    )


from modules.billing.routes import billing_bp

app.register_blueprint(billing_bp)

from modules.accounts.routes import accounts_bp

app.register_blueprint(accounts_bp)


if __name__ == "__main__":
    port = int(os.getenv("PORT", "8015"))
    app.run(host="0.0.0.0", port=port, debug=os.getenv("FLASK_DEBUG", "").lower() == "true")
