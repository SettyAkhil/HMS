import os
import sys
import json

sys.path.append(os.path.abspath('.'))
os.environ.setdefault("SESSION_COOKIE_SECURE", "false")

from app import app
from utils.database import list_beds, create_bed

app.config["TESTING"] = True

def run_test():
    with app.test_client() as c:
        # 1. Login
        login_res = c.post("/api/auth/login", json={"username": "admin", "password": "Admin@123"})
        assert login_res.status_code == 200, f"Admin login failed: {login_res.status_code} {login_res.get_json()}"
        print("[PASS] Logged in as admin")

        # 2. Register Standalone ER Patient
        reg_payload = {
            "patient": {
                "name": "Ramesh",
                "last_name": "Verma",
                "gender": "Male",
                "age": 45,
                "phone": "9876543210",
                "emergency_contact": "9811223344",
                "allergies": "Sulfa drugs"
            },
            "visit": {
                "arrival_mode": "ambulance",
                "brought_by": "108 Ambulance Service",
                "condition_at_arrival": "Critical"
            },
            "complaint": "Acute severe substernal chest pain with diaphoresis",
            "vitals": {
                "heart_rate": 115,
                "bp_systolic": 160,
                "bp_diastolic": 100,
                "spo2": 94,
                "temperature": 37.2
            }
        }
        res = c.post("/api/er/register-patient", json=reg_payload)
        assert res.status_code == 201, f"ER patient register failed: {res.status_code} {res.get_json()}"
        data = res.get_json()
        patient_id = data["patient_id"]
        visit_id = data["visit"]["id"]
        visit_no = data["visit"]["visit_no"]

        assert patient_id.startswith("ER-PAT-"), f"Expected ER-PAT- prefix, got: {patient_id}"
        print(f"[PASS] Successfully registered ER Patient: {patient_id}, Visit: {visit_no} (ID: {visit_id})")

        # 3. Check visit details includes patient record
        v_res = c.get(f"/api/er/visits/{visit_id}")
        assert v_res.status_code == 200, f"Get ER visit failed: {v_res.status_code}"
        v_data = v_res.get_json()
        assert v_data["patient_id"] == patient_id
        assert v_data["is_unknown_patient"] is False
        assert v_data["patient"] is not None
        assert v_data["patient"]["name"] == "Ramesh"
        assert v_data["patient"]["emergency_contact"] == "9811223344"
        assert len(v_data["complaints"]) > 0
        assert len(v_data["vitals"]) > 0
        print("[PASS] Verified ER visit detail & linked patient demographics")

        # 4. Check list_er_visits includes patient fields
        list_res = c.get("/api/er/visits?active_only=true")
        assert list_res.status_code == 200
        visits = list_res.get_json()["visits"]
        matching = next((v for v in visits if v["id"] == visit_id), None)
        assert matching is not None
        assert matching["patient_name"] == "Ramesh"
        assert matching["patient_last_name"] == "Verma"
        assert matching["patient_phone"] == "9876543210"
        print("[PASS] Verified list_er_visits includes enriched patient name & contact")

        # 5. Triage, Doctor Assignment, Treatment, Disposition, Bed Allocation WITHOUT merge
        # Triage
        c.post(f"/api/er/visits/{visit_id}/triage", json={"category": "B1", "reason": "Severe cardiac presentation"})
        # Doctor
        c.post(f"/api/er/visits/{visit_id}/assign-doctor", json={"specialty": "Cardiology", "doctor_name": "Dr. Ramesh"})
        c.post(f"/api/er/visits/{visit_id}/accept")
        # Disposition -> ICU
        disp_res = c.post(f"/api/er/visits/{visit_id}/disposition", json={"outcome": "icu", "clinical_reason": "Admit to ICU for monitoring"})
        assert disp_res.status_code == 201, f"Disposition failed: {disp_res.status_code} {disp_res.get_json()}"
        disp_data = disp_res.get_json()
        bed_req_id = disp_data.get("bed_request_id")
        assert bed_req_id is not None, "Expected bed_request_id from ICU disposition"

        # Bed Allocation - ensure an ICU bed exists
        import random
        beds = list_beds(1)
        available_icu = [b for b in beds if b['status'] == 'available' and (b['ward'] or '').lower() == 'icu']
        if not available_icu:
            bed_id = create_bed(1, 'icu', 'ICU-Room-1', f"ICU-Bed-{random.randint(100, 9999)}", 'general')
        else:
            bed_id = available_icu[0]['id']

        # Allocate bed directly to ER patient without any merge error
        alloc_res = c.post(f"/api/er/bed-requests/{bed_req_id}/allocate", json={"bed_id": bed_id, "notes": "Emergency ICU admission"})
        assert alloc_res.status_code == 201, f"Bed allocation failed for ER patient: {alloc_res.status_code} {alloc_res.get_json()}"
        print(f"[PASS] Successfully allocated ICU bed {bed_id} for ER patient {patient_id} with NO merge required!")

        print("\nALL ER REGISTRATION TESTS PASSED PERFECTLY!")

if __name__ == '__main__':
    run_test()
