"""Workflows that end in a posting: vouchers, closing, assets, tills, reconciliation.

Each function runs inside the caller's transaction (routes.py opens it), so a
workflow step and the journal it produces commit together or not at all.
"""

import json
from datetime import date, timedelta
from decimal import Decimal

from .ledger import (
    LedgerError, as_date, audit, money, open_period_for, post_journal, resolve_account, row_dict,
)

ZERO = Decimal("0.00")


# ── Maker-checker vouchers ──────────────────────────────────────────────────
# Payments (PV), manual journals (JV) and opening balances (OB) are prepared by one
# person and posted only when a *different* person approves them. The voucher holds
# the exact journal it will post; it is validated on submission and again on
# approval (the books may have moved in between -- a period closed, an invoice paid).


def _pv_lines(cur, hospital_id, payload):
    """A payment voucher's journal: settle the supplier invoice (or expense it), less TDS."""
    amount, tds = money(payload.get("amount")), money(payload.get("tds"))
    if amount <= 0:
        raise LedgerError("Payment amount must be positive.")
    if tds < 0 or tds >= amount:
        raise LedgerError("TDS must be less than the payment amount.")
    bank = resolve_account(cur, hospital_id, payload.get("bank_account") or {"role": "BANK_PRIMARY"})
    if not (bank["is_bank"] or bank["is_cash"]):
        raise LedgerError(f"{bank['code']} {bank['name']} is not a bank or cash account.")
    if payload.get("supplier_invoice_no"):
        supplier = payload.get("supplier") or {}
        debit = {"account": {"role": "AP_TRADE"}, "party": supplier,
                 "document_no": payload["supplier_invoice_no"]}
    else:
        debit = {"account": payload.get("expense_account") or {}, "cost_centre": payload.get("cost_centre")}
    lines = [{**debit, "debit": amount, "narration": payload.get("narration")},
             {"account": {"id": bank["id"]}, "credit": amount - tds,
              "narration": f"{payload.get('method') or 'Bank transfer'} {payload.get('reference') or ''}".strip()}]
    if tds > 0:
        lines.append({"account": {"role": "TDS_PAYABLE"}, "credit": tds,
                      "narration": f"TDS {payload.get('tds_section') or ''}".strip()})
    return lines


def submit_voucher(cur, hospital_id, payload, maker):
    voucher_type = (payload.get("voucher_type") or "").upper()
    if voucher_type not in ("PV", "JV", "OB"):
        raise LedgerError("voucher_type must be PV (payment), JV (journal) or OB (opening balances).")
    day = as_date(payload.get("date"))
    narration = (payload.get("narration") or "").strip()
    if not narration:
        raise LedgerError("A voucher needs a narration.")
    lines = _pv_lines(cur, hospital_id, payload) if voucher_type == "PV" else payload.get("lines") or []
    if voucher_type == "OB":
        cur.execute("SELECT 1 FROM gl_journals WHERE hospital_id = ? AND voucher_type = 'OB' AND status = 'posted' LIMIT 1",
                    (hospital_id,))
        if cur.fetchone():
            raise LedgerError("Opening balances are already posted; correct them with a journal voucher.", 409)
    # Dry-run the posting now so the maker sees every problem before a checker does.
    _dry_run(cur, hospital_id, voucher_type, day, narration, lines, maker)
    amount = sum((money(line.get("debit")) for line in lines), ZERO)
    cur.execute(
        """
        INSERT INTO gl_vouchers (hospital_id, voucher_type, voucher_date, narration, payee_name, amount, lines, maker)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?) RETURNING *
        """,
        (hospital_id, voucher_type, day, narration, (payload.get("supplier") or {}).get("name") or payload.get("payee_name"),
         amount, json.dumps(lines, default=str), maker),
    )
    voucher = cur.fetchone()
    audit(cur, hospital_id, maker, "submit", "voucher", voucher["id"], {"type": voucher_type, "amount": amount})
    return voucher


def _dry_run(cur, hospital_id, voucher_type, day, narration, lines, actor):
    cur.execute("SAVEPOINT voucher_dry_run")
    try:
        post_journal(cur, hospital_id, voucher_type=voucher_type, journal_date=day, narration=narration,
                     source_module="manual", lines=lines, actor=actor, manual=voucher_type == "JV")
    finally:
        cur.execute("ROLLBACK TO SAVEPOINT voucher_dry_run")


