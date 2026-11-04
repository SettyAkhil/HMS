"""Self-service, notifications, announcements, reports, HMS read APIs,
access revocation, retention, Command Center."""

from datetime import date, datetime, timedelta, timezone
from zoneinfo import ZoneInfo

from sqlalchemy import text

from app.db import tenant_session
from app.security import HR_READ, PAYROLL_WRITE, REPORTS_READ

IST = ZoneInfo("Asia/Kolkata")


def test_self_service_is_scoped_to_the_caller(setup, make_principal, client_for):
    s = setup
    tenant = s["principal"].tenant_code
    mine = s["employee"](hms_username="self.one", date_of_birth="1991-02-03")
    other = s["employee"](hms_username="self.two")
    me = client_for(make_principal(tenant=tenant, username="self.one"))
    ov = me.get("/api/v1/me").json()
    assert ov["employee"]["id"] == mine["id"] and ov["employee"]["date_of_birth"] == "1991-02-03"
    assert me.get(f"/api/v1/hr/employees/{other['id']}").status_code == 403
    assert me.get(f"/api/v1/attendance/monthly/{other['id']}", params={"year": 2026, "month": 10}).status_code == 403
    assert me.get(f"/api/v1/hr/leave/balances/{other['id']}").status_code == 403
    assert me.get("/api/v1/me/attendance", params={"year": 2026, "month": 10}).status_code == 200
    stranger = client_for(make_principal(tenant=tenant, username="not.linked"))
    assert stranger.get("/api/v1/me").status_code == 404


def test_notifications_are_derived(setup, make_principal, client_for):
    s = setup
    c, tenant = s["client"], s["principal"].tenant_code
    mgr = s["employee"](hms_username="n.mgr")
    s["employee"](hms_username="n.emp", reporting_manager_id=mgr["id"])
    lt = c.post("/api/v1/hr/leave/types", json={"code": "CL", "name": "Casual"}).json()
    c.post("/api/v1/hr/leave/policies", json={"leave_type_id": lt["id"], "annual_allocation": 12,
                                               "effective_from": "2025-01-01"})
    emp = client_for(make_principal(tenant=tenant, username="n.emp"))
    d = str(date.today() + timedelta(days=9))
    req = emp.post("/api/v1/hr/leave/requests", json={"leave_type_id": lt["id"], "start_date": d, "end_date": d,
                                                      "reason": "appointment"}).json()
    boss = client_for(make_principal(tenant=tenant, username="n.mgr"))
    assert [n["kind"] for n in boss.get("/api/v1/me/notifications").json()] == ["approval"]
    boss.post(f"/api/v1/hr/approvals/{req['approval_instance_id']}/act", json={"action": "approve"})
    assert boss.get("/api/v1/me/notifications").json() == []
    kinds = [n["kind"] for n in emp.get("/api/v1/me/notifications").json()]
    assert "leave" in kinds


def test_announcement_audience(setup, org, make_principal, client_for):
    s = setup
    c, tenant = s["client"], s["principal"].tenant_code
    s["employee"](hms_username="icu.nurse")
    s["employee"](hms_username="er.nurse", departments=[{"department_id": org["er"]["id"], "is_primary": True}])
    c.post("/api/v1/hr/announcements", json={"title": "ICU fire drill", "body": "Thursday 3 pm",
                                             "audience": {"departments": [org["icu"]["id"]]}})
    c.post("/api/v1/hr/announcements", json={"title": "Pay day moved", "body": "Salaries on the 1st",
                                             "audience": {"all": True}, "priority": "important"})
    icu = client_for(make_principal(tenant=tenant, username="icu.nurse"))
    er = client_for(make_principal(tenant=tenant, username="er.nurse"))
    assert {a["title"] for a in icu.get("/api/v1/me/announcements").json()} == {"ICU fire drill", "Pay day moved"}
    assert [a["title"] for a in er.get("/api/v1/me/announcements").json()] == ["Pay day moved"]
    assert c.post("/api/v1/hr/announcements", json={"title": "Nobody", "body": "x x x",
                                                    "audience": {}}).status_code == 403


def test_reports_permissions_csv_and_schedules(setup, make_principal, client_for):
    s = setup
    tenant = s["principal"].tenant_code
    s["employee"](first_name="=CMD()")
    reader = client_for(make_principal(perms=[HR_READ, REPORTS_READ], tenant=tenant, username="rep.reader"))
    cat = {r["key"]: r["available"] for r in reader.get("/api/v1/reports/hr").json()}
    assert cat["employees"] is True and cat["payroll_register"] is False and cat["grievance_summary"] is False
    assert reader.get("/api/v1/reports/hr/payroll_register").status_code == 403
    rep = reader.get("/api/v1/reports/hr/headcount").json()
    assert rep["rows"][0]["headcount"] >= 1
    csv_text = reader.get("/api/v1/reports/hr/employees/export.csv").text
    assert "'=CMD()" in csv_text
    no_reports = client_for(make_principal(perms=[HR_READ], tenant=tenant))
    assert no_reports.get("/api/v1/reports/hr/employees").status_code == 403
    sched = reader.post("/api/v1/reports/hr/schedules", json={"report": "headcount", "frequency": "weekly",
                                                              "recipients": ["rep.reader"]})
    assert sched.status_code == 201
    from app.services import reports

    with tenant_session(s["principal"].tenant_id) as db:
        db.info["actor"] = "system"
        assert reports.run_due(db) == 1
    runs = reader.get("/api/v1/reports/hr/runs").json()
    assert runs[0]["has_file"] and runs[0]["rows"] >= 1
    dl = reader.get(f"/api/v1/reports/hr/runs/{runs[0]['id']}/download")
    assert dl.status_code == 200 and dl.text.startswith("Department,Category,Headcount")
    assert no_reports.get(f"/api/v1/reports/hr/runs/{runs[0]['id']}/download").status_code == 404
    payroll_reader = client_for(make_principal(perms=[REPORTS_READ, PAYROLL_WRITE], tenant=tenant))
    assert payroll_reader.get("/api/v1/reports/hr/payroll_register").status_code == 200


