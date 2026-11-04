import json
import os
import secrets
import hashlib
import hmac
from datetime import datetime, timedelta, timezone
from typing import Optional, Union

import bcrypt
from utils.database import (
    get_connection,
    add_employee,
    generate_employee_id,
    check_if_first_user,
    resolve_hospital_id,
    normalize_hospital_code,
)

SESSION_COOKIE_NAME = os.getenv("SESSION_COOKIE_NAME", "hospai_session")
SESSION_TTL_HOURS = int(os.getenv("SESSION_TTL_HOURS", "12"))
SESSION_TTL_SECONDS = SESSION_TTL_HOURS * 60 * 60
SESSION_PEPPER = os.getenv("SESSION_PEPPER", "")
ADMIN_ROUTE_PASSWORD = os.getenv("ADMIN_ROUTE_PASSWORD", "")
ADMIN_ROUTE_AUTH_COOKIE_NAME = os.getenv(
    "ADMIN_ROUTE_AUTH_COOKIE_NAME", "hospai_admin_route_auth"
)
ADMIN_ROUTE_AUTH_TTL_SECONDS = int(os.getenv("ADMIN_ROUTE_AUTH_TTL_SECONDS", "3600"))
ADMIN_ROUTE_AUTH_SECRET = (
    os.getenv("ADMIN_ROUTE_AUTH_SECRET", "")
    or SESSION_PEPPER
    or "hospai-admin-route-auth"
)

USER_TYPES = ("admin", "normal")

# Modules a normal (non-admin) user can be granted. Each maps to a base "view"
# permission (its read/GET routes) plus zero or more sub-items that gate a
# specific write/delete action within it (see SUB_MODULES below). This stays
# out of "emergency"/"icu"/"ambulance"/"nurse"/"queue" deliberately -- those
# backend blueprints are stub scaffolding (Phase A/E/F/G) with no real pages
# behind them yet; there's nothing to protect there. "beds" (Phase H) and "er"
# (ER module Phase 1) are the ones from that batch with a real implementation --
# see modules/beds/routes.py and modules/er/routes.py.
# Ordered to match the sidebar's visual grouping (Overview -> OP Management ->
# Operations -> AI -> Finance -> Administration) so the RBAC checkbox list in
# Employee Management reads in the same order an admin sees the modules laid
# out in their own sidebar -- see MODULE_OPTIONS in frontend/src/lib/constants.ts,
# which must be kept in this same order.
ASSIGNABLE_MODULES = (
    "dashboard",  # Overview
    "patients",  # OP Management
    "op",  # Operations
    "beds",  # Operations
    "er",  # Operations
    "pharmacy",  # Operations
    "symptom_ai",  # AI
    "billing",  # Finance
    "accounts",  # Finance -- general ledger
    "hrms",  # Administration
    "employees",  # Administration
    "patient_experience",  # Administration
    "facility",  # Administration -- facility & admin coordination (hr-api)
)
DEFAULT_NORMAL_MODULES = ("dashboard", "patients", "op", "symptom_ai")
# The demo "doctor" and "staff" accounts each back many frontend roles (see the
# frontend's src/lib/demoCredentials.ts -- nurse, reception, billing, lab,
# pharmacy... all sign in as "staff"), whose screens all poll the OP queue,
# claims and ER board. The frontend gates navigation itself; these accounts
# only need every operational module, or each of those polls is a 403. The
# doctor previously listed "lab"/"reports", which are not module keys at all
# and were silently dropped.
DEMO_CLINICAL_MODULES = (
    "dashboard", "patients", "op", "beds", "er", "pharmacy", "billing", "symptom_ai",
)

MODULE_BASE_PERMISSION = {
    "dashboard": "patients.read",
    "patients": "patients.read",
    "op": "op.read",
    "beds": "beds.read",
    "er": "er.read",
    "pharmacy": "pharmacy.read",
    "symptom_ai": "symptom_ai.use",
    "billing": "billing.read",
    "accounts": "accounts.read",
    "hrms": "hr.read",
    "employees": "employees.read",
    "patient_experience": "patient_experience.read",
    "facility": "facility.read",
}

