import hmac
import os
from functools import wraps

from flask import g, jsonify, request

from core.auth import (
    ADMIN_ROUTE_AUTH_COOKIE_NAME,
    SESSION_COOKIE_NAME,
    SESSION_TTL_SECONDS,
    get_session_user,
    resolve_user_permissions,
    verify_admin_route_auth_token,
)


def require_session(view):
    @wraps(view)
    def wrapper(*args, **kwargs):
        token = request.cookies.get(SESSION_COOKIE_NAME)
        user = get_session_user(token)
        if not user:
            return jsonify({"error": "Authentication required"}), 401
        g.current_user = user
        return view(*args, **kwargs)

    return wrapper


def require_permissions(*required_permissions):
    def decorator(view):
        @wraps(view)
        @require_session
        def wrapper(*args, **kwargs):
            user_permissions = resolve_user_permissions(g.current_user)
            if not all(
                permission in user_permissions for permission in required_permissions
            ):
                return (
                    jsonify(
                        {
                            "error": "Forbidden",
                            "required_permissions": list(required_permissions),
                        }
                    ),
                    403,
                )
            return view(*args, **kwargs)

        return wrapper

    return decorator


def require_admin_route_auth(view):
    @wraps(view)
    def wrapper(*args, **kwargs):
        token = request.cookies.get(ADMIN_ROUTE_AUTH_COOKIE_NAME)
        if not verify_admin_route_auth_token(token):
            return jsonify({"error": "Admin route authentication required"}), 403
        return view(*args, **kwargs)

    return wrapper


def require_platform_admin():
    configured_username = (os.getenv("PLATFORM_ADMIN_USERNAME") or "").strip()
    configured_password = (os.getenv("PLATFORM_ADMIN_PASSWORD") or "").strip()
    if not configured_username or not configured_password:
        return jsonify({"error": "Platform admin credentials are not configured"}), 503
    username = (
        request.headers.get("X-Platform-Admin-Username") or ""
    ).strip()
    password = (
        request.headers.get("X-Platform-Admin-Password") or ""
    )
    # Headers only: query-string credentials end up in access logs and history.
    if not (
        hmac.compare_digest(username.encode(), configured_username.encode())
        and hmac.compare_digest(password.encode(), configured_password.encode())
    ):
        return jsonify({"error": "Platform admin authentication failed"}), 403
    return None


def session_cookie_settings():
    # In local dev (HTTP), never use Secure so the browser actually stores the cookie.
    is_https = (
        request.is_secure or os.getenv("SESSION_COOKIE_SECURE", "").lower() == "true"
    )
    same_site = os.getenv("SESSION_COOKIE_SAMESITE", "Lax")
    if same_site not in ("Lax", "Strict", "None"):
        same_site = "Lax"
    return {
        "httponly": True,
        "secure": is_https,
        "samesite": same_site,
        "path": "/",
        "max_age": SESSION_TTL_SECONDS,
    }
