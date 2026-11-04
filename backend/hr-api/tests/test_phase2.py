"""Attendance engine, rosters, leave, approvals, swaps, overtime, staffing."""

import uuid
from datetime import date, timedelta
from zoneinfo import ZoneInfo


from app.security import HR_READ, LEAVES_WRITE

IST = ZoneInfo("Asia/Kolkata")
D = date(2026, 10, 5)  # a past Monday


def test_day_shift_sessions_break_and_grace(setup):
    s = setup
    e = s["employee"]()
    assert s["publish"](s["roster"](e, [(D, "G")])).status_code == 200
    s["punch"](e, f"{D} 08:55:00", f"{D} 13:00:00", f"{D} 13:30:00", f"{D} 17:05:00")
    r = s["record"](e, D)
    assert r["status"] == "present"
    assert r["worked_minutes"] == 245 + 215  # the 30-minute gap already covers the break
    assert r["break_deducted_minutes"] == 0 and r["late_minutes"] == 0 and r["early_minutes"] == 0
    assert r["overtime_minutes"] == 0  # 10 min extra is under the 30 min threshold
    detail = s["client"].get(f"/api/v1/attendance/records/{r['id']}").json()
    assert len(detail["sessions"]) == 2


def test_late_early_break_deduction_and_debounce(setup):
    s = setup
    e = s["employee"]()
    s["publish"](s["roster"](e, [(D, "G")]))
    s["punch"](e, f"{D} 09:25:00", f"{D} 09:25:30", f"{D} 16:30:00")  # second tap within 60 s
    r = s["record"](e, D)
    assert r["late_minutes"] == 25 and r["early_minutes"] == 30
    assert r["break_deducted_minutes"] == 30 and r["worked_minutes"] == 425 - 30
    assert r["status"] == "half_day"  # 395 < 420 full-day minutes
    kinds = {x["kind"] for x in s["client"].get("/api/v1/attendance/exceptions",
                                                 params={"employee_id": e["id"]}).json()["items"]}
    assert {"late", "early"} <= kinds


def test_overnight_shift_punches_stay_with_the_night_before(setup):
    s = setup
    e = s["employee"]()
    s["publish"](s["roster"](e, [(D, "N"), (D + timedelta(days=1), "OFF")]))
    s["punch"](e, f"{D} 19:58:00", f"{D + timedelta(days=1)} 08:05:00")
    night = s["record"](e, D)
    assert night["status"] == "present" and night["punch_count"] == 2
    assert night["worked_minutes"] == 727 - 30 and night["is_night"] is True
    next_day = s["record"](e, D + timedelta(days=1))
    assert next_day["status"] == "weekly_off" and next_day["punch_count"] == 0


def test_missing_checkout_is_flagged_not_counted(setup):
    s = setup
    e = s["employee"]()
    s["publish"](s["roster"](e, [(D, "G")]))
    s["punch"](e, f"{D} 08:58:00")
    r = s["record"](e, D)
    assert r["status"] == "missing_punch" and r["worked_minutes"] == 0
    exc = s["client"].get("/api/v1/attendance/exceptions", params={"employee_id": e["id"]}).json()["items"]
    assert exc[0]["kind"] == "missing_out"


def test_absent_holiday_weekly_off(setup):
    s = setup
    c = s["client"]
    e = s["employee"]()
    d1, d2, d3 = D, D + timedelta(days=1), D + timedelta(days=2)
    c.post("/api/v1/workforce/holidays", json={"holiday_date": str(d2), "name": "Festival"})
    s["publish"](s["roster"](e, [(d1, "G"), (d2, "G"), (d3, "OFF")]))
    assert s["record"](e, d1)["status"] == "absent"
    assert s["record"](e, d2)["status"] == "holiday"
    assert s["record"](e, d3)["status"] == "weekly_off"


def test_work_on_weekly_off_is_overtime(setup):
    s = setup
    e = s["employee"]()
    s["publish"](s["roster"](e, [(D, "OFF")]))
    s["punch"](e, f"{D} 10:00:00", f"{D} 14:00:00")
    r = s["record"](e, D)
    assert r["status"] == "present" and r["overtime_minutes"] == 240
    ot = s["client"].get("/api/v1/attendance/overtime").json()
    assert ot[0]["minutes"] == 240 and ot[0]["status"] == "pending"