# module_access entries are stored as a flat JSON array of strings, same as
# before sub-modules existed -- but an entry is now either a bare module key
# ("billing" -> the module's base/read permission PLUS every sub-item's write
# permission, i.e. full access to that module -- identical to the old
# all-or-nothing behavior, so existing stored data keeps working unchanged)
# or a dotted "module.subitem" key (grants just that one sub-item's write
# permission, and implies the module's base/read permission so it becomes
# visible). This lets an admin grant e.g. "billing" broadly, or narrow it to
# just "billing.invoices" while withholding "billing.claims".
SUB_MODULES = {
    "patients": {
        "directory": {
            "label": "Patient Directory (edit/delete)",
            "permissions": ["patients.write", "patients.delete"],
        },
        "registration": {
            "label": "Patient Registration",
            "permissions": ["patients.registration.write"],
        },
        "consent_desk": {
            "label": "Consent Desk",
            "permissions": ["patients.consent.write"],
        },
        "insurance_desk": {
            "label": "Insurance Desk",
            "permissions": ["patients.insurance.write"],
        },
        "appointments": {
            "label": "Appointments",
            "permissions": ["patients.appointments.write"],
        },
        "documents": {
            "label": "Documents & OCR",
            "permissions": ["patients.documents.write"],
        },
        "clinical_records": {
            "label": "Clinical Records (encounters/notes/certificates)",
            "permissions": ["patients.clinical.write"],
        },
        "bulk_ai": {
            "label": "Bulk Patient AI",
            "permissions": ["patients.bulk_ai.write"],
        },
    },
    # Standalone, matching the sidebar's "Operations" grouping (Doctor
    # Scheduling / Pharmacy / Lab & Diagnostics / OT) -- NOT nested under
    # "patients", even though its routes are patient-adjacent.
    "op": {
        "schedules": {
            "label": "Doctor Schedules",
            "permissions": ["op.schedules.write"],
        },
        "doctors": {"label": "Doctor Directory", "permissions": ["op.doctors.write"]},
    },
    "beds": {
        "manage": {
            "label": "Add/Edit Beds & Admit/Discharge Patients",
            "permissions": ["beds.write"],
        },
    },
    "er": {
        "registration": {
            "label": "ER Registration & Intake",
            "permissions": ["er.registration.write"],
        },
        "triage": {
            "label": "Triage & Vitals",
            "permissions": ["er.triage.write"],
        },
        "treatment": {
            "label": "Emergency Treatment",
            "permissions": ["er.treatment.write"],
        },
        "doctor_assignment": {
            "label": "Doctor Assignment & Clinical Notes",
            "permissions": ["er.doctor_assignment.write"],
        },
        "disposition": {
            "label": "Disposition Decision",
            "permissions": ["er.disposition.write"],
        },
        # Deliberately not "bed_request": fulfilling an ER bed request is a Bed
        # Management action (it calls assign_patient_to_bed() unchanged) and is
        # gated on the existing beds.write permission instead, so ER clinical
        # staff and Reception/bed-management staff stay separate grants.
        "config": {
            "label": "Triage Category Configuration",
            "permissions": ["er.config.write"],
        },
    },
    "pharmacy": {
        "inventory": {
            "label": "Inventory",
            "permissions": ["pharmacy.inventory.write"],
        },
        "sales": {"label": "Sales", "permissions": ["pharmacy.sales.write"]},
        "suppliers": {
            "label": "Suppliers",
            "permissions": ["pharmacy.suppliers.write"],
        },
        "purchases": {
            "label": "Purchases",
            "permissions": ["pharmacy.purchases.write"],
        },
        "prescriptions": {
            "label": "Prescriptions",
            "permissions": ["pharmacy.prescriptions.write"],
        },
    },
    "symptom_ai": {
        "documents": {
            "label": "Knowledge Vault Documents",
            "permissions": ["symptom_ai.documents.write"],
        },
    },
    "billing": {
        "invoices": {
            "label": "Invoices & Payments",
            "permissions": ["billing.invoices.write"],
        },
        "claims": {
            "label": "Insurance Claims",
            "permissions": ["billing.claims.write"],
        },
    },
    # Split so that preparing, approving and closing can be held by different
    # people -- the maker-checker rule in modules/accounts/workflows.py also refuses
    # an approval by the voucher's own preparer, whatever permissions they hold.
    "accounts": {
        "ledger": {"label": "Post receipts, vouchers & operational entries", "permissions": ["accounts.ledger.write"]},
        "approve": {"label": "Approve vouchers & reverse journals", "permissions": ["accounts.approve"]},
        "periods": {"label": "Close periods & years, run depreciation", "permissions": ["accounts.periods.manage"]},
        "setup": {"label": "Chart of accounts, assets & budgets", "permissions": ["accounts.setup.write"]},
    },
    "hrms": {
        "departments": {
            "label": "Departments",
            "permissions": ["hr.departments.write"],
        },
        "attendance": {"label": "Attendance", "permissions": ["hr.attendance.write"]},
        "payroll": {"label": "Payroll", "permissions": ["hr.payroll.write"]},
        "leaves": {"label": "Leave Requests", "permissions": ["hr.leaves.write"]},
        # HR & Workforce service (keppler-backend/hr-api) areas.
        "shifts": {"label": "Shifts, Rosters & Staffing", "permissions": ["hr.shifts.write"]},
        "recruitment": {"label": "Recruitment & Onboarding", "permissions": ["hr.recruitment.write"]},
        "training": {"label": "Training & Certifications", "permissions": ["hr.training.write"]},
        "performance": {"label": "Performance Reviews", "permissions": ["hr.performance.write"]},
        "documents": {"label": "Employee Documents", "permissions": ["hr.documents.write"]},
        # Confidential: grievance case files and disciplinary records.
        "grievances": {"label": "Grievances & Discipline", "permissions": ["hr.grievances.manage"]},
        "reports": {"label": "HR Reports & Exports", "permissions": ["hr.reports.read"]},
        "governance": {"label": "HR Strategy & Policies", "permissions": ["hr.governance.write"]},
        "planning": {"label": "Workforce Planning & HR Budget", "permissions": ["hr.planning.write"]},
        "engagement": {"label": "Employee Engagement", "permissions": ["hr.engagement.write"]},
        "audit": {"label": "HR Audit & Compliance Review", "permissions": ["hr.audit.read"]},
    },
    "facility": {
        "requests": {"label": "Facility Requests", "permissions": ["facility.requests.write"]},
        "assets": {"label": "Assets", "permissions": ["facility.assets.write"]},
        "vendors": {"label": "Vendors & Contracts", "permissions": ["facility.vendors.write"]},
        "reports": {"label": "Facility Reports", "permissions": ["facility.reports.read"]},
    },
    "employees": {
        "profile": {
            "label": "Edit Profile Fields",
            "permissions": ["employees.profile.write"],
        },
        # Deliberately separate from "profile": this is the permission that lets
        # someone change a colleague's user_type/access_role/module_access, i.e.
        # actually grant or revoke access -- see signup_employee/update_employee
        # for the server-side clamp that stops a holder of this from granting
        # more than they themselves have.
        "access": {
            "label": "Manage Roles & Module Access",
            "permissions": ["employees.access.write"],
        },
    },
    "patient_experience": {
        "feedback": {
            "label": "Respond to Feedback",
            "permissions": ["patient_experience.write"],
        },
    },
}


