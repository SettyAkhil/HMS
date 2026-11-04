"""Payroll: compensation, statutory settings, attendance-driven LOP and
overtime, approval vs finalization, immutability, reversal, payslips.

The statutory figures below are test inputs, not a statement of current law;
the service only applies what a hospital configures."""

from datetime import date

import pytest
from sqlalchemy import text

from app.db import tenant_session
from app.security import HR_READ, PAYROLL_WRITE

PF = {"employee_rate": 12, "employer_rate": 12, "wage_ceiling": 15000, "apply_ceiling": True}
ESI = {"employee_rate": 0.75, "employer_rate": 3.25, "gross_ceiling": 21000}
PT = {"states": {"KA": [{"min": 0, "max": 24999.99, "amount": 0}, {"min": 25000, "max": None, "amount": 200}]}}
OT = {"multiplier": 2, "hours_per_day": 8, "night_allowance_per_shift": 0}


@pytest.fixture()
def pay(setup):
    """A payroll-ready tenant: components, structure, statutory settings."""
    c = setup["client"]
    for code, name, pf in (("BASIC", "Basic", True), ("HRA", "House rent allowance", False),
                           ("SPECIAL", "Special allowance", False)):
        assert c.post("/api/v1/payroll/components", json={"code": code, "name": name, "kind": "earning",
                                                          "pf_wage": pf}).status_code == 201
    structure = c.post("/api/v1/payroll/structures", json={"code": "STD", "name": "Standard", "lines": [
        {"component": "BASIC", "calc": "percent_of_ctc", "value": 40},
        {"component": "HRA", "calc": "percent_of_basic", "value": 50},
        {"component": "SPECIAL", "calc": "balance"}]}).json()
    for kind, cfg in (("pf", PF), ("esi", ESI), ("pt", PT), ("overtime", OT)):
        r = c.put(f"/api/v1/payroll/statutory/{kind}", json={"config": cfg, "effective_from": "2026-01-01",
                                                             "source_note": "test values"})
        assert r.status_code == 200, r.text
    return {**setup, "structure": structure}


def _employee_with_pay(pay, gross=30000, **kw):
    c = pay["client"]
    e = pay["employee"](joining_date="2026-10-01", **kw)
    r = c.post(f"/api/v1/payroll/compensation/{e['id']}", json={
        "structure_id": pay["structure"]["id"], "monthly_gross": gross, "effective_from": "2026-10-01",
        "pt_state": "KA", "bank_account": "001234567890", "bank_ifsc": "HDFC0001234", "pan": "ABCDE1234F"})
    assert r.status_code == 201, r.text
    assert r.json()["bank_account"] == "••••7890" and r.json()["pan"] == "AB••••4F"
    return e


def test_structure_breakdown_and_validation(pay):
    c = pay["client"]
    lines = c.post(f"/api/v1/payroll/structures/{pay['structure']['id']}/preview",
                   params={"monthly_gross": 30000}).json()
    assert {l["code"]: float(l["amount"]) for l in lines} == {"BASIC": 12000, "HRA": 6000, "SPECIAL": 12000}
    bad = c.put("/api/v1/payroll/statutory/pt", json={"config": {"states": {"KA": [
        {"min": 0, "max": 30000, "amount": 0}, {"min": 25000, "max": None, "amount": 200}]}},
        "effective_from": "2026-01-01"})
    assert bad.status_code == 400  # overlapping slabs


def test_full_payroll_cycle(pay, make_principal, client_for):
    s, c = pay, pay["client"]
    e = _employee_with_pay(pay)
    d_absent, d_ot = date(2026, 10, 5), date(2026, 10, 6)
    s["publish"](s["roster"](e, [(d_absent, "G"), (d_ot, "G")]))
    s["punch"](e, f"{d_ot} 08:55:00", f"{d_ot} 19:00:00")
    ot = c.get("/api/v1/attendance/overtime").json()[0]
    assert ot["minutes"] == 125
    s["approve"](c.post(f"/api/v1/attendance/overtime/{ot['id']}/submit").json()["approval_instance_id"])

    run = c.post("/api/v1/payroll/runs", json={"year": 2026, "month": 10}).json()
    assert c.post("/api/v1/payroll/runs", json={"year": 2026, "month": 10}).status_code == 409
    calc = c.post(f"/api/v1/payroll/runs/{run['id']}/calculate").json()
    assert calc["status"] == "calculated"
    item = next(i for i in c.get(f"/api/v1/payroll/runs/{run['id']}").json()["items"] if i["employee_id"] == e["id"])
    earn = {l["code"]: float(l["amount"]) for l in item["earnings"]}
    ded = {l["code"]: float(l["amount"]) for l in item["deductions"]}
    assert float(item["lop_days"]) == 1 and float(item["payable_days"]) == 30
    assert earn == {"BASIC": 11613, "HRA": 5806, "SPECIAL": 11613, "OVERTIME": 504}  # 30000/31/8 = 120.97/h, × 2 multiplier × 125/60 h
    assert ded == {"PF": 1394, "PT": 200}  # ESI: monthly gross above its ceiling
    assert float(item["gross"]) == 29536 and float(item["net"]) == 29536 - 1594
    assert item["status"] == "warning"  # days without calculated attendance are flagged

    # Approval and finalization are separate steps, by someone other than the preparer.
    sub = c.post(f"/api/v1/payroll/runs/{run['id']}/submit").json()
    assert sub["status"] == "in_review"
    assert c.post(f"/api/v1/payroll/runs/{run['id']}/finalize").status_code == 409  # not yet approved
    assert c.post(f"/api/v1/hr/approvals/{sub['approval_instance_id']}/act",
                  json={"action": "approve"}).status_code == 403  # preparer cannot approve
    s["approve"](sub["approval_instance_id"])
    fin = c.post(f"/api/v1/payroll/runs/{run['id']}/finalize").json()
    assert fin["status"] == "finalized" and fin["posting_status"] == "pending"  # no session to post with in tests
    assert fin["posting_reference"]["event"]["type"] == "PAYROLL_RUN"

    # Finalized means immutable: API, recalculation and direct SQL all refuse.
    assert c.post(f"/api/v1/payroll/runs/{run['id']}/calculate").status_code == 409
    with pytest.raises(Exception, match="immutable"):
        with tenant_session(s["principal"].tenant_id) as db:
            db.execute(text("UPDATE payroll_items SET net = 1 WHERE run_id = :r"), {"r": run["id"]})
    locked = s["record"](e, d_absent)
    assert locked["locked"] is True

    # Payslip: the employee can see their own, nobody else without payroll rights.
    slips = c.get("/api/v1/payroll/payslips", params={"employee_id": e["id"]}).json()
    assert len(slips) == 1 and slips[0]["number"].startswith("PS-202610-")
    snap = c.get(f"/api/v1/payroll/payslips/{slips[0]['id']}").json()["snapshot"]
    assert float(snap["net"]) == 29536 - 1594 and "7890" in snap["employee"]["bank"] and "001234" not in str(snap)
    stranger = client_for(make_principal(perms=[HR_READ], tenant=s["principal"].tenant_code, username="nosy"))
    assert stranger.get(f"/api/v1/payroll/payslips/{slips[0]['id']}").status_code == 403

    # Reversal voids the run, unlocks attendance, and lets the month run again.
    rev = c.post(f"/api/v1/payroll/runs/{run['id']}/reverse", json={"reason": "Wrong attendance for ICU"}).json()
    assert rev["kind"] == "reversal" and float(rev["totals"]["net"]) == -(29536 - 1594)
    assert c.get("/api/v1/payroll/payslips", params={"employee_id": e["id"]}).json() == []
    assert s["record"](e, d_absent)["locked"] is False
    assert c.post("/api/v1/payroll/runs", json={"year": 2026, "month": 10}).status_code == 201


