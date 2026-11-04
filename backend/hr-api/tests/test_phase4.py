"""Recruitment → onboarding → activation, documents, training, performance,
compliance, grievances."""

from datetime import date, datetime, timedelta, timezone

from app.security import (
    DOCUMENTS_WRITE, EMPLOYEES_WRITE, GRIEVANCES_MANAGE, HR_READ, RECRUITMENT_WRITE,
)

PDF = b"%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF"
PNG = b"\x89PNG\r\n\x1a\n" + b"\x00" * 32


def test_recruitment_to_activation(setup, org):
    s = setup
    c = s["client"]
    req = c.post("/api/v1/recruitment/requisitions", json={
        "department_id": org["icu"]["id"], "designation_id": org["nurse"]["id"], "branch_id": org["branch"]["id"],
        "positions": 1, "justification": "Two ICU nurses resigned this month"}).json()
    assert c.post("/api/v1/recruitment/vacancies", json={"requisition_id": req["id"], "title": "Staff Nurse – ICU",
                                                          "description": "Night-capable ICU staff nurse"}).status_code == 409
    inst = s["approve"](req["approval_instance_id"])  # department head step (no head on record -> recruiters)
    assert inst["status"] == "pending"
    s["approve"](req["approval_instance_id"])  # HR step
    vac = c.post("/api/v1/recruitment/vacancies", json={"requisition_id": req["id"], "title": "Staff Nurse – ICU",
                                                         "description": "Night-capable ICU staff nurse"}).json()
    cand = c.post("/api/v1/recruitment/candidates", json={"first_name": "Divya", "last_name": "Menon",
                                                           "email": "divya.m@example.com", "experience_years": 4}).json()
    assert c.post("/api/v1/recruitment/candidates", json={"first_name": "Dup",
                                                           "email": "DIVYA.M@example.com"}).status_code == 409
    app_ = c.post("/api/v1/recruitment/applications", json={"vacancy_id": vac["id"], "candidate_id": cand["id"]}).json()
    iv = c.post("/api/v1/recruitment/interviews", json={
        "application_id": app_["id"], "round_name": "Clinical", "interviewers": ["nurse.head"],
        "scheduled_at": (datetime.now(timezone.utc) + timedelta(days=1)).isoformat()}).json()
    c.post(f"/api/v1/recruitment/interviews/{iv['id']}/feedback", json={
        "rating": 4, "recommendation": "hire", "feedback": "Strong ventilator management"})
    assert c.post(f"/api/v1/recruitment/applications/{app_['id']}/stage", json={"stage": "selected"}).status_code == 200
    joining = date.today() + timedelta(days=14)
    offer = c.post("/api/v1/recruitment/offers", json={"application_id": app_["id"], "offered_gross": 42000,
                                                        "joining_date": str(joining),
                                                        "expires_on": str(date.today() + timedelta(days=7))}).json()
    c.post(f"/api/v1/recruitment/offers/{offer['id']}/respond", json={"response": "accepted"})
    tasks = c.get(f"/api/v1/onboarding/{app_['id']}/tasks").json()
    assert len(tasks) == 6
    blocked = c.post(f"/api/v1/onboarding/{app_['id']}/activate", json={})
    assert blocked.status_code == 409 and len(blocked.json()["details"]["pending"]) == 4
    for t in tasks:
        if t["required_for_activation"]:
            c.patch(f"/api/v1/onboarding/tasks/{t['id']}", json={"status": "done"})
    result = c.post(f"/api/v1/onboarding/{app_['id']}/activate", json={
        "hms_username": "divya.menon", "biometric_pin": "7001", "shift_template_id": s["day"]["id"]}).json()
    assert "employee_code" in result, result
    assert result["employee_code"].startswith("EMP-")
    assert result["steps"]["hms_account"].startswith("not created")  # no user session to act with in tests
    assert "temporary_password" not in result
    assert "mapped" in result["steps"]["biometric"] and "7 days" in result["steps"]["initial_shifts"]
    emp = c.get(f"/api/v1/hr/employees/{result['employee_id']}").json()
    assert emp["status"] == "active" and emp["designation"] == "Staff Nurse" and emp["biometric_ids"] == ["7001"]
    assert c.get("/api/v1/recruitment/requisitions").json()[0]["status"] == "filled"
    assert c.post(f"/api/v1/onboarding/{app_['id']}/activate", json={}).status_code == 409