def _all_sub_permissions(module: str) -> set[str]:
    result: set[str] = set()
    for sub in SUB_MODULES.get(module, {}).values():
        result.update(sub["permissions"])
    return result


MODULE_PERMISSION_MAP = {
    module: {base_permission} | _all_sub_permissions(module)
    for module, base_permission in MODULE_BASE_PERMISSION.items()
}

_VALID_MODULE_ACCESS_KEYS = set(ASSIGNABLE_MODULES) | {
    f"{module}.{sub_key}" for module, subs in SUB_MODULES.items() for sub_key in subs
}

# Admin always gets literally everything any module/sub-item can grant, plus
# the two permissions with no module-level equivalent (derived, not
# hand-listed, so it can never drift out of sync with MODULE_PERMISSION_MAP).
ADMIN_PERMISSIONS = set().union(*MODULE_PERMISSION_MAP.values()) | {
    "audit.read",
    "admin.use",
}


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt(10)).decode()


def verify_password(password: str, hashed: str) -> bool:
    return bcrypt.checkpw(password.encode(), hashed.encode())


def _now_utc() -> datetime:
    return datetime.now(timezone.utc)


def _format_ts(value: datetime) -> str:
    return value.astimezone(timezone.utc).isoformat()


def _parse_ts(value: Union[str, datetime]) -> datetime:
    if isinstance(value, datetime):
        parsed = value
    else:
        parsed = datetime.fromisoformat(value)
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed


def _hash_session_token(token: str) -> str:
    token_bytes = f"{token}{SESSION_PEPPER}".encode()
    return hashlib.sha256(token_bytes).hexdigest()


def is_admin_route_auth_configured() -> bool:
    return bool(ADMIN_ROUTE_PASSWORD)


def verify_admin_route_password(password: str) -> bool:
    if not is_admin_route_auth_configured():
        return False
    return hmac.compare_digest(password or "", ADMIN_ROUTE_PASSWORD)


def create_admin_route_auth_token() -> str:
    nonce = secrets.token_urlsafe(18)
    expires_at = int(_now_utc().timestamp()) + ADMIN_ROUTE_AUTH_TTL_SECONDS
    payload = f"{nonce}:{expires_at}"
    signature = hmac.new(
        ADMIN_ROUTE_AUTH_SECRET.encode(), payload.encode(), hashlib.sha256
    ).hexdigest()
    return f"{nonce}.{expires_at}.{signature}"


def verify_admin_route_auth_token(token: Optional[str]) -> bool:
    if not token or "." not in token:
        return False
    parts = token.split(".")
    if len(parts) != 3:
        return False
    nonce, expires_str, signature = parts
    try:
        expires_at = int(expires_str)
    except ValueError:
        return False
    if int(_now_utc().timestamp()) >= expires_at:
        return False
    payload = f"{nonce}:{expires_at}"
    expected_signature = hmac.new(
        ADMIN_ROUTE_AUTH_SECRET.encode(), payload.encode(), hashlib.sha256
    ).hexdigest()
    return hmac.compare_digest(signature, expected_signature)


def normalize_user_type(
    user_type: Optional[str],
    access_role: Optional[str] = None,
    legacy_role: Optional[str] = None,
) -> str:
    normalized = (user_type or "").strip().lower()
    if normalized in USER_TYPES:
        return normalized

    normalized_access_role = (access_role or "").strip().lower()
    if normalized_access_role in {"owner", "hr_manager"}:
        return "admin"

    normalized_legacy_role = (legacy_role or "").strip().lower()
    if normalized_legacy_role == "employee":
        return "admin"

    return "normal"


def _parse_modules(raw_modules) -> list[str]:
    if raw_modules is None:
        return []
    if isinstance(raw_modules, list):
        candidates = raw_modules
    elif isinstance(raw_modules, str):
        text = raw_modules.strip()
        if not text:
            candidates = []
        else:
            try:
                decoded = json.loads(text)
                candidates = decoded if isinstance(decoded, list) else [text]
            except json.JSONDecodeError:
                candidates = [part.strip() for part in text.split(",") if part.strip()]
    else:
        candidates = []

    normalized = []
    for module_name in candidates:
        module_key = str(module_name).strip().lower()
        if module_key in _VALID_MODULE_ACCESS_KEYS and module_key not in normalized:
            normalized.append(module_key)
    return normalized