def test_roster_validation_blocks_rest_violation(setup):
    s = setup
    e = s["employee"]()
    r = s["roster"](e, [(D, "N"), (D + timedelta(days=1), "G")])  # night ends 08:00, day starts 09:00
    v = s["client"].get(f"/api/v1/workforce/rosters/{r['id']}/validate").json()
    assert any("rest" in x["issue"] for x in v["errors"])
    resp = s["publish"](r)
    assert resp.status_code == 409


def test_roster_validation_blocks_inactive_and_warns_non_member(setup, org):
    s = setup
    c = s["client"]
    e = s["employee"](departments=[{"department_id": org["er"]["id"], "is_primary": True}])
    r = s["roster"](e, [(D, "G")], dept=org["icu"]["id"])
    v = c.get(f"/api/v1/workforce/rosters/{r['id']}/validate").json()
    assert any("not a member" in w["issue"] for w in v["warnings"])
    c.post(f"/api/v1/hr/employees/{e['id']}/suspend", json={"reason": "inquiry"})
    assert any("suspended" in x["issue"] for x in c.get(f"/api/v1/workforce/rosters/{r['id']}/validate").json()["errors"])


def test_rotation_generates_pattern(setup, org):
    s = setup
    c = s["client"]
    a, b = s["employee"](), s["employee"]()
    r = c.post("/api/v1/workforce/rosters", json={"department_id": org["icu"]["id"],
                                                  "period_start": "2026-12-01", "period_end": "2026-12-04"}).json()
    resp = c.post(f"/api/v1/workforce/rosters/{r['id']}/rotation",
                  json={"employee_ids": [a["id"], b["id"]], "pattern": ["G", "OFF"], "stagger": True})
    assert resp.status_code == 200 and resp.json()["assignment_count"] == 8
    cells = c.get("/api/v1/workforce/assignments", params={"date_from": "2026-12-01", "date_to": "2026-12-01",
                                                           "roster_id": r["id"]}).json()
    assert {x["shift_code"] for x in cells} == {"G", None}  # staggered: one works, one is off


def _setup_leave(c, annual=12):
    lt = c.post("/api/v1/hr/leave/types", json={"code": f"CL{uuid.uuid4().hex[:4]}", "name": "Casual leave"}).json()
    c.post("/api/v1/hr/leave/policies", json={"leave_type_id": lt["id"], "annual_allocation": annual,
                                               "effective_from": "2025-01-01"})
    return lt


def test_leave_flow_manager_then_hr(setup, make_principal, client_for):
    s = setup
    c, principal = s["client"], s["principal"]
    mgr = s["employee"](hms_username="mgr.one")
    me = s["employee"](hms_username="nurse.one", reporting_manager_id=mgr["id"])
    lt = _setup_leave(c)
    start = date.today() + timedelta(days=10)
    nurse = client_for(make_principal(perms=[], tenant=principal.tenant_code, username="nurse.one"))
    req = nurse.post("/api/v1/hr/leave/requests", json={
        "leave_type_id": lt["id"], "start_date": str(start), "end_date": str(start + timedelta(days=3)),
        "reason": "family function"})
    assert req.status_code == 201, req.text
    req = req.json()
    assert req["status"] == "pending" and float(req["days"]) == 4
    bal = nurse.get(f"/api/v1/hr/leave/balances/{me['id']}").json()
    cl = next(b for b in bal if b["leave_type_id"] == lt["id"])
    assert float(cl["pending"]) == 4 and float(cl["available"]) == 8

    assert nurse.post(f"/api/v1/hr/approvals/{req['approval_instance_id']}/act",
                      json={"action": "approve"}).status_code == 403  # no self-approval
    manager = client_for(make_principal(perms=[], tenant=principal.tenant_code, username="mgr.one"))
    inbox = manager.get("/api/v1/hr/approvals").json()
    assert [i["id"] for i in inbox] == [req["approval_instance_id"]]
    step1 = manager.post(f"/api/v1/hr/approvals/{req['approval_instance_id']}/act", json={"action": "approve"}).json()
    assert step1["status"] == "pending" and step1["current_index"] == 1  # 4 days >= 3: HR step applies
    assert manager.post(f"/api/v1/hr/approvals/{req['approval_instance_id']}/act",
                        json={"action": "approve"}).status_code == 403  # HR step is not the manager's
    hr = client_for(make_principal(perms=[HR_READ, LEAVES_WRITE], tenant=principal.tenant_code, username="hr.x"))
    done = hr.post(f"/api/v1/hr/approvals/{req['approval_instance_id']}/act", json={"action": "approve"}).json()
    assert done["status"] == "approved"
    cl = next(b for b in hr.get(f"/api/v1/hr/leave/balances/{me['id']}").json() if b["leave_type_id"] == lt["id"])
    assert float(cl["used"]) == 4 and float(cl["pending"]) == 0
    cancelled = nurse.post(f"/api/v1/hr/leave/requests/{req['id']}/cancel", json={"reason": "plans changed"}).json()
    assert cancelled["status"] == "cancelled"
    cl = next(b for b in hr.get(f"/api/v1/hr/leave/balances/{me['id']}").json() if b["leave_type_id"] == lt["id"])
    assert float(cl["used"]) == 0