def decide_voucher(cur, hospital_id, voucher_id, decision, checker, reason=None):
    cur.execute("SELECT * FROM gl_vouchers WHERE hospital_id = ? AND id = ? FOR UPDATE", (hospital_id, voucher_id))
    voucher = cur.fetchone()
    if not voucher:
        raise LedgerError("Voucher not found.", 404)
    if voucher["status"] != "submitted":
        raise LedgerError(f"Voucher is already {voucher['status']}.", 409)
    if decision == "cancel":
        if voucher["maker"] != checker:
            raise LedgerError("Only the person who prepared a voucher can withdraw it.", 403)
        cur.execute("UPDATE gl_vouchers SET status = 'cancelled', decided_at = NOW() WHERE id = ?", (voucher_id,))
        audit(cur, hospital_id, checker, "cancel", "voucher", voucher_id)
        return row_dict(voucher) | {"status": "cancelled"}
    if voucher["maker"] == checker:
        raise LedgerError("Maker-checker: a voucher must be approved or rejected by someone other than its preparer.", 403)
    if decision == "reject":
        if not (reason or "").strip():
            raise LedgerError("Say why the voucher is rejected.")
        cur.execute("UPDATE gl_vouchers SET status = 'rejected', checker = ?, decided_at = NOW(), reject_reason = ? WHERE id = ?",
                    (checker, reason.strip(), voucher_id))
        audit(cur, hospital_id, checker, "reject", "voucher", voucher_id, {"reason": reason})
        return row_dict(voucher) | {"status": "rejected"}
    if decision != "approve":
        raise LedgerError("decision must be approve, reject or cancel.")
    lines = voucher["lines"] if isinstance(voucher["lines"], list) else json.loads(voucher["lines"])
    journal, _ = post_journal(
        cur, hospital_id, voucher_type=voucher["voucher_type"], journal_date=voucher["voucher_date"],
        narration=voucher["narration"], source_module="manual", source_ref=f"VCH-{voucher_id}", lines=lines,
        actor=voucher["maker"], approved_by=checker, voucher_id=voucher_id,
        # Only manual journals are barred from control accounts; opening balances
        # legitimately carry each patient's / supplier's opening open items.
        manual=voucher["voucher_type"] == "JV",
    )
    cur.execute("UPDATE gl_vouchers SET status = 'approved', checker = ?, decided_at = NOW(), journal_id = ? WHERE id = ?",
                (checker, journal["id"], voucher_id))
    audit(cur, hospital_id, checker, "approve", "voucher", voucher_id, {"journal_no": journal["journal_no"]})
    return row_dict(voucher) | {"status": "approved", "journal_id": journal["id"], "journal_no": journal["journal_no"]}


# ── Periods & year end ──────────────────────────────────────────────────────


def set_period_status(cur, hospital_id, period_id, status, actor):
    cur.execute("SELECT p.*, f.status AS fy_status, f.code AS fy_code FROM gl_periods p JOIN gl_fiscal_years f ON f.id = p.fiscal_year_id WHERE p.hospital_id = ? AND p.id = ? FOR UPDATE",
                (hospital_id, period_id))
    period = cur.fetchone()
    if not period:
        raise LedgerError("Period not found.", 404)
    if period["fy_status"] == "closed":
        raise LedgerError(f"Fiscal year {period['fy_code']} is closed; its periods cannot change.", 409)
    if status == "closed":
        cur.execute("SELECT COUNT(*) AS n FROM gl_vouchers WHERE hospital_id = ? AND status = 'submitted' AND voucher_date BETWEEN ? AND ?",
                    (hospital_id, period["start_date"], period["end_date"]))
        pending = cur.fetchone()["n"]
        if pending:
            raise LedgerError(f"{pending} voucher(s) dated in {period['name']} are awaiting approval; decide them first.", 409)
        cur.execute("UPDATE gl_periods SET status = 'closed', closed_at = NOW(), closed_by = ? WHERE id = ?", (actor, period_id))
    else:
        cur.execute("UPDATE gl_periods SET status = 'open', closed_at = NULL, closed_by = NULL WHERE id = ?", (period_id,))
    audit(cur, hospital_id, actor, f"period_{status}", "period", period_id, {"name": period["name"]})


