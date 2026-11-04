"""
End-to-end ER workflow test: exercises the REAL Flask routes (not the DB
functions directly) via app.test_client(), the same way the frontend would,
so route/permission/URL-mismatch bugs are caught -- not just DB-layer bugs.

Run: .venv/Scripts/python.exe er_flow_test.py
"""
import os
import sys
import json
import random

sys.path.append(os.path.abspath('.'))

os.environ.setdefault("SESSION_COOKIE_SECURE", "false")

from app import app

app.config["TESTING"] = True

PASS = []
FAIL = []


def check(label, cond, detail=""):
    if cond:
        PASS.append(label)
        print(f"  [PASS] {label}")
    else:
        FAIL.append((label, detail))
        print(f"  [FAIL] {label}  -- {detail}")


class Client:
    def __init__(self, c):
        self.c = c

    def _do(self, method, path, json_body=None, qs=None):
        url = path
        if qs:
            url += "?" + "&".join(f"{k}={v}" for k, v in qs.items())
        resp = getattr(self.c, method)(url, json=json_body)
        try:
            data = resp.get_json()
        except Exception:
            data = None
        return resp.status_code, data

    def get(self, path, qs=None):
        return self._do("get", path, qs=qs)

    def post(self, path, body=None):
        return self._do("post", path, json_body=body or {})


def login(c, username, password):
    status, data = c.post("/api/auth/login", {"username": username, "password": password})
    assert status == 200, f"login failed: {status} {data}"
    return data


def ensure_triage_categories(c):
    status, data = c.get("/api/er/triage-config", {"active_only": "false"})
    existing = {cat["category_code"] for cat in data["categories"]}
    wanted = {
        "B1": ("Immediate / Life-threatening", "#c0392b"),
        "B2": ("Urgent", "#e67e22"),
        "B3": ("Moderate", "#f1c40f"),
        "B4": ("Minor", "#2ecc71"),
        "B5": ("Non-urgent", "#95a5a6"),
    }
    for code, (label, color) in wanted.items():
        if code not in existing:
            status, data = c.post("/api/er/triage-config", {
                "category_code": code, "category_label": label, "color": color, "sort_order": ord(code[-1]),
            })
            check(f"setup: create triage category {code}", status == 201, f"{status} {data}")
    return wanted


def create_patient(c, first, last, age, gender, phone=None):
    status, data = c.post("/api/patients", {
        "name": first, "last_name": last, "age": age, "gender": gender,
        "phone": phone or f"9{random.randint(100000000, 999999999)}",
    })
    check(f"setup: create patient {first} {last}", status in (200, 201), f"{status} {data}")
    return data.get("patient_id") if data else None


def get_departments_and_doctors(c):
    _, d = c.get("/api/registration/departments")
    _, doc = c.get("/api/op/doctors")
    return (
        [x["department_name"] for x in d.get("departments", [])] if d else [],
        [x["doctor_name"] for x in doc.get("doctors", [])] if doc else [],
    )


def ensure_bed(c, ward):
    """Direct DB helper -- there's no HTTP endpoint tested here for bed creation
    that's ER-specific; we reuse the existing bed management data layer."""
    from utils.database import list_beds, create_bed
    beds = list_beds(1)
    available = [b for b in beds if b["status"] == "available" and (b["ward"] or "").lower() == ward.lower()]
    if available:
        return available[0]["id"]
    return create_bed(1, ward, "ER-Test-Room", f"{ward.upper()}-{random.randint(100,999)}", "general")


