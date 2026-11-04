"""Runtime settings, all from the environment. Nothing here has a usable
secret default: a missing key fails at the point it is needed, not silently."""

import os
from dataclasses import dataclass, field


def _env(name: str, default: str = "") -> str:
    return os.getenv(name, default).strip()


@dataclass(frozen=True)
class Settings:
    # Runtime connection: the non-superuser `hr_app` role, so PostgreSQL RLS
    # actually applies (a superuser or table owner bypasses it).
    database_url: str = field(default_factory=lambda: _env("HR_DATABASE_URL"))
    # Owner connection: migrations and role bootstrap only.
    owner_database_url: str = field(default_factory=lambda: _env("HR_DATABASE_OWNER_URL"))
    app_db_password: str = field(default_factory=lambda: _env("HR_APP_DB_PASSWORD"))

    # Sessions are issued by auth-service; this service never sees passwords.
    auth_service_url: str = field(
        default_factory=lambda: _env("HR_AUTH_SERVICE_URL", "http://auth-service:8011")
    )
    session_cookie_name: str = field(
        default_factory=lambda: _env("SESSION_COOKIE_NAME", "hospai_session")
    )
    session_cache_seconds: int = field(
        default_factory=lambda: int(_env("HR_SESSION_CACHE_SECONDS", "15"))
    )

    # Other HospAI services are reached only through the gateway.
    gateway_url: str = field(default_factory=lambda: _env("HR_GATEWAY_URL", "http://gateway:8010"))
    # Private document store (a volume, never served statically).
    document_root: str = field(default_factory=lambda: _env("HR_DOCUMENT_ROOT", "/data/hr-documents"))
    redis_url: str = field(default_factory=lambda: _env("REDIS_URL", "redis://redis:6379/0"))
    # Fernet key for integration credentials at rest (eSSL web-user passwords).
    secrets_key: str = field(default_factory=lambda: _env("HR_SECRETS_KEY"))

    # Off in production; tests drive requests without a real auth-service.
    csrf_enabled: bool = field(
        default_factory=lambda: _env("HR_CSRF_ENABLED", "true").lower() != "false"
    )
    sync_poll_seconds: int = field(
        default_factory=lambda: int(_env("HR_SYNC_POLL_SECONDS", "120"))
    )
    # A device not heard from in this long is reported offline.
    device_offline_minutes: int = field(
        default_factory=lambda: int(_env("HR_DEVICE_OFFLINE_MINUTES", "15"))
    )
    # Business-day boundaries are reckoned in the hospital's zone, not UTC.
    timezone: str = field(default_factory=lambda: _env("HR_TIMEZONE", "Asia/Kolkata"))


settings = Settings()