def test_leave_validation(setup):
    s = setup
    c = s["client"]
    e = s["employee"]()
    lt = _setup_leave(c, annual=2)
    start = date.today() + timedelta(days=5)
    body = {"employee_id": e["id"], "leave_type_id": lt["id"], "start_date": str(start),
            "end_date": str(start + timedelta(days=4)), "reason": "trip"}
    r = c.post("/api/v1/hr/leave/requests", json=body)
    assert r.status_code == 400 and "Insufficient" in r.json()["error"]
    ok = c.post("/api/v1/hr/leave/requests", json={**body, "end_date": str(start)})
    assert ok.status_code == 201
    clash = c.post("/api/v1/hr/leave/requests", json={**body, "end_date": str(start)})
    assert clash.status_code == 409


def test_approved_leave_shows_in_attendance(setup):
    s = setup
    c = s["client"]
    e = s["employee"]()
    s["publish"](s["roster"](e, [(D, "G")]))
    lt = _setup_leave(c)
    req = c.post("/api/v1/hr/leave/requests", json={"employee_id": e["id"], "leave_type_id": lt["id"],
                                                     "start_date": str(D), "end_date": str(D), "reason": "fever",
                                                     "emergency": True}).json()
    assert c.post(f"/api/v1/hr/approvals/{req['approval_instance_id']}/act",
                  json={"action": "approve"}).status_code == 403  # HR raised it, so HR cannot approve it
    s["approve"](req["approval_instance_id"])
    assert s["record"](e, D)["status"] == "on_leave"


def test_correction_adds_manual_punch_after_approval(setup):
    s = setup
    c = s["client"]
    e = s["employee"]()
    s["publish"](s["roster"](e, [(D, "G")]))
    s["punch"](e, f"{D} 08:58:00")
    corr = c.post("/api/v1/attendance/corrections", json={
        "employee_id": e["id"], "work_date": str(D), "punch_times": [f"{D}T17:02:00+05:30"],
        "reason": "Forgot to punch out after a code blue"}).json()
    assert s["record"](e, D)["status"] == "missing_punch"
    s["approve"](corr["approval_instance_id"])
    r = s["record"](e, D)
    assert r["status"] == "present" and r["punch_count"] == 2
    manual = c.get("/api/v1/attendance/punches", params={"employee_id": e["id"], "date_from": str(D),
                                                         "date_to": str(D)}).json()["items"]
    assert any(p["source"] == "manual" for p in manual)


def test_correction_outside_window_rejected(setup):
    s = setup
    e = s["employee"]()
    s["publish"](s["roster"](e, [(D, "G")]))
    r = s["client"].post("/api/v1/attendance/corrections", json={
        "employee_id": e["id"], "work_date": str(D), "punch_times": [f"{D + timedelta(days=2)}T09:00:00+05:30"],
        "reason": "wrong day entirely"})
    assert r.status_code == 400