def close_fiscal_year(cur, hospital_id, fiscal_year_id, actor):
    """Post the closing entry (income and expense to retained surplus) and lock the year.
    The entry is dated the last day of the year, posted while that period is still open."""
    cur.execute("SELECT * FROM gl_fiscal_years WHERE hospital_id = ? AND id = ? FOR UPDATE", (hospital_id, fiscal_year_id))
    fiscal_year = cur.fetchone()
    if not fiscal_year:
        raise LedgerError("Fiscal year not found.", 404)
    if fiscal_year["status"] == "closed":
        raise LedgerError(f"{fiscal_year['code']} is already closed.", 409)
    cur.execute("SELECT name FROM gl_periods WHERE fiscal_year_id = ? AND status = 'open' AND period_no < 12 ORDER BY period_no",
                (fiscal_year_id,))
    still_open = [row["name"] for row in cur.fetchall()]
    if still_open:
        raise LedgerError(f"Close every period first; still open: {', '.join(still_open)}.", 409)
    cur.execute(
        """
        SELECT a.id, a.category, COALESCE(SUM(l.debit), 0) AS dr, COALESCE(SUM(l.credit), 0) AS cr
          FROM gl_journal_lines l JOIN gl_journals j ON j.id = l.journal_id JOIN gl_accounts a ON a.id = l.account_id
         WHERE l.hospital_id = ? AND a.category IN ('income', 'expense') AND j.journal_date <= ?
         GROUP BY a.id, a.category
        """,
        (hospital_id, fiscal_year["end_date"]),
    )
    lines, surplus = [], ZERO
    for row in cur.fetchall():
        net = row["dr"] - row["cr"]
        if net == 0:
            continue
        lines.append({"account": {"id": row["id"]}, ("credit" if net > 0 else "debit"): abs(net)})
        surplus -= net
    journal = None
    if lines:
        lines.append({"account": {"role": "RETAINED_EARNINGS"}, ("credit" if surplus > 0 else "debit"): abs(surplus),
                      "narration": f"Surplus for {fiscal_year['code']}"})
        journal, _ = post_journal(
            cur, hospital_id, voucher_type="YE", journal_date=fiscal_year["end_date"],
            narration=f"Year-end closing {fiscal_year['code']}", source_module="closing",
            idempotency_key=f"YE-{fiscal_year['code']}", lines=lines, actor=actor,
        )
    cur.execute("UPDATE gl_periods SET status = 'closed', closed_at = NOW(), closed_by = ? WHERE fiscal_year_id = ? AND status = 'open'",
                (actor, fiscal_year_id))
    cur.execute("UPDATE gl_fiscal_years SET status = 'closed', closed_at = NOW(), closed_by = ?, closing_journal_id = ? WHERE id = ?",
                (actor, journal["id"] if journal else None, fiscal_year_id))
    audit(cur, hospital_id, actor, "close_year", "fiscal_year", fiscal_year_id, {"surplus": surplus})
    return {"surplus": surplus, "journal_no": journal["journal_no"] if journal else None}


# ── Fixed assets ────────────────────────────────────────────────────────────


def register_asset(cur, hospital_id, payload, actor):
    """Capitalise an asset: DR the asset account, CR the bank (or supplier, if bought on credit)."""
    cost, salvage = money(payload.get("cost")), money(payload.get("salvage"))
    life = int(payload.get("useful_life_months") or 0)
    if cost <= 0 or life <= 0 or salvage >= cost:
        raise LedgerError("Cost must be positive, salvage below cost, and useful life at least one month.")
    method = (payload.get("method") or "SLM").upper()
    if method == "WDV" and not payload.get("wdv_rate"):
        raise LedgerError("WDV assets need an annual depreciation rate.")
    asset_account = resolve_account(cur, hospital_id, payload.get("asset_account") or {})
    accum = resolve_account(cur, hospital_id, {"role": "ACCUM_DEPRECIATION"})
    day = as_date(payload.get("in_service_date"))
    name = (payload.get("name") or "").strip()
    code = (payload.get("asset_code") or "").strip()
    if not name or not code:
        raise LedgerError("An asset needs a code and a name.")
    if payload.get("supplier_invoice_no"):
        credit = {"account": {"role": "AP_TRADE"}, "party": payload.get("supplier") or {},
                  "document_no": payload["supplier_invoice_no"]}
    else:
        credit = {"account": payload.get("paid_from") or {"role": "BANK_PRIMARY"}}
    journal, _ = post_journal(
        cur, hospital_id, voucher_type="JV", journal_date=day, narration=f"Capitalised {code} {name}",
        source_module="fixed_assets", source_ref=code, idempotency_key=f"FA-ACQ-{code}", actor=actor,
        lines=[{"account": {"id": asset_account["id"]}, "debit": cost, "cost_centre": payload.get("cost_centre")},
               {**credit, "credit": cost}],
    )
    cost_centre_id = None
    if payload.get("cost_centre"):
        cur.execute("SELECT id FROM gl_cost_centres WHERE hospital_id = ? AND code = ?", (hospital_id, payload["cost_centre"]))
        found = cur.fetchone()
        cost_centre_id = found["id"] if found else None
    cur.execute(
        """
        INSERT INTO fa_assets (hospital_id, asset_code, name, asset_account_id, accum_account_id, cost, salvage,
                               useful_life_months, method, wdv_rate, in_service_date, cost_centre_id, location,
                               acquisition_journal_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING *
        """,
        (hospital_id, code, name, asset_account["id"], accum["id"], cost, salvage, life, method,
         payload.get("wdv_rate"), day, cost_centre_id, payload.get("location"), journal["id"]),
    )
    return cur.fetchone()