def test_on_duty_and_availability(setup, org):
    s = setup
    c = s["client"]
    c.patch(f"/api/v1/hr/departments/{org['icu']['id']}", json={"hms_module": "icu", "census_wards": ["ICU-A"]})
    now = datetime.now(IST)
    start = (now - timedelta(hours=1)).replace(minute=0, second=0, microsecond=0)
    shift = c.post("/api/v1/workforce/shifts", json={
        "code": "NOW", "name": "Current", "start_time": start.strftime("%H:%M"),
        "end_time": (start + timedelta(hours=6)).strftime("%H:%M"), "full_day_minutes": 300}).json()
    nurse = s["employee"]()
    off = s["employee"]()
    today = start.date()
    r = c.post("/api/v1/workforce/rosters", json={"department_id": org["icu"]["id"], "period_start": str(today),
                                                  "period_end": str(today)}).json()
    c.put(f"/api/v1/workforce/rosters/{r['id']}/assignments", json=[
        {"employee_id": nurse["id"], "work_date": str(today), "shift_template_id": shift["id"]},
        {"employee_id": off["id"], "work_date": str(today), "is_weekly_off": True}])
    assert s["publish"](r).status_code == 200
    duty = c.get("/api/v1/workforce/on-duty", params={"hms_module": "icu"}).json()
    assert [x["employee_id"] for x in duty["staff"]] == [nurse["id"]]
    assert duty["departments"][0]["rostered"] == 1
    av = c.get("/api/v1/workforce/availability", params={"date_from": str(today), "date_to": str(today),
                                                         "category": "nurse"}).json()
    states = {a["employee_id"]: a["days"][0]["state"] for a in av}
    assert states[nurse["id"]] == "rostered" and states[off["id"]] == "off"
    cc = c.get("/api/v1/hr/command-center").json()
    assert cc["workforce"]["on_duty_now"] == 1 and cc["census_error"]  # no user session to read beds with


def test_termination_records_access_revocation(setup):
    s = setup
    c = s["client"]
    e = s["employee"](hms_username="leaving.user")
    with tenant_session(s["principal"].tenant_id) as db:
        db.execute(text("UPDATE employees SET hms_employee_id = 'HMS-77' WHERE id = :i"), {"i": e["id"]})
    c.post(f"/api/v1/hr/employees/{e['id']}/terminate", json={"reason": "resigned"})
    hist = c.get(f"/api/v1/hr/employees/{e['id']}/history").json()
    revoke = next(h for h in hist if h["event_type"] == "hms_access_deactivate")
    assert "pending" in revoke["summary"]  # no user session in tests, so auth-service was not reached


def test_retention_anonymises_stale_rejected_candidates(setup, org):
    s = setup
    c = s["client"]
    req = c.post("/api/v1/recruitment/requisitions", json={"department_id": org["icu"]["id"],
                                                           "designation_id": org["nurse"]["id"],
                                                           "justification": "Backfill for maternity leave"}).json()
    s["approve"](req["approval_instance_id"])
    s["approve"](req["approval_instance_id"])
    vac = c.post("/api/v1/recruitment/vacancies", json={"requisition_id": req["id"], "title": "Nurse",
                                                         "description": "ICU nurse vacancy"}).json()
    cand = c.post("/api/v1/recruitment/candidates", json={"first_name": "Old", "email": "old@example.com"}).json()
    app_ = c.post("/api/v1/recruitment/applications", json={"vacancy_id": vac["id"], "candidate_id": cand["id"]}).json()
    c.post(f"/api/v1/recruitment/applications/{app_['id']}/stage", json={"stage": "rejected", "reason": "No ICU experience"})
    from app.services import retention

    with tenant_session(s["principal"].tenant_id) as db:
        db.execute(text("UPDATE applications SET updated_at = now() - interval '400 days' WHERE id = :i"),
                   {"i": app_["id"]})
        db.info["actor"] = "system"
        out = retention.purge(db)
        assert out["candidates"] == 1
        row = db.execute(text("SELECT first_name, email FROM candidates WHERE id = :i"), {"i": cand["id"]}).one()
        assert tuple(row) == ("Removed", None)
    assert datetime.now(timezone.utc)


def test_colleagues_for_cover_requests(setup, org, make_principal, client_for):
    s = setup
    tenant = s["principal"].tenant_code
    me = s["employee"](hms_username="cover.me")
    free = s["employee"]()
    busy = s["employee"]()
    s["employee"](departments=[{"department_id": org["er"]["id"], "is_primary": True}])  # other department
    day = date.today() + timedelta(days=4)
    s["publish"](s["roster"](busy, [(day, "G")]))
    client = client_for(make_principal(tenant=tenant, username="cover.me"))
    rows = {r["employee_id"]: r["state"] for r in client.get("/api/v1/me/colleagues", params={"day": str(day)}).json()}
    assert rows == {free["id"]: "free", busy["id"]: "working"} and me["id"] not in rows