def test_shift_swap_on_approval(setup, org):
    s = setup
    c = s["client"]
    a, b = s["employee"](), s["employee"]()
    day = date.today() + timedelta(days=7)
    r = c.post("/api/v1/workforce/rosters", json={"department_id": org["icu"]["id"], "period_start": str(day),
                                                  "period_end": str(day)}).json()
    c.put(f"/api/v1/workforce/rosters/{r['id']}/assignments", json=[
        {"employee_id": a["id"], "work_date": str(day), "shift_template_id": s["day"]["id"]},
        {"employee_id": b["id"], "work_date": str(day), "shift_template_id": s["night"]["id"]}])
    assert s["publish"](r).status_code == 200
    cells = {x["employee_id"]: x for x in c.get("/api/v1/workforce/assignments", params={
        "date_from": str(day), "date_to": str(day)}).json()}
    sw = c.post("/api/v1/workforce/swaps", json={
        "kind": "swap", "requester_assignment_id": str(cells[a["id"]]["id"]), "counterpart_employee_id": b["id"],
        "counterpart_assignment_id": str(cells[b["id"]]["id"]), "reason": "childcare"}).json()
    s["approve"](sw["approval_instance_id"])
    after = {x["employee_id"]: x["shift_code"] for x in c.get("/api/v1/workforce/assignments", params={
        "date_from": str(day), "date_to": str(day)}).json()}
    assert after == {a["id"]: "N", b["id"]: "G"}


def test_overtime_approval(setup):
    s = setup
    c = s["client"]
    e = s["employee"]()
    s["publish"](s["roster"](e, [(D, "G")]))
    s["punch"](e, f"{D} 08:55:00", f"{D} 19:00:00")
    ot = c.get("/api/v1/attendance/overtime").json()[0]
    assert ot["minutes"] == (605 - 30) - 450
    sub = c.post(f"/api/v1/attendance/overtime/{ot['id']}/submit").json()
    s["approve"](sub["approval_instance_id"])
    assert c.get("/api/v1/attendance/overtime").json()[0]["approved_minutes"] == ot["minutes"]


def test_coverage_and_census(setup, org):
    s = setup
    c = s["client"]
    e = s["employee"]()
    day = date.today() + timedelta(days=3)
    c.post("/api/v1/workforce/requirements", json={"department_id": org["icu"]["id"], "employee_category": "nurse",
                                                   "min_count": 2, "patients_per_staff": 2,
                                                   "effective_from": "2026-01-01"})
    r = c.post("/api/v1/workforce/rosters", json={"department_id": org["icu"]["id"], "period_start": str(day),
                                                  "period_end": str(day)}).json()
    c.put(f"/api/v1/workforce/rosters/{r['id']}/assignments", json=[
        {"employee_id": e["id"], "work_date": str(day), "shift_template_id": s["day"]["id"]}])
    s["publish"](r)
    cov = c.get("/api/v1/workforce/coverage", params={"date_from": str(day), "department_id": org["icu"]["id"],
                                                      "census": f"{org['icu']['id']}:8"}).json()
    row = cov["rows"][0]
    assert row["required"] == 4 and row["assigned"] == 1 and row["shortage"] == 3


def test_workflow_configuration_and_delegation(setup, make_principal, client_for):
    s = setup
    c, principal = s["client"], s["principal"]
    resp = c.put("/api/v1/hr/workflows/leave", json={"steps": [
        {"name": "HR only", "approver_type": "permission", "permission": "hr.leaves.write"}]})
    assert resp.status_code == 200 and len(resp.json()["steps"]) == 1
    e = s["employee"](hms_username="req.user")
    lt = _setup_leave(c)
    start = date.today() + timedelta(days=20)
    requester = client_for(make_principal(tenant=principal.tenant_code, username="req.user"))
    req = requester.post("/api/v1/hr/leave/requests", json={"leave_type_id": lt["id"], "start_date": str(start),
                                                             "end_date": str(start), "reason": "errand"}).json()
    hr = client_for(make_principal(perms=[HR_READ, LEAVES_WRITE], tenant=principal.tenant_code, username="hr.a"))
    hr.post(f"/api/v1/hr/approvals/{req['approval_instance_id']}/act",
            json={"action": "delegate", "delegate_to": "hr.b"})
    assert hr.post(f"/api/v1/hr/approvals/{req['approval_instance_id']}/act",
                   json={"action": "approve"}).status_code == 403
    other = client_for(make_principal(perms=[HR_READ], tenant=principal.tenant_code, username="hr.b"))
    assert other.post(f"/api/v1/hr/approvals/{req['approval_instance_id']}/act",
                      json={"action": "reject"}).status_code == 400  # a rejection needs a reason
    done = other.post(f"/api/v1/hr/approvals/{req['approval_instance_id']}/act",
                      json={"action": "approve"}).json()
    assert done["status"] == "approved"
    assert [a["action"] for a in done["actions"]] == ["delegate", "approve"]
    assert e["id"]
