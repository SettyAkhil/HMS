from datetime import date

from app.security import EMPLOYEES_WRITE, HR_READ


def test_create_assigns_sequential_codes_and_history(admin, employee_factory):
    client, _ = admin
    a = employee_factory()
    b = employee_factory()
    assert a["employee_code"] == "EMP-000001"
    assert b["employee_code"] == "EMP-000002"
    assert a["status"] == "active"
    assert a["departments"][0]["is_primary"] is True
    history = client.get(f"/api/v1/hr/employees/{a['id']}/history").json()
    assert history[0]["event_type"] == "joined"
    records = client.get(f"/api/v1/hr/employees/{a['id']}/employment").json()
    assert records[0]["change_type"] == "joined"


def test_list_search_and_filters(admin, org, employee_factory):
    client, _ = admin
    employee_factory(first_name="Meera")
    employee_factory(first_name="Ravi", employee_category="emergency_staff",
                     departments=[{"department_id": org["er"]["id"], "is_primary": True}])
    assert client.get("/api/v1/hr/employees", params={"search": "meer"}).json()["total"] == 1
    er = client.get("/api/v1/hr/employees", params={"department_id": org["er"]["id"]}).json()
    assert [e["full_name"].split()[0] for e in er["items"]] == ["Ravi"]
    assert er["items"][0]["department"] == "Emergency"
    assert client.get("/api/v1/hr/employees", params={"employee_category": "nurse"}).json()["total"] == 1
    page = client.get("/api/v1/hr/employees", params={"page_size": 1, "page": 2}).json()
    assert page["total"] == 2 and len(page["items"]) == 1


def test_validation_errors_are_field_level(admin):
    client, _ = admin
    resp = client.post("/api/v1/hr/employees", json={"first_name": "", "employee_category": "wizard",
                                                      "joining_date": "nope"})
    assert resp.status_code == 422
    fields = {f["field"] for f in resp.json()["details"]["fields"]}
    assert {"first_name", "employee_category", "joining_date"} <= fields


def test_contract_needs_end_date(admin, employee_factory):
    client, _ = admin
    resp = client.post("/api/v1/hr/employees", json={"first_name": "X", "employee_category": "support",
                                                      "joining_date": "2026-01-01", "employment_type": "contract"})
    assert resp.status_code == 422


def test_personal_fields_hidden_from_readers(admin, employee_factory, make_principal, client_for):
    _, principal = admin
    emp = employee_factory(date_of_birth="1990-04-01", address_line="12 MG Road",
                           contacts=[{"name": "Kiran", "relationship": "spouse", "phone": "+91 98450 00000"}])
    assert emp["date_of_birth"] == "1990-04-01"
    reader = client_for(make_principal(perms=[HR_READ], tenant=principal.tenant_code))
    seen = reader.get(f"/api/v1/hr/employees/{emp['id']}").json()
    assert seen["personal_restricted"] is True
    assert seen["date_of_birth"] is None and seen["address_line"] is None and seen["contacts"] == []


def test_update_is_audited_without_personal_values(admin, employee_factory):
    client, _ = admin
    emp = employee_factory()
    resp = client.patch(f"/api/v1/hr/employees/{emp['id']}", json={"phone": "+91 90000 11111",
                                                                     "date_of_birth": "1988-02-02"})
    assert resp.status_code == 200
    audit = client.get(f"/api/v1/hr/employees/{emp['id']}/audit").json()
    update = next(a for a in audit if a["action"] == "updated")
    assert update["changes"]["date_of_birth"] == "changed"
    assert update["changes"]["phone"][1] == "+91 90000 11111"


def test_transfer_keeps_history(admin, org, employee_factory):
    client, _ = admin
    emp = employee_factory()
    resp = client.post(f"/api/v1/hr/employees/{emp['id']}/transfer", json={
        "effective_from": "2026-06-01", "reason": "ER staffing shortfall",
        "departments": [{"department_id": org["er"]["id"], "is_primary": True},
                        {"department_id": org["icu"]["id"], "allocation_percent": 20}],
    })
    assert resp.status_code == 200, resp.text
    depts = resp.json()["departments"]
    open_ = [d for d in depts if d["effective_to"] is None]
    closed = [d for d in depts if d["effective_to"] is not None]
    assert {d["department_name"] for d in open_} == {"Emergency", "Intensive Care"}
    assert next(d for d in open_ if d["is_primary"])["department_name"] == "Emergency"
    assert closed[0]["effective_to"] == "2026-05-31"
    records = client.get(f"/api/v1/hr/employees/{emp['id']}/employment").json()
    assert [r["change_type"] for r in records] == ["transfer", "joined"]
    assert records[1]["effective_to"] == "2026-05-31"


def test_transfer_before_current_assignment_is_rejected(admin, org, employee_factory):
    client, _ = admin
    emp = employee_factory()
    resp = client.post(f"/api/v1/hr/employees/{emp['id']}/transfer", json={
        "effective_from": "2025-01-01", "reason": "backdated",
        "departments": [{"department_id": org["er"]["id"], "is_primary": True}],
    })
    assert resp.status_code == 400