def default_modules_for_legacy(
    access_role: Optional[str], legacy_role: Optional[str]
) -> list[str]:
    normalized_access_role = (access_role or "").strip().lower()
    normalized_legacy_role = (legacy_role or "").strip().lower()

    if (
        normalized_access_role in {"owner", "hr_manager"}
        or normalized_legacy_role == "employee"
    ):
        return list(ASSIGNABLE_MODULES)
    if normalized_access_role == "clinician":
        return ["dashboard", "patients", "lab", "pharmacy", "symptom_ai"]
    if normalized_access_role == "receptionist":
        return ["dashboard", "patients", "billing", "symptom_ai"]

    if normalized_legacy_role == "staff":
        return ["dashboard", "patients", "beds", "billing", "symptom_ai"]

    return list(DEFAULT_NORMAL_MODULES)


def normalize_module_access(
    raw_modules,
    user_type: Optional[str] = None,
    access_role: Optional[str] = None,
    legacy_role: Optional[str] = None,
) -> list[str]:
    normalized_type = normalize_user_type(user_type, access_role, legacy_role)
    if normalized_type == "admin":
        return list(ASSIGNABLE_MODULES)

    parsed = _parse_modules(raw_modules)
    if parsed:
        return parsed

    # Legacy fallback: only for non-normal roles (owner/clinician/receptionist legacy accounts
    # that pre-date the module_access column). Normal users must have explicit modules assigned;
    # missing or invalid module_access means zero access (explicit deny).
    if raw_modules is None and normalized_type != "normal":
        return default_modules_for_legacy(access_role, legacy_role)

    # Default deny for normal users when module access is missing or invalid.
    return []


def modules_to_storage(modules: list[str]) -> str:
    return json.dumps(modules, separators=(",", ":"))


def get_permissions(
    user_type: Optional[str],
    module_access=None,
    access_role: Optional[str] = None,
    legacy_role: Optional[str] = None,
) -> list[str]:
    normalized_type = normalize_user_type(user_type, access_role, legacy_role)
    if normalized_type == "admin":
        return sorted(ADMIN_PERMISSIONS)

    permissions: set[str] = set()
    for entry in normalize_module_access(
        module_access, normalized_type, access_role, legacy_role
    ):
        if "." in entry:
            module_name, sub_key = entry.split(".", 1)
            sub = SUB_MODULES.get(module_name, {}).get(sub_key)
            if not sub:
                continue
            permissions.update(sub["permissions"])
            base_permission = MODULE_BASE_PERMISSION.get(module_name)
            if base_permission:
                # Granting a sub-item's write access implies the module itself
                # is visible, even if the bare module key wasn't also selected.
                permissions.add(base_permission)
        else:
            permissions.update(MODULE_PERMISSION_MAP.get(entry, set()))

    return sorted(permissions)


def module_access_tree(module_access: list[str]) -> dict[str, list[str]]:
    """Expand a stored module_access array into {module: [granted sub-item keys]}
    for the Employee Management UI -- a bare module entry expands to ALL of its
    sub-item keys (full access), a dotted entry contributes just that one."""
    tree: dict[str, set[str]] = {}
    for entry in module_access or []:
        if "." in entry:
            module_name, sub_key = entry.split(".", 1)
            if module_name in SUB_MODULES and sub_key in SUB_MODULES[module_name]:
                tree.setdefault(module_name, set()).add(sub_key)
        elif entry in ASSIGNABLE_MODULES:
            tree.setdefault(entry, set()).update(SUB_MODULES.get(entry, {}).keys())
    return {module: sorted(subs) for module, subs in tree.items()}


def resolve_user_profile(user_row) -> dict:
    user_type = normalize_user_type(
        user_row.get("user_type"), user_row.get("access_role"), user_row.get("role")
    )
    module_access = normalize_module_access(
        user_row.get("module_access"),
        user_type,
        user_row.get("access_role"),
        user_row.get("role"),
    )

    return {
        "username": user_row.get("username"),
        "role": user_row.get("role"),
        "access_role": user_row.get("access_role"),
        "job_role": user_row.get("job_role"),
        "user_type": user_type,
        "module_access": module_access,
        "permissions": get_permissions(
            user_type, module_access, user_row.get("access_role"), user_row.get("role")
        ),
        "full_name": user_row.get("full_name"),
        "email": user_row.get("email"),
        "phone": user_row.get("phone"),
        "employee_id": user_row.get("employee_id"),
        "status": user_row.get("status"),
        "hospital_code": user_row.get("hospital_code"),
    }


def resolve_user_permissions(user: dict) -> set[str]:
    explicit_permissions = user.get("permissions")
    if explicit_permissions:
        return set(explicit_permissions)

    return set(
        get_permissions(
            user.get("user_type"),
            user.get("module_access"),
            user.get("access_role"),
            user.get("role"),
        )
    )


def _entry_is_within(entry: str, granter_permissions: set[str]) -> bool:
    if "." in entry:
        module_name, sub_key = entry.split(".", 1)
        sub = SUB_MODULES.get(module_name, {}).get(sub_key)
        perms = set(sub["permissions"]) if sub else set()
    else:
        perms = MODULE_PERMISSION_MAP.get(entry, set())
    return bool(perms) and perms.issubset(granter_permissions)


