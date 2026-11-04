"""Seed a realistic demo hospital into one tenant, through the same services
the API uses (so every rule, audit entry, event and calculation applies).

    docker compose exec hr-api python -m app.tools.seed_demo --tenant-code hosp-default

Everything is labelled as demo data: the eSSL integration is a `simulator`,
statutory settings say "DEMO VALUES", the hospital is "(Demo)". Remove it by
truncating the tenant's HR tables (see README §10). Refuses to run on a
tenant that already has employees, so it can never mix with real records.

What it creates: 2 branches, 13 departments, 18 designations, ~60 staff with
managers and credentials (some expiring), 4 shifts, 5 weeks of published
rosters (rotations for clinical units), biometric punches with realistic
lateness / absence / missing punches / overtime -> calculated attendance,
leave types, policies and requests (approved and pending), overtime
approvals, payroll setup and a finalized October run, recruitment pipeline,
training with certificates, a review cycle, staffing requirements,
announcements, grievances, holidays and a compliance scan."""

import argparse
import random
import sys
import uuid
from datetime import date, datetime, time, timedelta
from decimal import Decimal
from zoneinfo import ZoneInfo

from sqlalchemy import func, select

from app.config import settings
from app.db import tenant_session
from app.models import Employee
from app.models.workforce import OvertimeRecord, ShiftTemplate
from app.providers import PunchRecord
from app.security import Principal, resolve_tenant
from app.services import (
    attendance, attendance_engine, attendance_ops, employees, leave, organization, payroll, recruitment, selfservice, shifts,
    staffing, talent, workflow,
)
from app.services.punch_ingestion import ingest

R = random.Random(20261102)
TZ = ZoneInfo(settings.timezone)
TODAY = datetime.now(TZ).date()
START = TODAY - timedelta(days=35)

FIRST_F = ["Ananya", "Kavya", "Meera", "Divya", "Lakshmi", "Priya", "Sneha", "Pooja", "Deepa", "Asha", "Revathi",
           "Shalini", "Nandini", "Sowmya", "Fathima", "Jyothi", "Bhavana", "Rekha", "Swathi", "Harini", "Neha", "Anjali"]
FIRST_M = ["Arjun", "Rahul", "Vikram", "Suresh", "Karthik", "Manoj", "Rohan", "Imran", "Prakash", "Naveen", "Sanjay",
           "Ravi", "Ajay", "Kiran", "Mohan", "Abdul", "Harish", "Ganesh", "Varun", "Santosh", "Joseph", "Dinesh"]
LAST = ["Iyer", "Rao", "Reddy", "Nair", "Sharma", "Hegde", "Kumar", "Menon", "Shetty", "Gowda", "Pillai", "Joshi",
        "Patil", "Kulkarni", "Naidu", "Fernandes", "Khan", "Das", "Bhat", "Varghese", "Krishnan", "Murthy"]

