import os
from flask import request
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address

REDIS_URL = os.getenv("REDIS_URL", "memory://")

def client_address():
    """The caller's address. Behind the nginx gateway every request arrives from
    the gateway itself, so get_remote_address would put all users in one bucket;
    the gateway overwrites X-Real-IP with the real client address
    (gateway/proxy_params.conf), so it is trusted when present. Services are not
    published on the host -- only the gateway is."""
    return request.headers.get("X-Real-IP") or get_remote_address()


# Route-level limits (login, setup-admin, ...) always apply. A global default
# is opt-in: a per-client cap on every endpoint throttles a whole hospital
# behind one NAT address, so it is set per deployment, e.g.
# RATELIMIT_DEFAULT="600 per minute".
_DEFAULT = [l.strip() for l in os.getenv("RATELIMIT_DEFAULT", "").split(";") if l.strip()]

limiter = Limiter(
    key_func=client_address,
    storage_uri=REDIS_URL,
    default_limits=_DEFAULT,
)


@limiter.request_filter
def _exempt_cors_preflight():
    # Browser CORS preflights hit the same rate-limited routes as the real
    # request (e.g. login's OPTIONS + POST), so counting them here means 2-3
    # real attempts exhausts the budget and the *next preflight* itself gets
    # a 429 -- which browsers treat as a failed CORS check (they require a 2xx
    # preflight regardless of headers), surfacing as a confusing "blocked by
    # CORS policy" error instead of the intended "too many attempts" message.
    return request.method == "OPTIONS"
