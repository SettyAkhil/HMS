"""Who is calling, for which hospital, allowed to do what.

Identity comes from the existing auth-service: the browser's session cookie is
forwarded to GET /api/auth/session and the answer cached briefly. This service
has no login, no user table and no copy of any password.

Permissions are the strings auth-service already issues (core/auth.py
SUB_MODULES["hrms"] / ["employees"]), so granting HR access is done in the
existing admin screens, not a second permission system."""

import hashlib
import hmac
import time
import uuid
from dataclasses import dataclass, field

import httpx
from fastapi import Depends, Request
from sqlalchemy import select

from app.config import settings
from app.db import system_session, tenant_session
from app.errors import Forbidden, Unauthorized, Unavailable
from app.models import Tenant

HR_READ = "hr.read"
EMPLOYEES_READ = "employees.read"
ORG_WRITE = "hr.departments.write"
EMPLOYEES_WRITE = "employees.profile.write"
ATTENDANCE_WRITE = "hr.attendance.write"
PAYROLL_WRITE = "hr.payroll.write"
LEAVES_WRITE = "hr.leaves.write"
SHIFTS_WRITE = "hr.shifts.write"
RECRUITMENT_WRITE = "hr.recruitment.write"
TRAINING_WRITE = "hr.training.write"
PERFORMANCE_WRITE = "hr.performance.write"
DOCUMENTS_WRITE = "hr.documents.write"
GRIEVANCES_MANAGE = "hr.grievances.manage"
REPORTS_READ = "hr.reports.read"
GOVERNANCE_WRITE = "hr.governance.write"
PLANNING_WRITE = "hr.planning.write"
ENGAGEMENT_WRITE = "hr.engagement.write"
AUDIT_READ = "hr.audit.read"
# Administration is a separate domain from HR (see app/services/facility.py).
FACILITY_READ = "facility.read"
FACILITY_REQUESTS_WRITE = "facility.requests.write"
FACILITY_ASSETS_WRITE = "facility.assets.write"
FACILITY_VENDORS_WRITE = "facility.vendors.write"
FACILITY_REPORTS_READ = "facility.reports.read"


@dataclass(frozen=True)
class Principal:
    username: str
    display_name: str
    tenant_id: uuid.UUID
    tenant_code: str
    permissions: frozenset[str] = field(default_factory=frozenset)
    is_admin: bool = False
    hms_employee_id: str | None = None

    def can(self, permission: str) -> bool:
        return self.is_admin or permission in self.permissions

    def can_read_hr(self) -> bool:
        return self.is_admin or bool({HR_READ, EMPLOYEES_READ} & self.permissions)


_session_cache: dict[str, tuple[float, dict]] = {}
_tenant_cache: dict[str, uuid.UUID] = {}


def _fetch_session_user(token: str) -> dict:
    key = hashlib.sha256(token.encode()).hexdigest()
    hit = _session_cache.get(key)
    if hit and hit[0] > time.monotonic():
        return hit[1]
    try:
        resp = httpx.get(
            f"{settings.auth_service_url}/api/auth/session",
            cookies={settings.session_cookie_name: token},
            timeout=5.0,
        )
    except httpx.HTTPError as exc:
        raise Unavailable("Authentication service is unreachable") from exc
    user = (resp.json() or {}).get("user") if resp.status_code == 200 else None
    if not user:
        _session_cache.pop(key, None)
        raise Unauthorized("Authentication required")
    _session_cache[key] = (time.monotonic() + settings.session_cache_seconds, user)
    if len(_session_cache) > 5000:
        _session_cache.clear()
    return user


def resolve_tenant(code: str, name: str | None = None) -> uuid.UUID:
    code = (code or "").strip().lower()
    if not code:
        raise Forbidden("Your account is not attached to a hospital")
    if code in _tenant_cache:
        return _tenant_cache[code]
    with system_session() as db:
        tenant = db.scalar(select(Tenant).where(Tenant.code == code))
        if tenant is None:
            tenant = Tenant(code=code, name=name or code.replace("-", " ").title())
            db.add(tenant)
            db.flush()
        if tenant.status != "active":
            raise Forbidden("This hospital's HR workspace is suspended")
        _tenant_cache[code] = tenant.id
        return tenant.id


def principal_from_user(user: dict) -> Principal:
    code = user.get("hospital_code") or "default"
    is_admin = str(user.get("user_type") or "").lower() == "admin"
    return Principal(
        username=user.get("username") or "unknown",
        display_name=user.get("full_name") or user.get("username") or "unknown",
        tenant_id=resolve_tenant(code),
        tenant_code=code,
        permissions=frozenset(user.get("permissions") or []),
        is_admin=is_admin,
        hms_employee_id=user.get("employee_id"),
    )


def _check_csrf(request: Request) -> None:
    if not settings.csrf_enabled or request.method in ("GET", "HEAD", "OPTIONS"):
        return
    cookie = request.cookies.get("csrf_token")
    header = request.headers.get("X-CSRF-Token")
    if not cookie or not header or not hmac.compare_digest(cookie, header):
        raise Forbidden("CSRF token missing or incorrect")


def current_principal(request: Request) -> Principal:
    token = request.cookies.get(settings.session_cookie_name)
    if not token:
        raise Unauthorized("Authentication required")
    _check_csrf(request)
    principal = principal_from_user(_fetch_session_user(token))
    request.state.principal = principal
    return principal


def require(*permissions: str):
    """Dependency: the caller must hold every listed permission (admins pass)."""

    def dep(principal: Principal = Depends(current_principal)) -> Principal:
        missing = [p for p in permissions if not principal.can(p)]
        if missing:
            raise Forbidden("You do not have permission for this action", {"required": missing})
        return principal

    return dep


def require_any(*permissions: str):
    """Dependency: the caller must hold at least one of the listed permissions."""

    def dep(principal: Principal = Depends(current_principal)) -> Principal:
        if not any(principal.can(p) for p in permissions):
            raise Forbidden("You do not have permission for this action", {"required_any": list(permissions)})
        return principal

    return dep


def require_hr_read(principal: Principal = Depends(current_principal)) -> Principal:
    if not principal.can_read_hr():
        raise Forbidden("You do not have access to HR", {"required": [HR_READ]})
    return principal


def get_db(principal: Principal = Depends(current_principal)):
    with tenant_session(principal.tenant_id) as db:
        db.info["actor"] = principal.username
        yield db