DEPTS = [  # code, name, kind, hms_module, branch
    ("ER", "Emergency & Trauma", "clinical", "er", "BLR"), ("ICU", "Intensive Care Unit", "clinical", "icu", "BLR"),
    ("OT", "Operation Theatres", "clinical", "ot", "BLR"), ("GMED", "General Medicine (OP)", "clinical", "op", "BLR"),
    ("WARD", "Inpatient Wards", "clinical", "ip", "BLR"), ("RAD", "Radiology", "diagnostic", "radiology", "BLR"),
    ("LAB", "Laboratory", "diagnostic", "laboratory", "BLR"), ("PHAR", "Pharmacy", "support", "pharmacy", "BLR"),
    ("FO", "Front Office", "administrative", "admin", "BLR"), ("BILL", "Billing & Accounts", "administrative", "admin", "BLR"),
    ("HK", "Housekeeping", "support", "admin", "BLR"), ("SEC", "Security", "support", "admin", "BLR"),
    ("MYS-OP", "Mysuru Outpatient Clinic", "clinical", "op", "MYS"),
]
DESIGNATIONS = [  # code, title, category, clinical, needs registration
    ("CONS", "Consultant Physician", "consultant", True, True), ("SR", "Senior Resident", "doctor", True, True),
    ("MO", "Medical Officer", "doctor", True, True), ("ANES", "Consultant Anaesthetist", "consultant", True, True),
    ("RADC", "Consultant Radiologist", "radiologist", True, True), ("NS", "Nursing Superintendent", "nurse", True, True),
    ("SN", "Staff Nurse", "nurse", True, True), ("SSN", "Senior Staff Nurse", "nurse", True, True),
    ("ICUT", "ICU Technician", "icu_technician", True, False), ("OTT", "OT Technician", "ot_technician", True, False),
    ("LABT", "Lab Technician", "lab_technician", True, False), ("RADT", "Radiographer", "lab_technician", True, False),
    ("PHM", "Pharmacist", "pharmacist", True, True), ("EMT", "Emergency Medical Technician", "emergency_staff", True, False),
    ("FOE", "Front Office Executive", "front_office", False, False), ("BEX", "Billing Executive", "billing", False, False),
    ("HKS", "Housekeeping Staff", "housekeeping", False, False), ("SG", "Security Guard", "security", False, False),
]
STAFF = {  # department: [(designation, count)] -- the first row heads the department
    "ICU": [("CONS", 1), ("SSN", 2), ("SN", 6), ("ICUT", 2)],
    "ER": [("CONS", 1), ("MO", 2), ("SN", 4), ("EMT", 3)],
    "OT": [("ANES", 1), ("SR", 1), ("SN", 2), ("OTT", 3)],
    "GMED": [("CONS", 2), ("SR", 1), ("SN", 2)],
    "WARD": [("NS", 1), ("SSN", 1), ("SN", 5)],
    "RAD": [("RADC", 1), ("RADT", 2)],
    "LAB": [("LABT", 4)],
    "PHAR": [("PHM", 3)],
    "FO": [("FOE", 3)],
    "BILL": [("BEX", 2)],
    "HK": [("HKS", 4)],
    "SEC": [("SG", 3)],
    "MYS-OP": [("MO", 1), ("SN", 1), ("FOE", 1)],
}
ROTATING = {"ICU", "ER", "WARD", "SEC"}
PAY = {"consultant": 180000, "doctor": 95000, "radiologist": 160000, "nurse": 32000, "icu_technician": 28000,
       "ot_technician": 27000, "lab_technician": 26000, "pharmacist": 30000, "emergency_staff": 25000,
       "front_office": 22000, "billing": 24000, "housekeeping": 15000, "security": 16000}


