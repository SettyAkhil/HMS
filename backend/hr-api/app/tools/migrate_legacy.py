"""Import the previous Node HRMS database (frontend repo server/, Postgres
`hospai_enterprise`) into hr-api.

    docker compose run --rm --add-host host.docker.internal:host-gateway \
      -e LEGACY_DATABASE_URL=postgresql+psycopg://postgres:...@host.docker.internal:5434/hospai_enterprise \
      hr-api python -m app.tools.migrate_legacy --tenant-code hosp-default [--commit]

Dry run by default: everything runs in one transaction that is rolled back,
and the report says what would happen. Goes through the same services as the
API (create_employee, create_department ...), so every validation, audit
entry and event applies. Re-runnable: legacy ids are recorded in each
employee's history and skipped next time."""

import argparse
import os
import re
import sys
from datetime import date

from sqlalchemy import create_engine, select, text

from app.db import tenant_session
from app.models import Department, Designation, EmployeeHistory
from app.security import resolve_tenant
from app.services import employees, organization

CATEGORY_HINTS = [
    ("radiolog", "radiologist"), ("consult", "consultant"), ("doctor", "doctor"), ("physician", "doctor"),
    ("surgeon", "doctor"), ("nurs", "nurse"), ("lab", "lab_technician"), ("pharm", "pharmacist"),
    ("ot ", "ot_technician"), ("theatre", "ot_technician"), ("icu", "icu_technician"), ("emerg", "emergency_staff"),
    ("front", "front_office"), ("recep", "front_office"), ("bill", "billing"), ("admin", "administration"),
    ("house", "housekeeping"), ("secur", "security"),
]
STATUS = {"active": "active", "on_leave": "active", "inactive": "draft", "suspended": "suspended",
          "resigned": "terminated", "terminated": "terminated", "exited": "terminated"}
EMPLOYMENT = {"full-time": "permanent", "full_time": "permanent", "permanent": "permanent", "contract": "contract",
              "probation": "probation", "intern": "intern", "part-time": "part_time", "part_time": "part_time",
              "visiting": "visiting"}


def category(*texts) -> str:
    blob = " ".join(t or "" for t in texts).lower() + " "
    for hint, cat in CATEGORY_HINTS:
        if hint in blob:
            return cat
    return "support"


def as_date(value) -> date | None:
    """Legacy dates may come back as date objects or as text."""
    if value in (None, ""):
        return None
    if isinstance(value, date):
        return value
    return date.fromisoformat(str(value)[:10])


def code_for(name: str, taken: set[str]) -> str:
    base = re.sub(r"[^A-Z0-9]", "", (name or "X").upper())[:12] or "X"
    code, n = base, 1
    while code in taken:
        n += 1
        code = f"{base[:10]}{n}"
    taken.add(code)
    return code