def authorize_employee_access_change(
    requested_user_type, requested_module_access, granter_user: dict
):
    """Guard against privilege escalation via the employee-management "manage
    roles & module access" permission (employees.access.write). Without this,
    anyone holding that permission -- not just a full admin -- could set an
    arbitrary user_type="admin" or module_access list on themselves or any
    other account, since update_employee/signup_employee otherwise write
    whatever the request body contains straight to the users table.

    Returns (ok: bool, error_message: Optional[str]). Full admins are always
    unrestricted (matches existing behavior). A non-admin granter can never
    set user_type to "admin", and can never grant a module/sub-item whose
    permissions exceed what the granter's own account currently holds.
    """
    granter_is_admin = (
        normalize_user_type(
            granter_user.get("user_type"),
            granter_user.get("access_role"),
            granter_user.get("role"),
        )
        == "admin"
    )
    if granter_is_admin:
        return True, None

    if (
        requested_user_type is not None
        and (requested_user_type or "").strip().lower() == "admin"
    ):
        return False, "Only an existing admin can grant admin access."

    if requested_module_access is not None:
        granter_permissions = resolve_user_permissions(granter_user)
        disallowed = [
            entry
            for entry in _parse_modules(requested_module_access)
            if not _entry_is_within(entry, granter_permissions)
        ]
        if disallowed:
            return (
                False,
                f"Cannot grant access you do not have yourself: {', '.join(disallowed)}",
            )

    return True, None


def validate_password(password: str) -> Optional[str]:
    if not password or len(password) < 8:
        return "Password must be at least 8 characters long."
    return None


# Role presets for the HR & Administration workspaces: a preset is only a
# module_access bundle (plus job_role, which the UI uses to pick a dashboard
# layout). Permissions are still resolved from module_access as for any user,
# so a preset can be edited per person in Employee Management afterwards.
ROLE_PRESETS = {
    "ceo": ("CEO / Hospital Director", ["dashboard", "hrms.reports", "facility.reports"]),
    "hr_director": ("HR Director", ["dashboard", "hrms", "employees"]),
    "hr_manager": ("HR Manager", ["dashboard", "employees", "hrms.departments", "hrms.attendance", "hrms.leaves",
                                  "hrms.shifts", "hrms.recruitment", "hrms.training", "hrms.performance",
                                  "hrms.documents", "hrms.engagement", "hrms.governance", "hrms.reports"]),
    "hr_executive": ("HR Executive", ["dashboard", "employees.profile", "hrms.attendance", "hrms.leaves",
                                      "hrms.documents", "hrms.recruitment"]),
    "department_head": ("Department Head", ["dashboard"]),
    "attendance_manager": ("Attendance Manager", ["dashboard", "hrms.attendance", "hrms.shifts"]),
    "payroll_manager": ("Payroll Manager", ["dashboard", "hrms.payroll", "hrms.reports"]),
    "admin_manager": ("Administration Manager", ["dashboard", "facility"]),
    "compliance_officer": ("Compliance Officer", ["dashboard", "hrms.audit", "hrms.reports", "hrms.documents"]),
    "employee": ("Employee", ["dashboard"]),
}
ROLE_PRESET_USERNAMES = {key: key.replace("_", ".") for key in ROLE_PRESETS}
DEMO_PRESET_PASSWORD = "HospAI@2026"


