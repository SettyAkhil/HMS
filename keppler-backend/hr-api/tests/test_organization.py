from app.security import HR_READ, ORG_WRITE


def test_hierarchy_and_tree(admin, org):
    client, _ = admin
    sub = client.post("/api/v1/hr/departments", json={
        "code": "MICU", "name": "Medical ICU", "parent_id": org["icu"]["id"], "branch_id": org["branch"]["id"],
    })
    assert sub.status_code == 201
    unit = client.post("/api/v1/hr/units", json={"department_id": sub.json()["id"], "code": "BAY-A", "name": "Bay A"})
    assert unit.status_code == 201

    tree = client.get("/api/v1/hr/organization/tree").json()
    hospital = tree[0]
    assert hospital["type"] == "hospital"
    icu = next(d for d in hospital["children"][0]["children"] if d["code"] == "ICU")
    micu = next(c for c in icu["children"] if c["code"] == "MICU")
    assert micu["children"][0]["code"] == "BAY-A"


def test_department_cannot_be_its_own_ancestor(admin, org):
    client, _ = admin
    child = client.post("/api/v1/hr/departments", json={"code": "C1", "name": "Child", "parent_id": org["icu"]["id"]}).json()
    resp = client.patch(f"/api/v1/hr/departments/{org['icu']['id']}", json={"parent_id": child["id"]})
    assert resp.status_code == 400
    assert "itself" in resp.json()["error"]


def test_duplicate_department_code_is_conflict(admin, org):
    client, _ = admin
    resp = client.post("/api/v1/hr/departments", json={"code": "ICU", "name": "Again"})
    assert resp.status_code == 409
    assert resp.json()["code"] == "conflict"


def test_department_with_staff_cannot_be_deleted(admin, org, employee_factory):
    client, _ = admin
    employee_factory()
    resp = client.delete(f"/api/v1/hr/departments/{org['icu']['id']}")
    assert resp.status_code == 409
    assert resp.json()["details"]["assigned_employees"] == 1


def test_budget_hidden_without_payroll_rights(admin, org, make_principal, client_for):
    client, principal = admin
    client.patch(f"/api/v1/hr/departments/{org['icu']['id']}", json={"annual_budget": "1500000.00"})
    icu = next(d for d in client.get("/api/v1/hr/departments").json() if d["code"] == "ICU")
    assert icu["annual_budget"] is not None

    reader = client_for(make_principal(perms=[HR_READ, ORG_WRITE], tenant=principal.tenant_code))
    rows = reader.get("/api/v1/hr/departments").json()
    assert all(r["annual_budget"] is None for r in rows)
    # Nor can an org editor without payroll rights set one.
    reader.patch(f"/api/v1/hr/departments/{org['er']['id']}", json={"annual_budget": "1"})
    client_for(principal)
    er = next(d for d in client.get("/api/v1/hr/departments").json() if d["code"] == "ER")
    assert er["annual_budget"] is None


def test_headcount_counts_active_primary_staff(admin, org, employee_factory):
    client, _ = admin
    employee_factory()
    employee_factory()
    icu = next(d for d in client.get("/api/v1/hr/departments").json() if d["code"] == "ICU")
    assert icu["headcount"] == 2


def test_dashboard_reflects_records(admin, org, employee_factory):
    client, _ = admin
    employee_factory()
    emp = employee_factory(employee_category="consultant", designation_id=org["consultant"]["id"],
                           credentials=[{"credential_type": "medical_registration", "number": "R1",
                                         "expires_on": "2026-11-20"}])
    client.post(f"/api/v1/hr/employees/{emp['id']}/suspend", json={"reason": "inquiry"})
    d = client.get("/api/v1/hr/dashboard", params={"expiring_within_days": 365}).json()
    assert d["employees"]["total"] == 2 and d["employees"]["active"] == 1 and d["employees"]["inactive"] == 1
    assert d["employees"]["by_category"] == {"nurse": 1}
    assert d["attendance_today"]["not_arrived"] == 1
    assert d["recent_activity"][0]["event_type"] == "suspend"
    scoped = client.get("/api/v1/hr/dashboard", params={"department_id": org["er"]["id"]}).json()
    assert scoped["employees"]["total"] == 0


def test_dashboard_trend_attention_badges_and_summary(setup):
    s = setup
    c = s["client"]
    from datetime import date, timedelta

    e = s["employee"](credentials=[{"credential_type": "nursing_registration", "number": "X1",
                                    "expires_on": str(date.today() + timedelta(days=10))}])
    d = date.today() - timedelta(days=2)
    s["publish"](s["roster"](e, [(d, "G")]))
    s["punch"](e, f"{d} 09:30:00")
    dash = c.get("/api/v1/hr/dashboard").json()
    assert len(dash["attendance_trend"]) == 14
    day = next(x for x in dash["attendance_trend"] if x["date"] == str(d))
    assert day["exceptions"] == 1 and day["late"] == 1
    assert any(a["kind"] == "credentials" for a in dash["attention"])
    assert any(a["kind"] == "missing_punch" for a in dash["attention"])
    badges = c.get("/api/v1/hr/dashboard/badges").json()
    assert badges["attendance"] == 1
    summary = c.get(f"/api/v1/hr/employees/{e['id']}/summary").json()
    assert summary["open_exceptions"] >= 1 and summary["tenure"]  # late_days counts the current month only