def test_lifecycle_transitions(admin, employee_factory):
    client, _ = admin
    emp = employee_factory()
    url = f"/api/v1/hr/employees/{emp['id']}"
    assert client.post(f"{url}/archive", json={"reason": "too early"}).status_code == 409
    assert client.post(f"{url}/suspend", json={"reason": "inquiry"}).json()["status"] == "suspended"
    assert client.post(f"{url}/activate", json={"reason": "cleared"}).json()["status"] == "active"
    # An exit dated before today's suspend/activate records would rewrite history.
    backdated = client.post(f"{url}/terminate", json={"reason": "resigned", "effective_date": "2026-01-10"})
    assert backdated.status_code == 400
    done = client.post(f"{url}/terminate", json={"reason": "resigned"}).json()
    assert done["status"] == "terminated" and done["exit_date"] == str(date.today())
    assert all(d["effective_to"] for d in done["departments"])
    assert client.post(f"{url}/archive", json={"reason": "retention"}).json()["status"] == "archived"
    assert client.patch(url, json={"phone": "+91 99999 99999"}).status_code == 409


def test_cannot_change_own_status(make_principal, client_for, org, employee_factory, admin):
    _, principal = admin
    emp = employee_factory(hms_username="hr.self")
    me = client_for(make_principal(perms=[HR_READ, EMPLOYEES_WRITE], tenant=principal.tenant_code,
                                   username="hr.self"))
    assert me.post(f"/api/v1/hr/employees/{emp['id']}/suspend", json={"reason": "test"}).status_code == 403


def test_registration_required_to_activate_consultant(admin, org):
    client, _ = admin
    base = {"first_name": "Dr", "last_name": "Iyer", "employee_category": "consultant",
            "joining_date": "2026-02-01", "designation_id": org["consultant"]["id"]}
    resp = client.post("/api/v1/hr/employees", json={**base, "activate": True})
    assert resp.status_code == 400
    draft = client.post("/api/v1/hr/employees", json=base).json()
    assert draft["status"] == "draft"
    assert client.post(f"/api/v1/hr/employees/{draft['id']}/activate", json={"reason": "joined"}).status_code == 400
    cred = client.post(f"/api/v1/hr/employees/{draft['id']}/credentials", json={
        "credential_type": "medical_registration", "number": "KMC-12345", "issuing_authority": "Karnataka Medical Council",
        "issued_on": "2015-01-01", "expires_on": "2030-01-01",
    })
    assert cred.status_code == 201
    assert client.post(f"/api/v1/hr/employees/{draft['id']}/activate", json={"reason": "joined"}).json()["status"] == "active"


def test_reporting_line_cannot_loop(admin, employee_factory, org):
    client, _ = admin
    boss = employee_factory()
    report = employee_factory(reporting_manager_id=boss["id"])
    resp = client.post(f"/api/v1/hr/employees/{boss['id']}/transfer", json={
        "effective_from": "2026-03-01", "reason": "restructure", "reporting_manager_id": report["id"],
        "departments": [{"department_id": org["icu"]["id"], "is_primary": True}],
    })
    assert resp.status_code == 400
    assert "loop" in resp.json()["error"]


def test_import_dry_run_then_commit(admin, org):
    client, _ = admin
    csv_body = (
        "first_name,last_name,employee_category,joining_date,department_code,designation_code\n"
        "Lata,Nair,nurse,2026-03-01,ICU,SN\n"
        "Bad,Row,nurse,2026-03-01,NOPE,SN\n"
    )
    resp = client.post("/api/v1/hr/employees/import", files={"file": ("e.csv", csv_body, "text/csv")},
                       params={"dry_run": "false"})
    body = resp.json()
    assert body["created"] == 0 and body["errors"][0]["row"] == 3  # any error blocks the whole file
    good = csv_body.splitlines()[0] + "\n" + csv_body.splitlines()[1] + "\n"
    ok = client.post("/api/v1/hr/employees/import", files={"file": ("e.csv", good, "text/csv")},
                     params={"dry_run": "false"}).json()
    assert ok["created"] == 1


def test_export_requires_write_and_neutralises_formulas(admin, employee_factory, make_principal, client_for):
    client, principal = admin
    employee_factory(first_name="=HYPERLINK(evil)")
    csv_text = client.get("/api/v1/hr/employees/export.csv").text
    assert "'=HYPERLINK" in csv_text
    reader = client_for(make_principal(perms=[HR_READ], tenant=principal.tenant_code))
    assert reader.get("/api/v1/hr/employees/export.csv").status_code == 403


def test_directory_facets(admin, employee_factory):
    client, _ = admin
    employee_factory()
    employee_factory()
    employee_factory(employee_category="support", designation_id=None)
    f = client.get("/api/v1/hr/employees/facets", params={"status": "active", "employee_category": "nurse"}).json()
    assert f["employee_category"] == {"nurse": 2, "support": 1}  # ignores its own filter
    assert f["status"] == {"active": 2}  # honours the category filter