def create_default_users():
    """Seed starter accounts so the API is usable out of the box."""
    hospital_id = resolve_hospital_id()
    with get_connection() as conn:
        cursor = conn.cursor()

        defaults = [
            {
                "username": "employee",
                "email": "admin@hospai.local",
                "password_hash": hash_password("employee123"),
                "role": "employee",
                "access_role": "owner",
                "user_type": "admin",
                "module_access": list(ASSIGNABLE_MODULES),
                "job_role": "Administrator",
                "full_name": "System Administrator",
                "phone": "+1-234-567-8900",
                "department": "General",
                "status": "active",
                "address": "",
                "emergency_contact": "",
            },
            {
                "username": "admin",
                "email": "admin@hospital.com",
                "password_hash": hash_password("Admin@123"),
                "role": "employee",
                "access_role": "owner",
                "user_type": "admin",
                "module_access": list(ASSIGNABLE_MODULES),
                "job_role": "Administrator",
                "full_name": "Admin User",
                "phone": "+1-234-567-8901",
                "department": "Administration",
                "status": "active",
                "address": "",
                "emergency_contact": "",
            },
            {
                "username": "staff",
                "email": "nurse@hospai.local",
                "password_hash": hash_password("staff123"),
                "role": "staff",
                "access_role": "receptionist",
                "user_type": "normal",
                # Staff also backs the frontend's finance / billing / insurance roles.
                "module_access": list(DEMO_CLINICAL_MODULES) + ["accounts"],
                "job_role": "Staff",
                "full_name": "Staff User",
                "phone": "+1-234-567-8902",
                "department": "Ops",
                "status": "active",
                "address": "",
                "emergency_contact": "",
            },
            {
                "username": "doctor",
                "email": "doctor@hospital.com",
                "password_hash": hash_password("doctor123"),
                "role": "employee",
                "access_role": "clinician",
                "user_type": "normal",
                "module_access": list(DEMO_CLINICAL_MODULES),
                "job_role": "Doctor",
                "full_name": "Dr. Clinician",
                "phone": "+1-234-567-8903",
                "department": "Medicine",
                "status": "active",
                "address": "",
                "emergency_contact": "",
            },
        ]

        # One demo account per HR/Admin role preset (username = preset with dots).
        for key, (label, modules) in ROLE_PRESETS.items():
            defaults.append({
                "username": ROLE_PRESET_USERNAMES[key],
                "email": f"{ROLE_PRESET_USERNAMES[key]}@hospai.local",
                "password_hash": hash_password(DEMO_PRESET_PASSWORD),
                "role": "employee",
                "access_role": "receptionist",
                "user_type": "normal",
                "module_access": modules,
                "job_role": label,
                "full_name": f"Demo {label}",
                "phone": "",
                "department": "HR" if key.startswith("hr") else "Administration",
                "status": "active",
                "address": "",
                "emergency_contact": "",
            })

        for user in defaults:
            # Only touches login-usability fields (password/email/active status) on an
            # already-existing row -- NOT role/access_role/user_type/module_access.
            # These four usernames (employee/admin/staff/doctor) are demo seed accounts,
            # but once a hospital admin has configured real permissions for one of them
            # via Employee Management, this function re-running on every app startup
            # (app.py's init path runs it unconditionally) must not silently overwrite
            # that configuration back to the hardcoded seed defaults. Full defaults
            # (including module_access) only apply when the row doesn't exist yet, via
            # the INSERT branch below.
            cursor.execute(
                """
                UPDATE users
                SET password_hash = ?,
                    email = ?,
                    status = 'active'
                WHERE LOWER(username) = LOWER(?) OR LOWER(email) = LOWER(?)
                """,
                (
                    user["password_hash"],
                    user["email"],
                    user["username"],
                    user["email"],
                ),
            )
            # Commit before add_employee(), which opens its own connection --
            # otherwise this connection's still-open UPDATE transaction
            # self-deadlocks against it ("database is locked").
            conn.commit()
            if cursor.rowcount == 0:
                user["employee_id"] = generate_employee_id(hospital_id=hospital_id)
                try:
                    add_employee(user, hospital_id=hospital_id)
                except Exception as exc:
                    message = str(exc).lower()
                    if "unique constraint" in message or "duplicate key" in message:
                        continue
                    raise


def authenticate(username: str, password: str, hospital_id: Optional[int] = None):
    """Authenticate user and return rich profile or error."""
    scoped_hospital_id = hospital_id or resolve_hospital_id()
    with get_connection() as conn:
        cursor = conn.cursor()
        clean_identifier = (username or "").strip()
        try:
            cursor.execute(
                """
                SELECT u.id, u.hospital_id, u.password_hash, u.role, u.access_role, u.user_type,
                       u.module_access, u.job_role, u.full_name, u.email, u.phone, u.employee_id, u.status,
                       h.code as hospital_code, h.status as hospital_status
                FROM users u
                LEFT JOIN hospitals h ON h.id = u.hospital_id
                WHERE (LOWER(u.username) = LOWER(?) OR LOWER(u.email) = LOWER(?)) AND u.hospital_id = ?
            """,
                (clean_identifier, clean_identifier, scoped_hospital_id),
            )
        except Exception as exc:
            # Backward compatibility for stale/legacy schemas or stale runtime modules.
            msg = str(exc).lower()
            if (
                "no such column: hospital_id" in msg
                or "incorrect number of bindings supplied" in msg
            ):
                cursor.execute(
                    """
                    SELECT id, password_hash, role, access_role, job_role, user_type, module_access, full_name, email, phone, employee_id, status
                    FROM users WHERE (LOWER(username) = LOWER(?) OR LOWER(email) = LOWER(?))
                """,
                    (clean_identifier, clean_identifier),
                )
            else:
                raise
        user = cursor.fetchone()
        if not user:
            return None
        user_map = dict(user)
        if verify_password(password, user_map.get("password_hash", "")):
            if user_map.get("status") == "inactive":
                return {"error": "Account is inactive. Please contact administrator."}
            if user_map.get("hospital_status") not in (None, "active"):
                return {
                    "error": "Hospital account is disabled. Please contact administrator."
                }
            profile = resolve_user_profile(
                {
                    "username": username,
                    "role": user_map.get("role"),
                    "access_role": user_map.get("access_role"),
                    "user_type": user_map.get("user_type"),
                    "job_role": user_map.get("job_role"),
                    "module_access": user_map.get("module_access"),
                    "full_name": user_map.get("full_name"),
                    "email": user_map.get("email"),
                    "phone": user_map.get("phone"),
                    "employee_id": user_map.get("employee_id"),
                    "status": user_map.get("status"),
                    "hospital_code": user_map.get("hospital_code"),
                }
            )
            profile["id"] = user_map.get("id")
            profile["hospital_id"] = user_map.get("hospital_id") or scoped_hospital_id
            return profile
    return None