def test_missing_statutory_settings_block_submission(setup):
    c = setup["client"]
    c.post("/api/v1/payroll/components", json={"code": "BASIC", "name": "Basic", "kind": "earning", "pf_wage": True})
    st = c.post("/api/v1/payroll/structures", json={"code": "B", "name": "Basic only", "lines": [
        {"component": "BASIC", "calc": "balance"}]}).json()
    e = setup["employee"](joining_date="2026-10-01")
    c.post(f"/api/v1/payroll/compensation/{e['id']}", json={"structure_id": st["id"], "monthly_gross": 20000,
                                                             "effective_from": "2026-10-01"})
    run = c.post("/api/v1/payroll/runs", json={"year": 2026, "month": 10}).json()
    c.post(f"/api/v1/payroll/runs/{run['id']}/calculate")
    detail = c.get(f"/api/v1/payroll/runs/{run['id']}").json()
    assert detail["items"][0]["status"] == "error" and "PF" in detail["items"][0]["warnings"][0]
    assert c.post(f"/api/v1/payroll/runs/{run['id']}/submit").status_code == 409


def test_loans_and_adjustments_applied_on_finalize(pay):
    c = pay["client"]
    e = _employee_with_pay(pay, gross=20000)
    c.post("/api/v1/payroll/loans", json={"employee_id": e["id"], "kind": "advance", "principal": 3000,
                                          "installment": 1000, "start_year": 2026, "start_month": 10})
    c.post("/api/v1/payroll/adjustments", json={"employee_id": e["id"], "year": 2026, "month": 10, "kind": "earning",
                                                "code": "INCENTIVE", "amount": 1500, "reason": "ICU incentive"})
    run = c.post("/api/v1/payroll/runs", json={"year": 2026, "month": 10}).json()
    c.post(f"/api/v1/payroll/runs/{run['id']}/calculate")
    item = c.get(f"/api/v1/payroll/runs/{run['id']}").json()["items"][0]
    assert {l["code"] for l in item["earnings"]} >= {"INCENTIVE"}
    assert {l["code"]: float(l["amount"]) for l in item["deductions"]}["ADVANCE"] == 1000
    assert {l["code"] for l in item["deductions"]} >= {"ESI"}  # 20000 is under the ESI ceiling
    sub = c.post(f"/api/v1/payroll/runs/{run['id']}/submit").json()
    pay["approve"](sub["approval_instance_id"])
    c.post(f"/api/v1/payroll/runs/{run['id']}/finalize")
    loan = c.get("/api/v1/payroll/loans", params={"employee_id": e["id"]}).json()[0]
    assert float(loan["recovered"]) == 1000
    adj = c.get("/api/v1/payroll/adjustments").json()[0]
    assert adj["status"] == "applied"


def test_compensation_is_effective_dated_and_restricted(pay, make_principal, client_for):
    c = pay["client"]
    e = _employee_with_pay(pay)
    r = c.post(f"/api/v1/payroll/compensation/{e['id']}", json={
        "structure_id": pay["structure"]["id"], "monthly_gross": 35000, "effective_from": "2026-12-01",
        "reason": "annual revision"})
    assert r.status_code == 201
    hist = c.get(f"/api/v1/payroll/compensation/{e['id']}").json()
    assert [h["effective_to"] for h in hist] == [None, "2026-11-30"]
    hr_only = client_for(make_principal(perms=[HR_READ], tenant=pay["principal"].tenant_code))
    assert hr_only.get(f"/api/v1/payroll/compensation/{e['id']}").status_code == 403
    assert c.post("/api/v1/payroll/runs", json={"year": 2030, "month": 1}).status_code == 400
    assert PAYROLL_WRITE