def _months_between(start, end):
    return (end.year - start.year) * 12 + end.month - start.month


def run_depreciation(cur, hospital_id, period_id, actor):
    """One journal per period: each active asset's charge for the month. Re-running a
    period is a no-op (fa_depreciation is unique per asset and period)."""
    cur.execute("SELECT * FROM gl_periods WHERE hospital_id = ? AND id = ?", (hospital_id, period_id))
    period = cur.fetchone()
    if not period:
        raise LedgerError("Period not found.", 404)
    cur.execute(
        """
        SELECT a.*, COALESCE((SELECT SUM(d.amount) FROM fa_depreciation d WHERE d.asset_id = a.id), 0) AS accumulated,
               EXISTS (SELECT 1 FROM fa_depreciation d WHERE d.asset_id = a.id AND d.period_id = ?) AS done
          FROM fa_assets a
         WHERE a.hospital_id = ? AND a.status = 'active' AND a.in_service_date <= ?
        """,
        (period_id, hospital_id, period["end_date"]),
    )
    charges = []
    for asset in cur.fetchall():
        if asset["done"]:
            continue
        depreciable = asset["cost"] - asset["salvage"] - asset["accumulated"]
        if depreciable <= 0:
            continue
        if asset["method"] == "WDV":
            charge = money((asset["cost"] - asset["accumulated"]) * Decimal(asset["wdv_rate"]) / Decimal(1200))
        else:
            charge = money((asset["cost"] - asset["salvage"]) / Decimal(asset["useful_life_months"]))
            if _months_between(asset["in_service_date"], period["end_date"]) + 1 >= asset["useful_life_months"]:
                charge = depreciable  # final month absorbs rounding
        charge = min(charge, depreciable)
        if charge > 0:
            charges.append((asset, charge))
    if not charges:
        return {"journal_no": None, "assets": 0, "total": ZERO}
    total = sum((charge for _, charge in charges), ZERO)
    lines = [{"account": {"role": "DEPRECIATION_EXPENSE"}, "debit": charge,
              "cost_centre_id": asset["cost_centre_id"], "narration": f"{asset['asset_code']} {asset['name']}"}
             for asset, charge in charges]
    lines.append({"account": {"role": "ACCUM_DEPRECIATION"}, "credit": total})
    journal, _ = post_journal(
        cur, hospital_id, voucher_type="DEP", journal_date=period["end_date"],
        narration=f"Depreciation for {period['name']}", source_module="fixed_assets",
        idempotency_key=f"DEP-{period_id}", lines=lines, actor=actor,
    )
    for asset, charge in charges:
        cur.execute("INSERT INTO fa_depreciation (asset_id, period_id, amount, journal_id) VALUES (?, ?, ?, ?)",
                    (asset["id"], period_id, charge, journal["id"]))
    return {"journal_no": journal["journal_no"], "assets": len(charges), "total": total}


# ── Cashier tills ───────────────────────────────────────────────────────────