def signup_employee(
    data: dict, allow_admin_creation: bool = True, hospital_id: Optional[int] = None
) -> dict:
    """Register a new employee account."""
    scoped_hospital_id = hospital_id or resolve_hospital_id()
    password_error = validate_password(data.get("password", ""))
    if password_error:
        return {"success": False, "message": password_error}

    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute(
            "SELECT id FROM users WHERE username = ? AND hospital_id = ?",
            (data["username"], scoped_hospital_id),
        )
        if cursor.fetchone():
            return {"success": False, "message": "Username already exists"}

    employee_id = generate_employee_id(hospital_id=scoped_hospital_id)
    is_first = check_if_first_user(hospital_id=scoped_hospital_id)
    requested_user_type = normalize_user_type(
        data.get("user_type"), data.get("access_role"), data.get("role")
    )
    user_type = requested_user_type if allow_admin_creation else "normal"
    module_access = normalize_module_access(
        data.get("module_access"),
        user_type,
        data.get("access_role"),
        data.get("role"),
    )

    employee_data = {
        "username": data["username"],
        "password_hash": hash_password(data["password"]),
        "role": "employee",
        "access_role": "owner" if user_type == "admin" else "receptionist",
        "user_type": user_type,
        "module_access": module_access,
        "job_role": data.get("job_role"),
        "full_name": data.get("full_name"),
        "email": data.get("email"),
        "phone": data.get("phone"),
        "department": data.get("department"),
        "employee_id": employee_id,
        "status": "active",
        "address": data.get("address", ""),
        "emergency_contact": data.get("emergency_contact", ""),
    }

    try:
        add_employee(employee_data, hospital_id=scoped_hospital_id)
        return {
            "success": True,
            "message": f"Registration successful! Employee ID: {employee_id}",
            "is_first_user": is_first,
            "employee_id": employee_id,
            "username": data["username"],
            "user_type": user_type,
            "module_access": module_access,
        }
    except Exception as exc:  # pragma: no cover - defensive
        return {"success": False, "message": f"Registration failed: {exc}"}


def signup_hospital_admin(data: dict, hospital_id: Optional[int] = None) -> dict:
    """Create the first admin user for a hospital (one-time bootstrap)."""
    scoped_hospital_id = hospital_id or resolve_hospital_id()
    if not check_if_first_user(hospital_id=scoped_hospital_id):
        return {
            "success": False,
            "message": "Admin already configured for this hospital.",
        }

    password_error = validate_password(data.get("password", ""))
    if password_error:
        return {"success": False, "message": password_error}

    username = (data.get("username") or "").strip()
    if not username:
        return {"success": False, "message": "Username is required."}

    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute(
            "SELECT id FROM users WHERE username = ? AND hospital_id = ?",
            (username, scoped_hospital_id),
        )
        if cursor.fetchone():
            return {"success": False, "message": "Username already exists"}

    employee_id = generate_employee_id(hospital_id=scoped_hospital_id)
    employee_data = {
        "username": username,
        "password_hash": hash_password(data["password"]),
        "role": "employee",
        "access_role": "owner",
        "user_type": "admin",
        "job_role": data.get("job_role") or "Hospital Admin",
        "full_name": data.get("full_name") or "Hospital Admin",
        "email": data.get("email"),
        "phone": data.get("phone"),
        "department": data.get("department") or "Administration",
        "employee_id": employee_id,
        "status": "active",
        "address": data.get("address", ""),
        "emergency_contact": data.get("emergency_contact", ""),
    }

    try:
        add_employee(employee_data, hospital_id=scoped_hospital_id)
        return {
            "success": True,
            "message": f"Hospital admin created. Employee ID: {employee_id}",
            "employee_id": employee_id,
            "username": username,
        }
    except Exception as exc:  # pragma: no cover - defensive
        return {"success": False, "message": f"Admin setup failed: {exc}"}


def reset_hospital_admin_password(
    hospital_id: int, username: str, new_password: str
) -> dict:
    password_error = validate_password(new_password)
    if password_error:
        return {"success": False, "message": password_error}

    user_name = (username or "").strip()
    if not user_name:
        return {"success": False, "message": "Username is required."}

    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute(
            """
            SELECT id, access_role, status
            FROM users
            WHERE username = ? AND hospital_id = ?
            """,
            (user_name, hospital_id),
        )
        user = cursor.fetchone()
        if not user:
            return {"success": False, "message": "Admin account not found."}
        if user["access_role"] != "owner":
            return {
                "success": False,
                "message": "Target account is not a hospital admin.",
            }

        cursor.execute(
            "UPDATE users SET password_hash = ?, status = 'active', password_changed_at = CURRENT_TIMESTAMP WHERE id = ?",
            (hash_password(new_password), user["id"]),
        )
        cursor.execute(
            "DELETE FROM sessions WHERE user_id = ? AND hospital_id = ?",
            (user["id"], hospital_id),
        )
        conn.commit()
        return {"success": True, "message": "Admin password reset successfully."}


def check_username_exists(username: str, hospital_id: Optional[int] = None) -> bool:
    scoped_hospital_id = hospital_id or resolve_hospital_id()
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute(
            "SELECT id FROM users WHERE username = ? AND hospital_id = ?",
            (username, scoped_hospital_id),
        )
        return cursor.fetchone() is not None