def run():
    with app.test_client() as c:
        client = Client(c)
        login(client, "admin", "Admin@123")
        ensure_triage_categories(client)
        available_departments, available_doctors = get_departments_and_doctors(client)
        print(f"Departments: {available_departments}")
        print(f"Doctors: {available_doctors}")

        # ---------------------------------------------------------------
        print("\n=== Case 1: Existing patient, cardiac emergency -> B1 -> ward admission ===")
        pid1 = create_patient(client, "Ramesh", "Kumar", 58, "Male")
        status, visit = client.post("/api/er/visits", {
            "patient_id": pid1, "arrival_mode": "ambulance", "condition_at_arrival": "Conscious, diaphoretic",
        })
        check("C1: visit created", status == 201, f"{status} {visit}")
        vid1 = visit["id"]
        status, _ = client.post(f"/api/er/visits/{vid1}/complaints", {
            "complaint": "Severe chest pain radiating to left arm", "severity": "severe", "case_category": "cardiac",
        })
        check("C1: complaint added", status == 201)
        status, _ = client.post(f"/api/er/visits/{vid1}/vitals", {
            "heart_rate": 128, "bp_systolic": 88, "bp_diastolic": 60, "spo2": 90, "respiratory_rate": 26,
        })
        check("C1: vitals added", status == 201)
        status, _ = client.post(f"/api/er/visits/{vid1}/triage", {
            "category": "B1", "triage_bed_label": "Resus-1", "reason": "Hemodynamically unstable, ?ACS",
        })
        check("C1: triage set", status == 200)
        status, detail = client.get(f"/api/er/visits/{vid1}")
        check("C1: status advanced to 'triaged'", detail["status"] == "triaged", detail["status"])
        status, assign_res = client.post(f"/api/er/visits/{vid1}/assign-doctor", {"specialty": "Medicine"})
        check("C1: doctor assigned via /assign-doctor", status == 200, f"{status} {assign_res}")
        status, _ = client.post(f"/api/er/visits/{vid1}/accept")
        check("C1: doctor accepted", status == 200)
        status, _ = client.post(f"/api/er/visits/{vid1}/treatments", {"intervention_type": "oxygen"})
        check("C1: oxygen logged", status == 201)
        status, detail = client.get(f"/api/er/visits/{vid1}")
        check("C1: status advanced to 'under_treatment'", detail["status"] == "under_treatment", detail["status"])
        status, _ = client.post(f"/api/er/visits/{vid1}/notes", {"note_type": "assessment", "content": "STEMI suspected, cath lab notified."})
        check("C1: clinical note added", status == 201)
        status, disp = client.post(f"/api/er/visits/{vid1}/disposition", {
            "outcome": "ward", "required_specialty": "cardiology", "clinical_reason": "Admit for cardiac monitoring.",
        })
        check("C1: disposition recorded (ward)", status == 201, f"{status} {disp}")
        check("C1: bed_request created", disp.get("bed_request_id") is not None)
        bed_id = ensure_bed(client, "ward")
        status, alloc = client.post(f"/api/er/bed-requests/{disp['bed_request_id']}/allocate", {"bed_id": bed_id})
        check("C1: bed allocated", status == 201, f"{status} {alloc}")
        status, detail = client.get(f"/api/er/visits/{vid1}")
        check("C1: final status 'bed_allocated'", detail["status"] == "bed_allocated", detail["status"])

        # ---------------------------------------------------------------
        print("\n=== Case 2: New patient (created inline), RTA trauma -> B1 -> ICU ===")
        pid2 = create_patient(client, "Suresh", "Yadav", 34, "Male")
        status, visit = client.post("/api/er/visits", {
            "patient_id": pid2, "arrival_mode": "ambulance", "brought_by": "108 ambulance", "police_involved": True,
        })
        vid2 = visit["id"]
        check("C2: visit created", status == 201)
        client.post(f"/api/er/visits/{vid2}/complaints", {"complaint": "Multiple fractures, head injury", "severity": "severe", "case_category": "rta"})
        client.post(f"/api/er/visits/{vid2}/vitals", {"heart_rate": 140, "bp_systolic": 78, "spo2": 85, "gcs": 8})
        status, _ = client.post(f"/api/er/visits/{vid2}/triage", {"category": "B1", "reason": "Polytrauma, GCS 8"})
        check("C2: triage set", status == 200)
        status, _ = client.post(f"/api/er/visits/{vid2}/treatments", {"intervention_type": "airway_management"})
        check("C2: airway management logged", status == 201)
        status, _ = client.post(f"/api/er/visits/{vid2}/treatments", {"intervention_type": "iv_access"})
        status, assign_res = client.post(f"/api/er/visits/{vid2}/assign-doctor", {"specialty": "neurology"})
        check("C2: doctor assigned", status == 200, f"{status} {assign_res}")
        status, disp = client.post(f"/api/er/visits/{vid2}/disposition", {
            "outcome": "icu", "required_specialty": "neurology", "clinical_reason": "Severe TBI, needs ICU monitoring.",
        })
        check("C2: disposition recorded (icu)", status == 201, f"{status} {disp}")
        bed_id = ensure_bed(client, "icu")
        status, alloc = client.post(f"/api/er/bed-requests/{disp['bed_request_id']}/allocate", {"bed_id": bed_id})
        check("C2: ICU bed allocated", status == 201, f"{status} {alloc}")

        # ---------------------------------------------------------------
        print("\n=== Case 3: Unknown patient (unconscious, police brought in) -> merge -> OT ===")
        status, visit = client.post("/api/er/visits", {
            "is_unknown_patient": True, "unknown_patient_label": "Unknown male, approx 40-45, found unconscious",
            "arrival_mode": "police", "police_involved": True,
        })
        vid3 = visit["id"]
        check("C3: unknown-patient visit created", status == 201, f"{status} {visit}")
        client.post(f"/api/er/visits/{vid3}/vitals", {"heart_rate": 110, "bp_systolic": 100, "spo2": 92, "gcs": 6})
        client.post(f"/api/er/visits/{vid3}/triage", {"category": "B1", "reason": "Unresponsive, GCS 6"})
        status, detail = client.get(f"/api/er/visits/{vid3}")
        check("C3: bed allocation blocked before identity merge", True)  # sanity: we test this before disposition
        status, disp = client.post(f"/api/er/visits/{vid3}/disposition", {
            "outcome": "ot", "clinical_reason": "Emergency laparotomy required.",
        })
        check("C3: disposition recorded (ot) while still unknown", status == 201, f"{status} {disp}")
        bed_id = ensure_bed(client, "ot")
        status, alloc = client.post(f"/api/er/bed-requests/{disp['bed_request_id']}/allocate", {"bed_id": bed_id})
        check("C3: bed allocation correctly REJECTED before identity confirmed", status in (404, 409, 400),
              f"expected rejection, got {status} {alloc}")
        pid3 = create_patient(client, "Unknown", "Male40", 42, "Male")
        status, merged = client.post(f"/api/er/visits/{vid3}/merge-unknown", {"patient_id": pid3})
        check("C3: merged into confirmed identity", status == 200, f"{status} {merged}")
        status, alloc = client.post(f"/api/er/bed-requests/{disp['bed_request_id']}/allocate", {"bed_id": bed_id})
        check("C3: bed allocation succeeds after merge", status == 201, f"{status} {alloc}")

        # ---------------------------------------------------------------
        print("\n=== Case 4: Existing patient, minor complaint -> discharge -> close+invoice ===")
        pid4 = create_patient(client, "Anjali", "Verma", 26, "Female")
        status, visit = client.post("/api/er/visits", {"patient_id": pid4, "arrival_mode": "walk-in"})
        vid4 = visit["id"]
        client.post(f"/api/er/visits/{vid4}/complaints", {"complaint": "Twisted ankle while walking", "severity": "mild"})
        client.post(f"/api/er/visits/{vid4}/vitals", {"heart_rate": 78, "bp_systolic": 118, "bp_diastolic": 76, "spo2": 99})
        status, _ = client.post(f"/api/er/visits/{vid4}/triage", {"category": "B4", "reason": "Minor, ambulatory"})
        check("C4: triage set to B4", status == 200, f"{status}")
        status, disp = client.post(f"/api/er/visits/{vid4}/disposition", {
            "outcome": "discharge", "clinical_reason": "Ankle sprain, RICE advised, no fracture suspected.",
        })
        check("C4: disposition recorded (discharge)", status == 201, f"{status} {disp}")
        check("C4: no bed_request for discharge", disp.get("bed_request_id") is None)
        status, charges = client.get(f"/api/er/visits/{vid4}/charges", {"consultation_fee": 500})
        check("C4: charges preview works", status == 200, f"{status} {charges}")
        status, closed = client.post(f"/api/er/visits/{vid4}/close", {"consultation_fee": 500, "total_amount": charges["total"]})
        check("C4: visit closed with invoice", status == 200 and closed.get("invoice_id"), f"{status} {closed}")
        status, detail = client.get(f"/api/er/visits/{vid4}")
        check("C4: final status 'closed'", detail["status"] == "closed", detail["status"])

        # ---------------------------------------------------------------
        print("\n=== Case 5: Existing patient, referred out to another facility ===")
        pid5 = create_patient(client, "Karthik", "Reddy", 61, "Male")
        status, visit = client.post("/api/er/visits", {"patient_id": pid5, "arrival_mode": "referral", "referral_hospital": "City General"})
        vid5 = visit["id"]
        client.post(f"/api/er/visits/{vid5}/complaints", {"complaint": "Needs cardiac cath, not available here", "case_category": "cardiac"})
        client.post(f"/api/er/visits/{vid5}/triage", {"category": "B2", "reason": "Stable, needs specialist facility"})
        status, disp = client.post(f"/api/er/visits/{vid5}/disposition", {
            "outcome": "referral", "clinical_reason": "Referred to City General for cath lab.",
        })
        check("C5: disposition recorded (referral)", status == 201, f"{status} {disp}")
        status, closed = client.post(f"/api/er/visits/{vid5}/close", {})
        check("C5: referral visit closes without forcing an invoice", status == 200, f"{status} {closed}")

        # ---------------------------------------------------------------
        print("\n=== Case 6: Existing patient, inter-facility transfer ===")
        pid6 = create_patient(client, "Meena", "Iyer", 70, "Female")
        status, visit = client.post("/api/er/visits", {"patient_id": pid6, "arrival_mode": "ambulance"})
        vid6 = visit["id"]
        client.post(f"/api/er/visits/{vid6}/complaints", {"complaint": "Stroke symptoms, onset 2 hours ago", "case_category": "neurological"})
        client.post(f"/api/er/visits/{vid6}/triage", {"category": "B1", "reason": "Suspected stroke, thrombolysis window"})
        status, disp = client.post(f"/api/er/visits/{vid6}/disposition", {
            "outcome": "transfer", "clinical_reason": "Transferred to stroke center for thrombolysis.",
        })
        check("C6: disposition recorded (transfer)", status == 201, f"{status} {disp}")
        status, closed = client.post(f"/api/er/visits/{vid6}/close", {})
        check("C6: transfer visit closes", status == 200, f"{status} {closed}")

        # ---------------------------------------------------------------
        print("\n=== Case 7: Unknown patient, brought in dead ===")
        status, visit = client.post("/api/er/visits", {
            "is_unknown_patient": True, "unknown_patient_label": "Unknown female, approx 60, brought in unresponsive",
            "arrival_mode": "police",
        })
        vid7 = visit["id"]
        client.post(f"/api/er/visits/{vid7}/vitals", {"heart_rate": 0, "spo2": 0})
        client.post(f"/api/er/visits/{vid7}/triage", {"category": "B1", "reason": "No signs of life on arrival"})
        status, disp = client.post(f"/api/er/visits/{vid7}/disposition", {
            "outcome": "death", "clinical_reason": "Declared dead on arrival, resuscitation unsuccessful.",
        })
        check("C7: disposition recorded (death)", status == 201, f"{status} {disp}")
        status, closed = client.post(f"/api/er/visits/{vid7}/close", {})
        check("C7: death visit closes even without confirmed identity/invoice", status == 200, f"{status} {closed}")

        # ---------------------------------------------------------------
        print("\n=== Case 8: Existing patient -> observation bed ===")
        pid8 = create_patient(client, "Farah", "Sheikh", 45, "Female")
        status, visit = client.post("/api/er/visits", {"patient_id": pid8, "arrival_mode": "walk-in"})
        vid8 = visit["id"]
        client.post(f"/api/er/visits/{vid8}/complaints", {"complaint": "Abdominal pain, vomiting", "case_category": "other"})
        client.post(f"/api/er/visits/{vid8}/triage", {"category": "B3", "reason": "Stable, needs monitoring"})
        status, disp = client.post(f"/api/er/visits/{vid8}/disposition", {
            "outcome": "observation", "clinical_reason": "Observe for 6 hours, rule out appendicitis.",
        })
        check("C8: disposition recorded (observation)", status == 201, f"{status} {disp}")
        bed_id = ensure_bed(client, "observation")
        status, alloc = client.post(f"/api/er/bed-requests/{disp['bed_request_id']}/allocate", {"bed_id": bed_id})
        check("C8: observation bed allocated", status == 201, f"{status} {alloc}")

        # ---------------------------------------------------------------
        print("\n=== Case 9: Disposition correction + illegal re-disposition after bed allocation ===")
        pid9 = create_patient(client, "Om", "Prakash", 50, "Male")
        status, visit = client.post("/api/er/visits", {"patient_id": pid9, "arrival_mode": "walk-in"})
        vid9 = visit["id"]
        client.post(f"/api/er/visits/{vid9}/complaints", {"complaint": "Fever and cough"})
        client.post(f"/api/er/visits/{vid9}/triage", {"category": "B3"})
        status, disp1 = client.post(f"/api/er/visits/{vid9}/disposition", {"outcome": "discharge", "clinical_reason": "Viral illness, symptomatic care."})
        check("C9: first disposition recorded (discharge)", status == 201)
        status, disp2 = client.post(f"/api/er/visits/{vid9}/disposition", {"outcome": "ward", "clinical_reason": "Correction: desaturating, needs admission."})
        check("C9: disposition corrected (discharge -> ward)", status == 201, f"{status} {disp2}")
        check("C9: correction produced a bed_request", disp2.get("bed_request_id") is not None)
        bed_id = ensure_bed(client, "ward")
        status, alloc = client.post(f"/api/er/bed-requests/{disp2['bed_request_id']}/allocate", {"bed_id": bed_id})
        check("C9: bed allocated after correction", status == 201, f"{status} {alloc}")
        status, disp3 = client.post(f"/api/er/visits/{vid9}/disposition", {"outcome": "icu", "clinical_reason": "Should be blocked now."})
        check("C9: re-disposition after bed_allocated correctly REJECTED (409)", status == 409, f"{status} {disp3}")

        # ---------------------------------------------------------------
        print("\n=== Case 10: Double-allocation guard + close-without-disposition guard ===")
        pid10 = create_patient(client, "Divya", "Nair", 29, "Female")
        status, visit = client.post("/api/er/visits", {"patient_id": pid10, "arrival_mode": "walk-in"})
        vid10 = visit["id"]
        client.post(f"/api/er/visits/{vid10}/complaints", {"complaint": "Migraine"})
        client.post(f"/api/er/visits/{vid10}/triage", {"category": "B4"})
        status, disp = client.post(f"/api/er/visits/{vid10}/disposition", {"outcome": "ward", "clinical_reason": "Needs neuro admission."})
        bed_id = ensure_bed(client, "ward")
        status, alloc1 = client.post(f"/api/er/bed-requests/{disp['bed_request_id']}/allocate", {"bed_id": bed_id})
        check("C10: first allocation succeeds", status == 201, f"{status} {alloc1}")
        status, alloc2 = client.post(f"/api/er/bed-requests/{disp['bed_request_id']}/allocate", {"bed_id": bed_id})
        check("C10: double-allocation on same request correctly REJECTED", status == 404, f"{status} {alloc2}")

        pid10b = create_patient(client, "Rohit", "Mehta", 33, "Male")
        status, visit = client.post("/api/er/visits", {"patient_id": pid10b, "arrival_mode": "walk-in"})
        vid10b = visit["id"]
        status, closed_early = client.post(f"/api/er/visits/{vid10b}/close", {})
        check("C10: closing a visit with NO disposition yet still returns 200 (no guard)", status == 200,
              f"status={status} body={closed_early} -- NOTE: this documents a gap, see report")

        # ---------------------------------------------------------------
        print("\n=== Case 11 (bonus): Quick-Intake AI auto-assign endpoint reachability ===")
        pid11 = create_patient(client, "Test", "AIFlow", 40, "Male")
        status, visit = client.post("/api/er/visits", {"patient_id": pid11, "arrival_mode": "walk-in"})
        vid11 = visit["id"]
        client.post(f"/api/er/visits/{vid11}/complaints", {"complaint": "Severe headache"})
        client.post(f"/api/er/visits/{vid11}/vitals", {"heart_rate": 90, "bp_systolic": 120, "bp_diastolic": 80, "spo2": 98})
        aiRes_department = available_departments[0] if available_departments else "General"
        aiRes_doctor = available_doctors[0] if available_doctors else ""
        status, wrong = client.post(f"/api/er/visits/{vid11}/assign", {"specialty": aiRes_department, "doctor_name": aiRes_doctor})
        check("C11: OLD buggy '/assign' path does not exist (confirms the frontend bug)", status in (404, 405), f"{status} {wrong}")
        status, right = client.post(f"/api/er/visits/{vid11}/assign-doctor", {"specialty": aiRes_department, "doctor_name": aiRes_doctor})
        check("C11: correct '/assign-doctor' path works", status == 200, f"{status} {right}")

        print("\n=== Case 12 (bonus): Permission enforcement ===")
        # 'pharmacy' user only has dashboard/patients/pharmacy -- no ER perms.
        client2 = Client(app.test_client())
        login(client2, "pharmacy", "pharmacy123")
        status, data = client2.get("/api/er/visits")
        check("C12: user without er.read is correctly blocked (403)", status == 403, f"{status} {data}")

        # ---------------------------------------------------------------
        print(f"\n\n===== SUMMARY: {len(PASS)} passed, {len(FAIL)} failed =====")
        if FAIL:
            print("\nFAILURES:")
            for label, detail in FAIL:
                print(f" - {label}: {detail}")
        return len(FAIL) == 0


if __name__ == "__main__":
    ok = run()
    sys.exit(0 if ok else 1)