def open_cash_session(cur, hospital_id, payload, cashier):
    account = resolve_account(cur, hospital_id, payload.get("cash_account") or {})
    if not account["is_cash"]:
        raise LedgerError(f"{account['code']} is not a cash account.")
    cur.execute("SELECT 1 FROM gl_cash_sessions WHERE hospital_id = ? AND cash_account_id = ? AND status = 'open'",
                (hospital_id, account["id"]))
    if cur.fetchone():
        raise LedgerError(f"{account['name']} already has an open session; close it first.", 409)
    cur.execute(
        "INSERT INTO gl_cash_sessions (hospital_id, cash_account_id, cashier, opening_float) VALUES (?, ?, ?, ?) RETURNING *",
        (hospital_id, account["id"], cashier, money(payload.get("opening_float"))),
    )
    return cur.fetchone()


def close_cash_session(cur, hospital_id, session_id, counted, actor, notes=None):
    """Expected cash = float + everything the ledger says reached this till during the session."""
    cur.execute("SELECT * FROM gl_cash_sessions WHERE hospital_id = ? AND id = ? FOR UPDATE", (hospital_id, session_id))
    session = cur.fetchone()
    if not session or session["status"] != "open":
        raise LedgerError("No open session with that id.", 404)
    cur.execute(
        """
        SELECT COALESCE(SUM(l.debit - l.credit), 0) AS net
          FROM gl_journal_lines l JOIN gl_journals j ON j.id = l.journal_id
         WHERE l.hospital_id = ? AND l.account_id = ? AND j.created_at >= ?
        """,
        (hospital_id, session["cash_account_id"], session["opened_at"]),
    )
    expected = session["opening_float"] + cur.fetchone()["net"]
    counted = money(counted)
    variance = counted - expected
    cur.execute(
        """
        UPDATE gl_cash_sessions SET closed_at = NOW(), expected = ?, counted = ?, variance = ?, status = 'closed', notes = ?
         WHERE id = ? RETURNING *
        """,
        (expected, counted, variance, notes, session_id),
    )
    return cur.fetchone()


def verify_cash_session(cur, hospital_id, session_id, actor):
    """A supervisor signs off the till; any variance posts to cash over/short."""
    cur.execute("SELECT * FROM gl_cash_sessions WHERE hospital_id = ? AND id = ? FOR UPDATE", (hospital_id, session_id))
    session = cur.fetchone()
    if not session or session["status"] != "closed":
        raise LedgerError("Only a closed session can be verified.", 409)
    if session["cashier"] == actor:
        raise LedgerError("A cashier cannot verify their own till.", 403)
    journal_id = None
    if session["variance"]:
        variance = session["variance"]
        cash = {"account": {"id": session["cash_account_id"]}}
        over_short = {"account": {"role": "CASH_OVER_SHORT"}}
        lines = ([{**cash, "debit": variance}, {**over_short, "credit": variance}] if variance > 0
                 else [{**over_short, "debit": -variance}, {**cash, "credit": -variance}])
        journal, _ = post_journal(
            cur, hospital_id, voucher_type="JV", journal_date=date.today(),
            narration=f"Till variance, session {session_id} ({session['cashier']})", source_module="cash",
            idempotency_key=f"TILL-{session_id}", lines=lines, actor=actor, approved_by=actor,
        )
        journal_id = journal["id"]
    cur.execute("UPDATE gl_cash_sessions SET status = 'verified', verified_by = ?, variance_journal_id = ? WHERE id = ? RETURNING *",
                (actor, journal_id, session_id))
    return cur.fetchone()


# ── Bank reconciliation ─────────────────────────────────────────────────────


def bank_reconciliation(cur, hospital_id, account_id, as_of):
    as_of = as_date(as_of)
    cur.execute(
        """
        SELECT l.id, j.journal_no, j.journal_date, j.narration, l.debit, l.credit, l.narration AS line_narration,
               r.statement_date, r.statement_ref
          FROM gl_journal_lines l
          JOIN gl_journals j ON j.id = l.journal_id
          LEFT JOIN gl_bank_reconciliation r ON r.line_id = l.id
         WHERE l.hospital_id = ? AND l.account_id = ? AND j.journal_date <= ?
         ORDER BY j.journal_date, l.id
        """,
        (hospital_id, account_id, as_of),
    )
    rows = cur.fetchall()
    book = sum((r["debit"] - r["credit"] for r in rows), ZERO)
    cleared = sum((r["debit"] - r["credit"] for r in rows if r["statement_date"] and r["statement_date"] <= as_of), ZERO)
    pending = [row_dict(r) for r in rows if not r["statement_date"]]
    return {"as_of": as_of, "book_balance": book, "cleared_balance": cleared,
            "uncleared_receipts": sum((r["debit"] for r in pending), ZERO),
            "uncleared_payments": sum((r["credit"] for r in pending), ZERO), "pending": pending}