def test_documents_storage_versions_and_access(setup, make_principal, client_for):
    s = setup
    c = s["client"]
    e = s["employee"](hms_username="doc.owner")
    form = {"category": "registration", "title": "Nursing council certificate", "employee_id": e["id"],
            "expiry_date": "2027-03-31"}
    up = c.post("/api/v1/hr/documents", data=form, files={"file": ("cert.pdf", PDF, "application/pdf")})
    assert up.status_code == 201, up.text
    doc = up.json()
    assert doc["content_type"] == "application/pdf" and doc["version"] == 1
    fake = c.post("/api/v1/hr/documents", data=form, files={"file": ("x.pdf", b"MZ\x90\x00 not a pdf", "application/pdf")})
    assert fake.status_code == 400  # the content decides, not the extension
    v2 = c.post("/api/v1/hr/documents", data={**form, "replaces": doc["id"]},
                files={"file": ("cert-renewed.png", PNG, "image/png")}).json()
    assert v2["version"] == 2 and v2["previous_version_id"] == doc["id"]
    hidden = c.post("/api/v1/hr/documents", data={**form, "title": "Background check", "access_level": "hr_only",
                                                   "category": "other"},
                    files={"file": ("bg.pdf", PDF, "application/pdf")}).json()
    assert len(c.get("/api/v1/hr/documents", params={"employee_id": e["id"], "history": True}).json()) == 3

    owner = client_for(make_principal(tenant=s["principal"].tenant_code, username="doc.owner"))
    mine = owner.get("/api/v1/hr/documents", params={"employee_id": e["id"]}).json()
    assert [d["title"] for d in mine] == ["Nursing council certificate"]  # current version only, not hr_only
    dl = owner.get(f"/api/v1/hr/documents/{v2['id']}/download")
    assert dl.status_code == 200 and dl.content == PNG and "attachment" in dl.headers["content-disposition"]
    assert owner.get(f"/api/v1/hr/documents/{hidden['id']}/download").status_code == 404
    other = client_for(make_principal(perms=[HR_READ], tenant=s["principal"].tenant_code, username="someone"))
    assert other.get(f"/api/v1/hr/documents/{v2['id']}/download").status_code == 404
    hr = client_for(make_principal(perms=[DOCUMENTS_WRITE], tenant=s["principal"].tenant_code))
    assert hr.post(f"/api/v1/hr/documents/{v2['id']}/verified").json()["verification_status"] == "verified"


def test_training_certification_and_matrix(setup):
    s = setup
    c = s["client"]
    a, b = s["employee"](), s["employee"]()
    prog = c.post("/api/v1/training/programs", json={"code": "BLS", "title": "Basic Life Support", "category": "bls",
                                                     "validity_months": 24, "mandatory_for": ["nurse"],
                                                     "pass_score": 80}).json()
    start = datetime(2026, 9, 10, 9, tzinfo=timezone.utc)
    sess = c.post("/api/v1/training/sessions", json={"program_id": prog["id"], "starts_at": start.isoformat(),
                                                     "ends_at": (start + timedelta(hours=6)).isoformat(),
                                                     "capacity": 1}).json()
    assert c.post(f"/api/v1/training/sessions/{sess['id']}/enroll", json={"employee_ids": [a["id"]]}).json()["enrolled"] == 1
    assert c.post(f"/api/v1/training/sessions/{sess['id']}/enroll", json={"employee_ids": [b["id"]]}).status_code == 409
    enr = c.get(f"/api/v1/training/sessions/{sess['id']}/enrollments").json()[0]
    assert c.post(f"/api/v1/training/enrollments/{enr['id']}/result",
                  json={"status": "passed", "score": 70}).status_code == 400  # below the pass mark
    c.post(f"/api/v1/training/enrollments/{enr['id']}/result", json={"status": "passed", "score": 92,
                                                                     "certificate_number": "BLS-2026-14"})
    cert = c.get("/api/v1/training/certifications", params={"employee_id": a["id"]}).json()[0]
    assert cert["issued_on"] == "2026-09-10" and cert["expires_on"] == "2028-09-10"
    matrix = c.get("/api/v1/training/matrix").json()
    states = {r["employee_id"]: r["cells"][prog["id"]]["state"] for r in matrix["rows"]}
    assert states[a["id"]] == "valid" and states[b["id"]] == "missing" and matrix["gaps"] == 1