def run(tenant_code: str, commit: bool) -> dict:
    legacy = create_engine(os.environ["LEGACY_DATABASE_URL"])
    with legacy.connect() as conn:
        depts = conn.execute(text("SELECT id, name, code, is_clinical, is_active FROM departments")).mappings().all()
        emps = conn.execute(text("SELECT * FROM employees ORDER BY id")).mappings().all()
    report = {"departments_created": 0, "designations_created": 0, "employees_created": 0, "employees_skipped": 0,
              "errors": []}
    tenant_id = resolve_tenant(tenant_code)
    with tenant_session(tenant_id) as db:
        db.info["actor"] = "migration:legacy-hrms"
        dept_by_name = {d.name.lower(): d for d in db.scalars(select(Department).where(Department.deleted_at.is_(None)))}
        codes = {d.code for d in dept_by_name.values()}
        for d in depts:
            if d["name"].lower() in dept_by_name:
                continue
            dept = organization.create_department(db, {
                "code": code_for(d["code"] or d["name"], codes), "name": d["name"],
                "kind": "clinical" if d["is_clinical"] else "support"})
            dept_by_name[d["name"].lower()] = dept
            report["departments_created"] += 1
        des_by_title = {x.title.lower(): x for x in db.scalars(select(Designation).where(Designation.deleted_at.is_(None)))}
        des_codes = {x.code for x in des_by_title.values()}
        migrated = {str((h.details or {}).get("legacy_id")) for h in db.scalars(
            select(EmployeeHistory).where(EmployeeHistory.event_type == "migrated"))}
        for e in emps:
            if str(e["id"]) in migrated:
                report["employees_skipped"] += 1
                continue
            savepoint = db.begin_nested()  # one bad row never takes the others with it
            try:
                title = (e.get("designation") or "").strip()
                des = None
                if title:
                    des = des_by_title.get(title.lower())
                    if des is None:
                        des = organization.create_designation(db, {
                            "code": code_for(title, des_codes), "title": title,
                            "job_category": category(title, e.get("category")), "is_clinical": False,
                            "requires_registration": False})
                        des_by_title[title.lower()] = des
                        report["designations_created"] += 1
                parts = (e["name"] or "Unknown").split()
                dept = dept_by_name.get((e.get("department") or "").lower())
                status = STATUS.get((e.get("status") or "active").lower(), "draft")
                data = {
                    "first_name": parts[0], "last_name": " ".join(parts[1:]) or None,
                    "gender": (e.get("gender") or "").lower() if (e.get("gender") or "").lower() in ("male", "female", "other") else None,
                    "date_of_birth": as_date(e.get("dob")), "email": e.get("email") or None, "phone": e.get("phone") or None,
                    "address_line": e.get("address") or None,
                    "employee_category": category(e.get("category"), title),
                    "employment_type": EMPLOYMENT.get((e.get("employment_type") or "").lower(), "permanent"),
                    "joining_date": as_date(e.get("joining_date")) or date.today(), "designation_id": des.id if des else None,
                    "departments": [{"department_id": dept.id, "is_primary": True, "unit_id": None,
                                     "allocation_percent": 100}] if dept else [],
                    "contacts": [{"kind": "emergency", "name": e["emergency_contact_name"],
                                  "relationship": e.get("emergency_contact_relation"),
                                  "phone": e.get("emergency_contact_phone"), "email": None}]
                    if e.get("emergency_contact_name") else [],
                    "credentials": [{"credential_type": "licence", "number": e["license_number"],
                                     "issuing_authority": None, "issued_on": None, "expires_on": as_date(e.get("license_expiry"))}]
                    if e.get("license_number") else [],
                    "profile": {"qualification": e.get("qualification"), "blood_group": e.get("blood_group") or None},
                    "activate": status == "active",
                }
                emp = employees.create_employee(db, data)
                if status in ("suspended", "terminated"):
                    employees.change_status(db, emp.id, "activate", "Migrated", emp.joining_date)
                    employees.change_status(db, emp.id, "suspend" if status == "suspended" else "terminate",
                                            e.get("exit_reason") or "Migrated from previous HRMS",
                                            as_date(e.get("last_working_date")) if status == "terminated" else None)
                db.add(EmployeeHistory(tenant_id=tenant_id, employee_id=emp.id, event_type="migrated",
                                       summary="Imported from the previous HRMS", details={"legacy_id": e["id"]},
                                       created_by="migration:legacy-hrms"))
                savepoint.commit()
                report["employees_created"] += 1
            except Exception as exc:  # report the row and keep going
                savepoint.rollback()
                report["errors"].append({"legacy_id": e["id"], "name": e.get("name"), "error": str(exc)[:300]})
        if not commit:
            db.rollback()
    report["mode"] = "committed" if commit else "dry run (rolled back)"
    report["legacy_rows"] = {"departments": len(depts), "employees": len(emps)}
    return report


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--tenant-code", required=True)
    ap.add_argument("--commit", action="store_true")
    args = ap.parse_args()
    report = run(args.tenant_code, args.commit)
    for k, v in report.items():
        print(f"{k}: {v}")
    return 1 if report["errors"] else 0


if __name__ == "__main__":
    sys.exit(main())