def mark_reconciled(cur, hospital_id, line_ids, statement_date, statement_ref, actor):
    statement_date = as_date(statement_date)
    done = 0
    for line_id in line_ids:
        cur.execute(
            """
            INSERT INTO gl_bank_reconciliation (line_id, hospital_id, statement_date, statement_ref, reconciled_by)
            SELECT l.id, l.hospital_id, ?, ?, ? FROM gl_journal_lines l JOIN gl_accounts a ON a.id = l.account_id
             WHERE l.id = ? AND l.hospital_id = ? AND a.is_bank
            ON CONFLICT (line_id) DO NOTHING
            """,
            (statement_date, statement_ref, actor, line_id, hospital_id),
        )
        done += cur.rowcount or 0
    return done


# ── Budgets ─────────────────────────────────────────────────────────────────


def budget_vs_actual(cur, hospital_id, fiscal_year_id):
    cur.execute("SELECT * FROM gl_fiscal_years WHERE hospital_id = ? AND id = ?", (hospital_id, fiscal_year_id))
    fiscal_year = cur.fetchone()
    if not fiscal_year:
        raise LedgerError("Fiscal year not found.", 404)
    cur.execute(
        """
        SELECT b.id, b.annual_amount, a.id AS account_id, a.code, a.name, a.category, cc.code AS cost_centre,
               COALESCE((
                 SELECT SUM(CASE WHEN a.category = 'expense' THEN l.debit - l.credit ELSE l.credit - l.debit END)
                   FROM gl_journal_lines l JOIN gl_journals j ON j.id = l.journal_id
                  WHERE l.account_id = a.id AND j.journal_date BETWEEN ? AND ?
                    AND (b.cost_centre_id IS NULL OR l.cost_centre_id = b.cost_centre_id)
               ), 0) AS actual
          FROM gl_budgets b JOIN gl_accounts a ON a.id = b.account_id
          LEFT JOIN gl_cost_centres cc ON cc.id = b.cost_centre_id
         WHERE b.hospital_id = ? AND b.fiscal_year_id = ?
         ORDER BY a.code, cc.code
        """,
        (fiscal_year["start_date"], min(fiscal_year["end_date"], date.today()), hospital_id, fiscal_year_id),
    )
    elapsed = max(1, min(12, _months_between(fiscal_year["start_date"], min(fiscal_year["end_date"], date.today())) + 1))
    rows = []
    for row in cur.fetchall():
        prorated = money(row["annual_amount"] * elapsed / 12)
        rows.append({**row_dict(row), "prorated_budget": prorated, "variance": row["actual"] - prorated,
                     "utilisation": float(row["actual"] / row["annual_amount"] * 100) if row["annual_amount"] else None})
    return {"fiscal_year": fiscal_year["code"], "months_elapsed": elapsed, "rows": rows}


def set_budget(cur, hospital_id, payload, actor):
    account = resolve_account(cur, hospital_id, payload.get("account") or {})
    if account["category"] not in ("income", "expense") or account["is_group"]:
        raise LedgerError("Budgets are set on income and expense accounts.")
    cost_centre_id = None
    if payload.get("cost_centre"):
        cur.execute("SELECT id FROM gl_cost_centres WHERE hospital_id = ? AND code = ?", (hospital_id, payload["cost_centre"]))
        found = cur.fetchone()
        if not found:
            raise LedgerError("Unknown cost centre.")
        cost_centre_id = found["id"]
    amount = money(payload.get("annual_amount"))
    cur.execute(
        "SELECT id FROM gl_budgets WHERE fiscal_year_id = ? AND account_id = ? AND cost_centre_id IS NOT DISTINCT FROM ?",
        (payload["fiscal_year_id"], account["id"], cost_centre_id),
    )
    existing = cur.fetchone()
    if existing:
        cur.execute("UPDATE gl_budgets SET annual_amount = ? WHERE id = ?", (amount, existing["id"]))
    else:
        cur.execute(
            "INSERT INTO gl_budgets (hospital_id, fiscal_year_id, account_id, cost_centre_id, annual_amount) VALUES (?, ?, ?, ?, ?)",
            (hospital_id, payload["fiscal_year_id"], account["id"], cost_centre_id, amount),
        )
    audit(cur, hospital_id, actor, "set_budget", "budget", account["code"], {"amount": amount})