def test_performance_review_flow(setup, make_principal, client_for):
    s = setup
    c, tenant = s["client"], s["principal"].tenant_code
    mgr = s["employee"](hms_username="perf.mgr")
    emp = s["employee"](hms_username="perf.emp", reporting_manager_id=mgr["id"])
    bad = c.post("/api/v1/performance/cycles", json={"name": "FY26", "period_start": "2026-04-01",
                                                     "period_end": "2027-03-31", "criteria": {"default": [
                                                         {"code": "care", "label": "Patient care", "weight": 50}]}})
    assert bad.status_code == 400
    cycle = c.post("/api/v1/performance/cycles", json={"name": "FY26", "period_start": "2026-04-01",
                                                       "period_end": "2027-03-31", "criteria": {
                                                           "default": [{"code": "work", "label": "Work quality", "weight": 100}],
                                                           "nurse": [{"code": "care", "label": "Patient care", "weight": 60},
                                                                     {"code": "team", "label": "Teamwork", "weight": 40}]}}).json()
    assert c.post(f"/api/v1/performance/cycles/{cycle['id']}/launch").json()["reviews_created"] == 2
    me = client_for(make_principal(tenant=tenant, username="perf.emp"))
    review = me.get("/api/v1/performance/reviews", params={"mine": True}).json()
    review = next(r for r in review if r["employee_id"] == emp["id"])
    assert {x["criterion"] for x in review["scores"]} == {"care", "team"}  # nurse-specific criteria
    me.post(f"/api/v1/performance/reviews/{review['id']}/submit", json={"scores": {"care": 5, "team": 4},
                                                                         "comments": "Led two code blues"})
    assert me.post(f"/api/v1/performance/reviews/{review['id']}/submit",
                   json={"scores": {"care": 5, "team": 5}}).status_code == 403  # cannot manager-review yourself
    boss = client_for(make_principal(tenant=tenant, username="perf.mgr"))
    step = boss.post(f"/api/v1/performance/reviews/{review['id']}/submit", json={"scores": {"care": 4, "team": 3}}).json()
    assert step["status"] == "hr_review" and float(step["overall_rating"]) == 3.6  # 4×0.6 + 3×0.4
    done = c.post(f"/api/v1/performance/reviews/{review['id']}/submit", json={"comments": "Agreed"}).json()
    assert done["status"] == "completed" and float(done["final_rating"]) == 3.6


def test_compliance_scan_and_alerts(setup):
    s = setup
    c = s["client"]
    e = s["employee"](credentials=[{"credential_type": "nursing_registration", "number": "KNC-1",
                                    "expires_on": str(date.today() + timedelta(days=20))}])
    result = c.post("/api/v1/compliance/scan").json()
    assert result["expiring"] >= 1 and result["new_alerts"] == 1
    assert c.post("/api/v1/compliance/scan").json()["new_alerts"] == 0  # one alert per item and expiry
    alerts = c.get("/api/v1/compliance/alerts").json()
    assert alerts[0]["employee_id"] == e["id"] and alerts[0]["days_left"] == 20
    recs = c.get("/api/v1/compliance/records", params={"status": "expiring"}).json()
    assert recs[0]["requirement"] == "credential:nursing_registration"


