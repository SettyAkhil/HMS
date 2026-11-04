"""Legacy Node HRMS import: dry run rolls back, commit imports through the
normal services, a second run skips what is already there."""

import uuid

from sqlalchemy import create_engine, text

from app.db import tenant_session
from app.models import Employee
from app.security import resolve_tenant
from app.tools import migrate_legacy


def _legacy(tmp_path):
    url = f"sqlite:///{tmp_path}/legacy.db"
    eng = create_engine(url)
    with eng.begin() as c:
        c.execute(text("CREATE TABLE departments (id int, name text, code text, is_clinical bool, is_active bool)"))
        c.execute(text("CREATE TABLE employees (id int, name text, gender text, dob date, blood_group text, email text,"
                       " phone text, department text, designation text, category text, employment_type text, status text,"
                       " joining_date date, qualification text, license_number text, license_expiry date, address text,"
                       " emergency_contact_name text, emergency_contact_relation text, emergency_contact_phone text,"
                       " exit_reason text, last_working_date date)"))
        c.execute(text("INSERT INTO departments VALUES (1, 'Intensive Care', 'ICU', 1, 1), (2, 'Housekeeping', 'HK', 0, 1)"))
        c.execute(text("INSERT INTO employees VALUES "
                       "(10, 'Meena Raj', 'Female', '1990-01-01', 'O+', 'meena@example.com', '9845000001', 'Intensive Care',"
                       " 'Staff Nurse', 'Nursing', 'Full-Time', 'active', '2024-04-01', 'B.Sc Nursing', 'KNC-9', '2027-01-01',"
                       " '12 MG Road', 'Ravi', 'spouse', '9845000002', NULL, NULL),"
                       "(11, 'Old Timer', 'Male', NULL, NULL, NULL, NULL, 'Housekeeping', 'Attendant', 'Support', 'contract',"
                       " 'resigned', '2020-01-01', NULL, NULL, NULL, NULL, NULL, NULL, NULL, 'Moved city', '2025-06-30')"))
    return url


def test_dry_run_then_commit_then_rerun(tmp_path, monkeypatch):
    monkeypatch.setenv("LEGACY_DATABASE_URL", _legacy(tmp_path))
    code = f"legacy-{uuid.uuid4().hex[:6]}"
    dry = migrate_legacy.run(code, commit=False)
    assert dry["departments_created"] == 2 and dry["employees_created"] == 2 and not dry["errors"], dry["errors"]
    with tenant_session(resolve_tenant(code)) as db:
        assert db.query(Employee).count() == 0  # nothing kept
    done = migrate_legacy.run(code, commit=True)
    assert done["employees_created"] == 2 and not done["errors"], done
    with tenant_session(resolve_tenant(code)) as db:
        rows = {e.first_name: e for e in db.query(Employee)}
        assert rows["Meena"].status == "active" and rows["Meena"].employee_category == "nurse"
        assert rows["Old"].status == "terminated" and str(rows["Old"].exit_date) == "2025-06-30"
    again = migrate_legacy.run(code, commit=True)
    assert again["employees_created"] == 0 and again["employees_skipped"] == 2