class Seeder:
    def __init__(self, db, tenant_id):
        self.db, self.tenant_id = db, tenant_id
        self.hr = Principal(username="demo.hr.manager", display_name="Demo HR Manager", tenant_id=tenant_id,
                            tenant_code="", is_admin=True)
        self.names: set[str] = set()

    def name(self, female: bool) -> tuple[str, str]:
        while True:
            f = R.choice(FIRST_F if female else FIRST_M)
            l = R.choice(LAST)
            if (f, l) not in self.names:
                self.names.add((f, l))
                return f, l

    def approve(self, inst_id):
        inst = workflow.act(self.db, inst_id, self.hr, "approve", "Approved (demo)")
        while inst.status == "pending":
            inst = workflow.act(self.db, inst_id, self.hr, "approve", "Approved (demo)")

    def run(self) -> dict:
        db = self.db
        out = {}
        hosp = organization.create_hospital(db, {"code": "HOSPAI", "name": "HospAI Multispeciality Hospital (Demo)"})
        branches = {
            "BLR": organization.create_branch(db, {"hospital_id": hosp.id, "code": "BLR", "name": "Bengaluru – Main Campus", "city": "Bengaluru"}),
            "MYS": organization.create_branch(db, {"hospital_id": hosp.id, "code": "MYS", "name": "Mysuru Clinic", "city": "Mysuru"}),
        }
        depts = {}
        for code, name, kind, module, br in DEPTS:
            depts[code] = organization.create_department(db, {"code": code, "name": name, "kind": kind, "hms_module": module,
                                                              "branch_id": branches[br].id, "cost_center": f"CC-{code}"})
        icu_units = [organization.create_unit(db, {"department_id": depts["ICU"].id, "code": c, "name": n, "unit_type": "bay",
                                                   "bed_capacity": b}) for c, n, b in (("MICU", "Medical ICU", 10), ("SICU", "Surgical ICU", 8))]
        des = {c: organization.create_designation(db, {"code": c, "title": t, "job_category": cat, "is_clinical": cl,
                                                       "requires_registration": reg})
               for c, t, cat, cl, reg in DESIGNATIONS}

        # staff
        staff: dict[str, list[Employee]] = {}
        all_emps: list[Employee] = []
        n = 0
        for dcode, rows in STAFF.items():
            dept = depts[dcode]
            staff[dcode] = []
            head = None
            for dcode_des, count in rows:
                d = des[dcode_des]
                for _ in range(count):
                    n += 1
                    female = d.job_category == "nurse" or R.random() < 0.45
                    first, last = self.name(female)
                    joined = TODAY - timedelta(days=R.randint(90, 3000))
                    creds = []
                    if d.requires_registration:
                        council = {"nurse": ("nursing_registration", "Karnataka State Nursing Council", "KNC"),
                                   "pharmacist": ("pharmacy_registration", "Karnataka State Pharmacy Council", "KSPC")}.get(
                            d.job_category, ("medical_registration", "Karnataka Medical Council", "KMC"))
                        roll = R.random()
                        expiry = (TODAY + timedelta(days=R.randint(8, 25)) if roll < 0.08 else
                                  TODAY + timedelta(days=R.randint(30, 58)) if roll < 0.16 else
                                  TODAY + timedelta(days=R.randint(200, 1500)))
                        creds = [{"credential_type": council[0], "number": f"{council[2]}-{R.randint(10000, 99999)}",
                                  "issuing_authority": council[1], "issued_on": joined - timedelta(days=400), "expires_on": expiry}]
                    emp = employees.create_employee(db, {
                        "first_name": first, "last_name": last, "gender": "female" if female else "male",
                        "date_of_birth": TODAY - timedelta(days=R.randint(23 * 365, 55 * 365)),
                        "email": f"{first}.{last}.{n}@demo-hospai.in".lower(), "phone": f"+91 9{R.randint(100000000, 999999999)}",
                        "city": dept.name and ("Mysuru" if dcode == "MYS-OP" else "Bengaluru"), "state": "Karnataka",
                        "employee_category": d.job_category, "employment_type": R.choice(["permanent"] * 6 + ["contract", "probation"]),
                        "contract_end_date": TODAY + timedelta(days=R.randint(20, 400)), "joining_date": joined,
                        "branch_id": dept.branch_id, "designation_id": d.id, "reporting_manager_id": head.id if head else None,
                        "departments": [{"department_id": dept.id, "is_primary": True, "allocation_percent": 100,
                                         "unit_id": R.choice(icu_units).id if dcode == "ICU" else None}],
                        "contacts": [{"kind": "emergency", "name": f"{R.choice(FIRST_M + FIRST_F)} {last}",
                                      "relationship": R.choice(["spouse", "parent", "sibling"]), "phone": f"+91 8{R.randint(100000000, 999999999)}", "email": None}],
                        "credentials": creds,
                        "profile": {"qualification": {"nurse": "B.Sc Nursing", "consultant": "MD", "doctor": "MBBS",
                                                      "radiologist": "MD Radiology", "pharmacist": "B.Pharm"}.get(d.job_category),
                                    "specialization": "Critical care" if dcode == "ICU" and d.is_clinical else None,
                                    "clinical_competencies": (["BLS", "ACLS", "Ventilator"] if dcode == "ICU" else ["BLS"]) if d.is_clinical else [],
                                    "languages": ["Kannada", "English"] + (["Hindi"] if R.random() < 0.5 else [])},
                        "activate": True,
                    })
                    if emp.employment_type != "contract":
                        emp.contract_end_date = None
                    if head is None:
                        head = emp
                        organization.update_department(db, dept.id, {"head_employee_id": emp.id})
                    staff[dcode].append(emp)
                    all_emps.append(emp)
        # The demo "nurse" login (backend user `staff`) is an ICU staff nurse.
        demo_nurse = next(e for e in staff["ICU"] if e.designation_id == des["SN"].id)
        employees.update_employee(db, demo_nurse.id, {"hms_username": "staff"})
        out["employees"] = len(all_emps)

        # shifts, holidays
        t = {c: ShiftTemplate(tenant_id=self.tenant_id, created_by="demo-seed", **kw) for c, kw in {
            "M": dict(code="M", name="Morning", kind="morning", start_time=time(7), end_time=time(14), break_minutes=30,
                      full_day_minutes=360, half_day_minutes=180, color="#007078"),
            "E": dict(code="E", name="Evening", kind="evening", start_time=time(14), end_time=time(21), break_minutes=30,
                      full_day_minutes=360, half_day_minutes=180, color="#0E7490"),
            "N": dict(code="N", name="Night", kind="night", start_time=time(21), end_time=time(7), break_minutes=45,
                      full_day_minutes=540, half_day_minutes=270, is_night=True, color="#582C5F"),
            "G": dict(code="G", name="General", kind="general", start_time=time(9), end_time=time(17), break_minutes=30,
                      full_day_minutes=420, half_day_minutes=240, color="#64748B"),
        }.items()}
        db.add_all(t.values())
        db.flush()
        for d, nm in ((date(2026, 10, 2), "Gandhi Jayanti"), (date(2026, 10, 20), "Dussehra"),
                      (date(2026, 11, 1), "Kannada Rajyotsava"), (date(2026, 11, 8), "Deepavali"),
                      (date(2026, 12, 25), "Christmas")):
            shifts.create_holiday(db, {"holiday_date": d, "name": nm})

        # rosters: 5 weeks back, 2 forward
        plan_end = TODAY + timedelta(days=13)
        pattern = ["M", "M", "E", "E", "N", "N", "OFF", "OFF"]
        assignments: dict[uuid.UUID, dict[date, str]] = {}
        for dcode, emps in staff.items():
            d0 = START
            while d0 <= plan_end:
                d1 = min(d0 + timedelta(days=27), plan_end)
                roster = shifts.create_roster(db, {"department_id": depts[dcode].id, "period_start": d0, "period_end": d1})
                cells = []
                for i, e in enumerate(emps):
                    for k in range((d1 - d0).days + 1):
                        day = d0 + timedelta(days=k)
                        if dcode in ROTATING:
                            code = pattern[((day - START).days + i * 2) % len(pattern)]
                        elif dcode == "OT":
                            code = "OFF" if day.weekday() == 6 else ("M" if i % 2 == 0 else "E")
                        else:
                            code = "OFF" if day.weekday() == 6 else "G"
                        assignments.setdefault(e.id, {})[day] = code
                        cells.append({"employee_id": e.id, "work_date": day, "shift_template_id": None if code == "OFF" else t[code].id,
                                      "is_weekly_off": code == "OFF"})
                shifts.set_assignments(db, roster["id"], cells)
                shifts.publish_roster(db, roster["id"])
                d0 = d1 + timedelta(days=1)
        out["rosters"] = "published"

        # biometric integration, devices, mappings, punches
        integ = attendance.create_integration(db, {"name": "Demo eSSL (simulator)", "provider": "simulator",
                                                   "base_url": "sim://?pins=demo", "poll_interval_seconds": 86400, "enabled": False})
        integ.capabilities = {"operations": ["GetTransactionsLog"], "product": "simulator", "verified_at": datetime.now(TZ).isoformat()}
        devs = [attendance.create_device(db, {"integration_id": integ.id, "serial_number": s, "name": nm, "location": loc,
                                              "branch_id": branches[b].id}) for s, nm, loc, b in (
            ("CJDE224460001", "Main gate", "Ground floor lobby", "BLR"), ("CJDE224460002", "ICU entrance", "2nd floor", "BLR"),
            ("CJDE224460003", "Staff entry – Mysuru", "Reception", "MYS"))]
        for dv in devs:
            dv.status, dv.last_seen_at = "online", datetime.now(TZ)
        pins = {}
        for i, e in enumerate(all_emps):
            pins[e.id] = str(1001 + i)
            attendance.create_mapping(db, {"integration_id": integ.id, "employee_id": e.id, "device_user_id": pins[e.id],
                                           "effective_from": e.joining_date})
        now = datetime.now(TZ)
        records = []
        for e in all_emps:
            serial = devs[2].serial_number if e.branch_id == branches["MYS"].id else (
                devs[1].serial_number if any(e in staff[k] for k in ("ICU",)) else devs[0].serial_number)
            habit = R.random()  # some staff are habitually late
            for day, code in assignments[e.id].items():
                if day > TODAY or code == "OFF":
                    continue
                tmpl = t[code]
                s = datetime.combine(day, tmpl.start_time, TZ)
                end = datetime.combine(day + timedelta(days=1) if tmpl.end_time <= tmpl.start_time else day, tmpl.end_time, TZ)
                if R.random() < 0.04:
                    continue  # absent
                late = R.randint(12, 45) if R.random() < (0.25 if habit > 0.85 else 0.07) else R.randint(-15, 8)
                arrive = s + timedelta(minutes=late, seconds=R.randint(0, 59))
                stamps = [arrive]
                if tmpl.code == "G" and R.random() < 0.5:  # lunch out and back
                    lunch = s + timedelta(hours=4, minutes=R.randint(0, 20))
                    stamps += [lunch, lunch + timedelta(minutes=R.randint(25, 40))]
                ot = R.randint(45, 150) if R.random() < 0.08 else 0
                leave_at = end + timedelta(minutes=ot + R.randint(-5, 12), seconds=R.randint(0, 59))
                if R.random() > 0.04 and leave_at <= now:
                    stamps.append(leave_at)
                if R.random() < 0.03:
                    stamps.append(arrive + timedelta(seconds=20))  # double tap on the reader
                for st in stamps:
                    if st <= now:
                        local = st.astimezone(TZ).replace(tzinfo=None)
                        records.append(PunchRecord(pins[e.id], local, serial, f"{pins[e.id]}\t{local:%Y-%m-%d %H:%M:%S}\t0"))
        sync_log = None
        result = ingest(db, integ, records, sync_log)
        out["punches"] = result["inserted"]

        # leave
        types = {c: leave.create_type(db, kw) for c, kw in {
            "CL": dict(code="CL", name="Casual leave", max_consecutive_days=3, color="#0E7490"),
            "SL": dict(code="SL", name="Sick leave", document_required_after_days=2, is_emergency=True, color="#B45309"),
            "EL": dict(code="EL", name="Earned leave", allow_half_day=False, color="#007078"),
            "LOP": dict(code="LOP", name="Loss of pay", paid=False, allow_negative_balance=True, color="#64748B"),
            "ML": dict(code="ML", name="Maternity leave", gender="female", allow_half_day=False, color="#582C5F"),
        }.items()}
        # Maternity leave is granted when needed (balance adjustment), not banked every year.
        for c, alloc, accr, cf in (("CL", 12, "annual", 0), ("SL", 12, "annual", 6), ("EL", 18, "monthly", 30)):
            leave.create_policy(db, {"leave_type_id": types[c].id, "annual_allocation": Decimal(alloc), "accrual": accr,
                                     "carry_forward_max": Decimal(cf), "min_service_days": 0,
                                     "effective_from": date(2026, 1, 1)})
        leave.run_monthly_accrual(db, TODAY.year, TODAY.month)
        lv_count = 0
        pool = [e for e in all_emps if e.id != demo_nurse.id]
        R.shuffle(pool)
        for e in pool[:14]:  # past, approved
            d0 = TODAY - timedelta(days=R.randint(3, 30))
            lt = R.choice(["CL", "SL", "SL", "EL"])
            try:
                req = leave.apply(db, {"employee_id": e.id, "leave_type_id": types[lt].id, "start_date": d0,
                                       "end_date": d0 + timedelta(days=R.randint(0, 1)), "reason": R.choice(
                                           ["Fever", "Family function", "Child unwell", "Personal work", "Medical appointment"]),
                                       "emergency": lt == "SL", "document_id": None}, "demo.hr.coordinator", on_behalf=True)
                self.approve(req.approval_instance_id)
                lv_count += 1
            except Exception:
                pass  # e.g. the date was a weekly off / holiday only
        for e in pool[14:20]:  # future, waiting for approval
            d0 = TODAY + timedelta(days=R.randint(4, 20))
            try:
                leave.apply(db, {"employee_id": e.id, "leave_type_id": types["CL"].id, "start_date": d0, "end_date": d0 + timedelta(days=1),
                                 "reason": R.choice(["Sister's wedding", "Hometown visit", "House shifting"]), "emergency": False,
                                 "document_id": None}, "demo.hr.coordinator", on_behalf=True)
                lv_count += 1
            except Exception:
                pass
        out["leave_requests"] = lv_count

        # overtime: approve most detected overtime
        for ot in db.scalars(select(OvertimeRecord).where(OvertimeRecord.status == "pending")).all():
            if R.random() < 0.75:
                o = attendance_ops.submit_overtime(db, ot.id, "demo.hr.coordinator")
                self.approve(o.approval_instance_id)

        # staffing requirements
        for dcode, cat, shift_code, mn, ratio in (("ICU", "nurse", "N", 3, Decimal("2")), ("ICU", "nurse", "M", 3, Decimal("2")),
                                                  ("ER", "nurse", None, 2, None), ("ER", "doctor", None, 1, None), ("WARD", "nurse", "N", 2, Decimal("8"))):
            staffing.create_requirement(db, {"department_id": depts[dcode].id, "employee_category": cat, "min_count": mn,
                                             "shift_template_id": t[shift_code].id if shift_code else None,
                                             "patients_per_staff": ratio, "effective_from": date(2026, 1, 1)})

        # payroll
        for code, nm, pf in (("BASIC", "Basic pay", True), ("HRA", "House rent allowance", False),
                             ("CONV", "Conveyance", False), ("SPECIAL", "Special allowance", False)):
            payroll.create_component(db, {"code": code, "name": nm, "kind": "earning", "pf_wage": pf, "prorate": True, "taxable": True})
        structure = payroll.create_structure(db, {"code": "STD", "name": "Standard structure", "lines": [
            {"component": "BASIC", "calc": "percent_of_ctc", "value": 40}, {"component": "HRA", "calc": "percent_of_basic", "value": 40},
            {"component": "CONV", "calc": "fixed", "value": 1600}, {"component": "SPECIAL", "calc": "balance", "value": None}]})
        note = "DEMO VALUES for illustration — replace with the rates in force before running real payroll"
        payroll.save_config(db, "pf", {"employee_rate": 12, "employer_rate": 12, "wage_ceiling": 15000, "apply_ceiling": True}, date(2026, 1, 1), note)
        payroll.save_config(db, "esi", {"employee_rate": 0.75, "employer_rate": 3.25, "gross_ceiling": 21000}, date(2026, 1, 1), note)
        payroll.save_config(db, "pt", {"states": {"KA": [{"min": 0, "max": 24999.99, "amount": 0}, {"min": 25000, "max": None, "amount": 200}]}}, date(2026, 1, 1), note)
        payroll.save_config(db, "overtime", {"multiplier": 2, "hours_per_day": 8, "night_allowance_per_shift": 150}, date(2026, 1, 1), note)
        for e in all_emps:
            gross = Decimal(PAY[e.employee_category]) * Decimal(R.choice([0.9, 1, 1, 1.1, 1.2]))
            payroll.set_compensation(db, e.id, {"structure_id": structure.id, "monthly_gross": gross.quantize(Decimal("1")),
                                                "effective_from": max(e.joining_date, date(2026, 1, 1)), "pf_enabled": True,
                                                "esi_enabled": gross <= 21000, "pt_state": "KA",
                                                "bank_account": f"{R.randint(10**11, 10**12 - 1)}", "bank_ifsc": "HDFC0001234",
                                                "bank_name": "HDFC Bank", "uan": f"10{R.randint(10**9, 10**10 - 1)}"})
        last_month = (TODAY.replace(day=1) - timedelta(days=1))
        payroll.create_loan(db, {"employee_id": pool[0].id, "kind": "advance", "principal": Decimal(15000), "installment": Decimal(5000),
                                 "start_year": last_month.year, "start_month": last_month.month, "reason": "Medical emergency at home"})
        payroll.create_adjustment(db, {"employee_id": staff["ICU"][1].id, "year": last_month.year, "month": last_month.month,
                                       "kind": "earning", "code": "INCENTIVE", "amount": Decimal(3000), "reason": "ICU night-cover incentive"})
        run = payroll.create_run(db, last_month.year, last_month.month, None)
        payroll.calculate(db, run.id)
        if not run.totals.get("errors"):
            payroll.submit(db, run.id, "demo.hr.coordinator")
            self.approve(run.approval_instance_id)
            payroll.finalize(db, run.id, None)
        out["payroll"] = f"{run.code} {run.status}, net ₹{run.totals.get('net')}"

        # recruitment
        req = recruitment.create_requisition(db, {"department_id": depts["ICU"].id, "designation_id": des["SN"].id,
                                                  "branch_id": branches["BLR"].id, "positions": 3, "employment_type": "permanent",
                                                  "justification": "Two resignations and a new 8-bed surgical ICU bay opening next month",
                                                  "replacing_employee_id": None}, "demo.hr.coordinator")
        self.approve(req.approval_instance_id)
        req2 = recruitment.create_requisition(db, {"department_id": depts["LAB"].id, "designation_id": des["LABT"].id,
                                                   "branch_id": branches["BLR"].id, "positions": 1, "employment_type": "contract",
                                                   "justification": "Night-shift sample processing backlog", "replacing_employee_id": None},
                                              "demo.hr.coordinator")
        vac = recruitment.create_vacancy(db, {"requisition_id": req.id, "title": "Staff Nurse – ICU", "openings": 3,
                                              "description": "Registered nurse for a 24-bed ICU. Ventilator and central-line care, rotating shifts.",
                                              "requirements": "B.Sc Nursing, KNC registration, 2+ years ICU, BLS/ACLS", "closes_on": TODAY + timedelta(days=21)})
        stages = ["applied", "applied", "screening", "interview", "interview", "selected", "offered", "rejected"]
        for i, stage in enumerate(stages):
            first, last = self.name(True)
            cand = recruitment.create_candidate(db, {"first_name": first, "last_name": last, "email": f"{first}.{last}.c{i}@example.com".lower(),
                                                     "phone": f"+91 7{R.randint(100000000, 999999999)}", "source": R.choice(["Referral", "Naukri", "Hospital website", "Walk-in"]),
                                                     "experience_years": Decimal(R.randint(1, 9)), "qualification": "B.Sc Nursing", "current_employer": R.choice(["Manipal", "Narayana", "Apollo", "Fortis", None])})
            app_ = recruitment.apply(db, vac.id, cand.id)
            if stage in ("screening", "interview", "selected", "offered"):
                recruitment.move(db, app_.id, "screening", None)
            if stage in ("interview", "selected", "offered"):
                iv = recruitment.schedule_interview(db, {"application_id": app_.id, "round_name": "Clinical skills",
                                                         "scheduled_at": datetime.now(TZ) + timedelta(days=R.randint(1, 5)), "mode": "in_person",
                                                         "interviewers": ["icu.head"]})
                if stage != "interview":
                    recruitment.record_feedback(db, iv.id, {"rating": 4, "recommendation": "hire", "feedback": "Confident with ventilated patients"}, "x", True)
            if stage in ("selected", "offered"):
                recruitment.move(db, app_.id, "selected", None)
            if stage == "offered":
                o = recruitment.create_offer(db, {"application_id": app_.id, "offered_gross": Decimal(34000),
                                                  "joining_date": TODAY + timedelta(days=15), "expires_on": TODAY + timedelta(days=6), "terms": None})
                recruitment.respond_offer(db, o.id, "accepted")
                for task in recruitment.onboarding(db, app_.id)[:2]:
                    recruitment.update_task(db, task.id, "done", None)
            if stage == "rejected":
                recruitment.move(db, app_.id, "rejected", "Less than one year of ICU experience")
        out["recruitment"] = "2 requisitions, 1 vacancy, 8 candidates"
        out["requisitions_pending"] = req2.code

        # training
        progs = {c: talent.create_program(db, kw) for c, kw in {
            "BLS": dict(code="BLS", title="Basic Life Support", category="bls", validity_months=24, mandatory_for=["nurse", "doctor", "consultant", "emergency_staff", "icu_technician"], pass_score=80),
            "ACLS": dict(code="ACLS", title="Advanced Cardiac Life Support", category="acls", validity_months=24, mandatory_for=["consultant", "doctor"], pass_score=84),
            "FIRE": dict(code="FIRE", title="Fire Safety & Evacuation", category="fire_safety", validity_months=12, mandatory_for=["all"]),
            "IPC": dict(code="IPC", title="Infection Prevention & Control", category="infection_control", validity_months=12, mandatory_for=["nurse", "housekeeping", "icu_technician", "ot_technician"]),
        }.items()}
        for code, p in progs.items():
            for e in all_emps:
                applies = "all" in p.mandatory_for or e.employee_category in p.mandatory_for
                if not applies or R.random() < 0.12:
                    continue  # leaves real gaps in the matrix
                issued = TODAY - timedelta(days=R.randint(20, (p.validity_months or 12) * 30 - 5))
                if R.random() < 0.08:
                    issued = TODAY - timedelta(days=(p.validity_months or 12) * 30 - R.randint(5, 40))  # expiring soon
                talent.add_certification(db, {"employee_id": e.id, "program_id": p.id, "certificate_number": f"{code}-{R.randint(1000, 9999)}",
                                              "issued_on": issued, "expires_on": None})
        s = talent.create_session(db, {"program_id": progs["BLS"].id, "starts_at": datetime.combine(TODAY + timedelta(days=6), time(9), TZ),
                                       "ends_at": datetime.combine(TODAY + timedelta(days=6), time(15), TZ), "location": "Skills lab, 3rd floor",
                                       "trainer": "AHA-certified instructor", "capacity": 20})
        talent.enroll(db, s.id, [e.id for e in all_emps if e.employee_category == "nurse"][:12])

        # performance
        cycle = talent.create_cycle(db, {"name": "FY 2026-27 · H1 review", "period_start": date(2026, 4, 1), "period_end": date(2026, 9, 30),
                                         "rating_scale": 5, "criteria": {
            "default": [{"code": "quality", "label": "Quality of work", "weight": 40}, {"code": "teamwork", "label": "Teamwork", "weight": 30},
                        {"code": "reliability", "label": "Reliability & attendance", "weight": 30}],
            "nurse": [{"code": "care", "label": "Patient care & safety", "weight": 40}, {"code": "documentation", "label": "Clinical documentation", "weight": 20},
                      {"code": "teamwork", "label": "Teamwork", "weight": 20}, {"code": "reliability", "label": "Reliability & attendance", "weight": 20}]}})
        talent.launch_cycle(db, cycle.id)
        talent.create_goal(db, {"cycle_id": cycle.id, "department_id": depts["ICU"].id, "title": "Central-line infection rate below 1 per 1,000 line-days",
                                "target": "< 1.0", "weight": 30})
        talent.create_goal(db, {"cycle_id": cycle.id, "department_id": depts["ER"].id, "title": "Door-to-doctor time under 10 minutes", "target": "≤ 10 min", "weight": 30})

        # announcements & grievances
        for title, body, prio, aud in (
            ("Deepavali holiday roster", "Rosters for 7–9 November are published. Swap requests close on 5 November.", "important", {"all": True}),
            ("BLS refresher – skills lab", f"Nurses due for BLS renewal: session on {TODAY + timedelta(days=6):%d %b}, 9 am. Enrol with your in-charge.", "normal",
             {"categories": ["nurse"]}),
            ("New ICU bay opening", "The 8-bed surgical ICU opens next month; interested staff nurses may apply internally.", "normal", {"departments": [str(depts["ICU"].id)]}),
        ):
            selfservice.create_announcement(db, {"title": title, "body": body, "priority": prio, "audience": aud})
        p = Principal(username="staff", display_name="", tenant_id=self.tenant_id, tenant_code="")
        talent.submit_grievance(db, {"category": "workload", "severity": "medium", "subject": "Night-shift nurse ratio in MICU",
                                     "description": "On weekends the MICU runs with two nurses for nine ventilated patients. Requesting review.",
                                     "against_employee_id": None, "anonymous": False}, p)
        talent.submit_grievance(db, {"category": "conduct", "severity": "high", "subject": "Raised voices during handover",
                                     "description": "A senior staff member repeatedly shouts at juniors during the morning handover in front of patients.",
                                     "against_employee_id": None, "anonymous": True}, p)

        talent.compliance_scan(db)
        attendance_engine.recalculate(db, [e.id for e in all_emps], TODAY - timedelta(days=2), TODAY, "demo seed")
        return out


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--tenant-code", required=True)
    args = ap.parse_args()
    tenant_id = resolve_tenant(args.tenant_code)
    with tenant_session(tenant_id) as db:
        db.info["actor"] = "demo-seed"
        if db.scalar(select(func.count()).select_from(Employee)):
            print("This tenant already has employees; refusing to mix demo data with real records.")
            return 1
        out = Seeder(db, tenant_id).run()
    for k, v in out.items():
        print(f"{k}: {v}")
    return 0


if __name__ == "__main__":
    sys.exit(main())