def test_grievance_confidentiality_and_closure(setup, make_principal, client_for):
    s = setup
    tenant = s["principal"].tenant_code
    s["employee"](hms_username="nurse.a")
    s["employee"](hms_username="nurse.b")
    a = client_for(make_principal(tenant=tenant, username="nurse.a"))
    b = client_for(make_principal(tenant=tenant, username="nurse.b"))
    anon = a.post("/api/v1/hr/grievances", json={"category": "harassment", "subject": "Verbal abuse on night shift",
                                                  "description": "Repeated shouting at junior staff during handover.",
                                                  "anonymous": True}).json()
    named = a.post("/api/v1/hr/grievances", json={"category": "workload", "subject": "Unsafe nurse ratio",
                                                   "description": "One nurse for six ventilated patients on weekends."}).json()
    assert [x["id"] for x in a.get("/api/v1/hr/grievances").json()] == [named["id"]]  # anonymous is unlinked
    assert b.get("/api/v1/hr/grievances").json() == []
    assert b.get(f"/api/v1/hr/grievances/{named['id']}").status_code == 404
    gm = client_for(make_principal(perms=[GRIEVANCES_MANAGE, HR_READ], tenant=tenant, username="gm.one"))
    full = gm.get(f"/api/v1/hr/grievances/{anon['id']}").json()
    assert full["submitted_by"] == "Anonymous"
    gm.post(f"/api/v1/hr/grievances/{named['id']}/assign", json={"assignee": "investigator.x"})
    gm.post(f"/api/v1/hr/grievances/{named['id']}/comments", json={"body": "Check the weekend roster", "internal": True})
    gm.post(f"/api/v1/hr/grievances/{named['id']}/comments", json={"body": "We are looking into this", "internal": False})
    mine = a.get(f"/api/v1/hr/grievances/{named['id']}").json()
    assert [x["body"] for x in mine["comments"]] == ["We are looking into this"] and "assigned_to" not in mine
    res = gm.post(f"/api/v1/hr/grievances/{named['id']}/resolve", json={"resolution": "Weekend staffing raised to 1:2"}).json()
    assert gm.post(f"/api/v1/hr/approvals/{res['approval_instance_id']}/act",
                   json={"action": "approve"}).status_code == 403  # proposer cannot close their own resolution
    gm2 = client_for(make_principal(perms=[GRIEVANCES_MANAGE], tenant=tenant, username="gm.two"))
    gm2.post(f"/api/v1/hr/approvals/{res['approval_instance_id']}/act", json={"action": "approve"})
    assert a.get(f"/api/v1/hr/grievances/{named['id']}").json()["status"] == "resolved"
    hr_only = client_for(make_principal(perms=[HR_READ, EMPLOYEES_WRITE, RECRUITMENT_WRITE], tenant=tenant))
    assert hr_only.get("/api/v1/hr/grievances").json() == []  # ordinary HR users see no case files


def test_compliance_scan_alerts_on_expiring_certificates(setup):
    s = setup
    c = s["client"]
    e = s["employee"]()
    prog = c.post("/api/v1/training/programs", json={"code": "FIRE", "title": "Fire safety", "category": "fire_safety",
                                                     "validity_months": 12, "mandatory_for": ["all"]}).json()
    issued = date.today() - timedelta(days=350)
    assert c.post("/api/v1/training/certifications", json={"employee_id": e["id"], "program_id": prog["id"],
                                                            "issued_on": str(issued)}).status_code == 201
    result = c.post("/api/v1/compliance/scan").json()
    assert result["new_alerts"] >= 1
    alerts = c.get("/api/v1/compliance/alerts").json()
    assert any(a["source_type"] == "certification" and a["employee_id"] == e["id"] for a in alerts)