def purge_expired_sessions():
    now = _format_ts(_now_utc())
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("DELETE FROM sessions WHERE expires_at <= ?", (now,))
        conn.commit()


def create_session(
    user_id: int,
    hospital_id: int,
    ip_address: Optional[str] = None,
    user_agent: Optional[str] = None,
):
    purge_expired_sessions()
    expires_at = _now_utc() + timedelta(hours=SESSION_TTL_HOURS)
    expires_at_str = _format_ts(expires_at)

    with get_connection() as conn:
        cursor = conn.cursor()
        for _attempt in range(5):
            token = secrets.token_urlsafe(32)
            token_hash = _hash_session_token(token)
            try:
                cursor.execute(
                    """
                    INSERT INTO sessions (user_id, hospital_id, token_hash, expires_at, ip_address, user_agent)
                    VALUES (?, ?, ?, ?, ?, ?)
                """,
                    (
                        user_id,
                        hospital_id,
                        token_hash,
                        expires_at_str,
                        ip_address,
                        user_agent,
                    ),
                )
                conn.commit()
                return token, expires_at
            except Exception:  # pragma: no cover - extremely rare token collisions
                conn.rollback()
                continue

    raise RuntimeError("Failed to create session")


def get_session_user(token: Optional[str]):
    if not token:
        return None

    token_hash = _hash_session_token(token)
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute(
            """
            SELECT s.id as session_id,
                   s.expires_at as expires_at,
                   s.created_at as session_created_at,
                   s.hospital_id as hospital_id,
                   u.id as user_id,
                   u.username,
                   u.role,
                   u.access_role,
                   u.job_role,
                   u.user_type,
                   u.module_access,
                   u.full_name,
                   u.email,
                   u.phone,
                   u.employee_id,
                   u.status,
                   u.password_changed_at,
                   h.code as hospital_code,
                   h.status as hospital_status
            FROM sessions s
            JOIN users u ON s.user_id = u.id AND s.hospital_id = u.hospital_id
            JOIN hospitals h ON s.hospital_id = h.id
            WHERE s.token_hash = ?
        """,
            (token_hash,),
        )
        row = cursor.fetchone()
        if not row:
            return None

        expires_at = _parse_ts(row["expires_at"])
        if expires_at <= _now_utc():
            cursor.execute("DELETE FROM sessions WHERE id = ?", (row["session_id"],))
            conn.commit()
            return None

        if row["password_changed_at"]:
            session_created_at = _parse_ts(row["session_created_at"])
            password_changed_at = _parse_ts(row["password_changed_at"])
            if session_created_at < password_changed_at:
                cursor.execute(
                    "DELETE FROM sessions WHERE id = ?", (row["session_id"],)
                )
                conn.commit()
                return None

        if row["status"] == "inactive":
            cursor.execute("DELETE FROM sessions WHERE id = ?", (row["session_id"],))
            conn.commit()
            return None

        if row["hospital_status"] != "active":
            cursor.execute("DELETE FROM sessions WHERE id = ?", (row["session_id"],))
            conn.commit()
            return None

        cursor.execute(
            "UPDATE sessions SET last_seen = CURRENT_TIMESTAMP WHERE id = ?",
            (row["session_id"],),
        )
        conn.commit()

    profile = resolve_user_profile(
        {
            "id": row["user_id"],
            "hospital_id": row["hospital_id"],
            "username": row["username"],
            "role": row["role"],
            "access_role": row["access_role"],
            "job_role": row["job_role"],
            "user_type": row["user_type"],
            "module_access": row["module_access"],
            "full_name": row["full_name"],
            "email": row["email"],
            "phone": row["phone"],
            "employee_id": row["employee_id"],
            "status": row["status"],
            "hospital_code": row["hospital_code"],
        }
    )
    # resolve_user_profile() intentionally omits internal DB ids from the client-safe
    # profile shape; re-attach them here (mirroring authenticate()) since callers like
    # current_hospital_id() and the session-management routes need them server-side.
    # Routes that jsonify this profile directly must strip "id" before responding,
    # the same way the login/setup-admin routes already do.
    profile["id"] = row["user_id"]
    profile["hospital_id"] = row["hospital_id"]
    return profile


def delete_session(token: Optional[str]):
    if not token:
        return
    token_hash = _hash_session_token(token)
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("DELETE FROM sessions WHERE token_hash = ?", (token_hash,))
        conn.commit()


def get_user_sessions(user_id: int) -> list[dict]:
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute(
            "SELECT id, created_at, last_seen, ip_address, user_agent FROM sessions WHERE user_id = ?",
            (user_id,),
        )
        cols = [d[0] for d in cursor.description]
        return [dict(zip(cols, row)) for row in cursor.fetchall()]


def delete_specific_session(session_id: int, user_id: int):
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute(
            "DELETE FROM sessions WHERE id = ? AND user_id = ?", (session_id, user_id)
        )
        conn.commit()


def delete_other_sessions(user_id: int, current_token: str):
    token_hash = _hash_session_token(current_token)
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute(
            "DELETE FROM sessions WHERE user_id = ? AND token_hash != ?",
            (user_id, token_hash),
        )
        conn.commit()


def delete_all_user_sessions(user_id: int):
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("DELETE FROM sessions WHERE user_id = ?", (user_id,))
        conn.commit()
