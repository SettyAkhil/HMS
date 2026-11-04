"""Accounts & finance HTTP API (billing-service, behind /api/accounts on the gateway).

Thin by design: each handler opens one transaction, calls the ledger / workflow /
report layer, and serialises the result. No accounting logic lives here.

Replaces the earlier single-entry `accounts_ledger` / vendor-payment / doctor-payout
CRUD routes, which let financial records be edited and deleted in place and had no
frontend callers. Their tables are left in the database untouched.

Permissions (core/auth.py, module "accounts"):
  accounts.read            every GET
  accounts.ledger.write    receipts, operational postings, preparing vouchers, tills
  accounts.approve         approving / rejecting vouchers, reversing journals
  accounts.periods.manage  closing / reopening periods and years, depreciation runs
  accounts.setup.write     chart of accounts, assets, budgets
"""

import json
from datetime import date, datetime
from decimal import Decimal

from flask import Blueprint, g, jsonify, request

from shared.hospital import current_hospital_id
from shared.session_auth import require_permissions

from . import reports, workflows
from .ledger import (
    LedgerError, audit, bootstrap_books, post_journal, resolve_account, reverse_journal, row_dict, transaction,
)
from .posting_rules import journal_for

accounts_bp = Blueprint("accounts", __name__)


# ── Plumbing ────────────────────────────────────────────────────────────────


def _plain(value):
    """JSON-safe: money as numbers (2 dp), dates as ISO strings."""
    if isinstance(value, Decimal):
        return float(value)
    if isinstance(value, (date, datetime)):
        return value.isoformat()
    if isinstance(value, dict):
        return {k: _plain(v) for k, v in value.items()}
    # Before the list check: psycopg2's DictRow subclasses list but is a mapping.
    if hasattr(value, "keys") and not isinstance(value, str):
        return {k: _plain(value[k]) for k in value.keys()}
    if isinstance(value, (list, tuple)):
        return [_plain(v) for v in value]
    return value


def ok(payload, status=200):
    return jsonify(_plain(payload)), status


@accounts_bp.errorhandler(LedgerError)
def _ledger_error(exc):
    return jsonify({"error": str(exc)}), exc.status


def _actor():
    return (getattr(g, "current_user", None) or {}).get("username") or "unknown"


def _books():
    """This hospital's id, seeding its books on first use."""
    hospital_id = current_hospital_id()
    with transaction() as cur:
        bootstrap_books(cur, hospital_id)
    return hospital_id


def _body():
    return request.get_json(silent=True) or {}


def _range():
    today = date.today()
    default_from = date(today.year if today.month >= 4 else today.year - 1, 4, 1)
    return request.args.get("from") or default_from, request.args.get("to") or today


# ── Overview & masters ──────────────────────────────────────────────────────


@accounts_bp.get("/api/accounts/overview")
@require_permissions("accounts.read")
def overview():
    hospital_id = _books()
    with transaction() as cur:
        return ok(reports.overview(cur, hospital_id))


@accounts_bp.get("/api/accounts/accounts")
@require_permissions("accounts.read")
def list_accounts():
    hospital_id = _books()
    with transaction() as cur:
        cur.execute(
            """
            SELECT a.*, p.code AS parent_code,
                   COALESCE(SUM(l.debit), 0) AS total_debit, COALESCE(SUM(l.credit), 0) AS total_credit,
                   COUNT(l.id) AS line_count
              FROM gl_accounts a
              LEFT JOIN gl_accounts p ON p.id = a.parent_id
              LEFT JOIN gl_journal_lines l ON l.account_id = a.id
             WHERE a.hospital_id = ?
             GROUP BY a.id, p.code ORDER BY a.code
            """,
            (hospital_id,),
        )
        accounts = []
        for row in cur.fetchall():
            item = row_dict(row)
            item["balance"] = (row["total_debit"] - row["total_credit"]) if row["normal_balance"] == "debit" \
                else (row["total_credit"] - row["total_debit"])
            accounts.append(item)
        cur.execute("SELECT * FROM gl_cost_centres WHERE hospital_id = ? ORDER BY code", (hospital_id,))
        cost_centres = cur.fetchall()
        cur.execute("SELECT * FROM gl_tax_codes WHERE hospital_id = ? ORDER BY code", (hospital_id,))
        tax_codes = cur.fetchall()
        return ok({"accounts": accounts, "cost_centres": cost_centres, "tax_codes": tax_codes})


@accounts_bp.post("/api/accounts/accounts")
@require_permissions("accounts.setup.write")
def create_account():
    hospital_id, body = _books(), _body()
    with transaction() as cur:
        parent = resolve_account(cur, hospital_id, {"code": body.get("parent_code")}) if body.get("parent_code") else None
        if parent and not parent["is_group"]:
            raise LedgerError(f"{parent['code']} is a posting account; choose a heading as the parent.")
        category = body.get("category") or (parent["category"] if parent else None)
        if category not in ("asset", "liability", "equity", "income", "expense"):
            raise LedgerError("category must be asset, liability, equity, income or expense.")
        if parent and parent["category"] != category:
            raise LedgerError(f"A {category} account cannot sit under the {parent['category']} heading {parent['code']}.")
        code, name = str(body.get("code") or "").strip(), str(body.get("name") or "").strip()
        if not code or not name:
            raise LedgerError("An account needs a code and a name.")
        normal = body.get("normal_balance") or ("debit" if category in ("asset", "expense") else "credit")
        if normal not in ("debit", "credit"):
            raise LedgerError("normal_balance must be debit or credit.")
        cur.execute("SELECT 1 FROM gl_accounts WHERE hospital_id = ? AND code = ?", (hospital_id, code))
        if cur.fetchone():
            raise LedgerError(f"Account code {code} already exists.", 409)
        cur.execute(
            """
            INSERT INTO gl_accounts (hospital_id, code, name, category, normal_balance, parent_id, is_group,
                                     is_bank, is_cash, description)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING *
            """,
            (hospital_id, code, name, category, normal, parent["id"] if parent else None, bool(body.get("is_group")),
             bool(body.get("is_bank")), bool(body.get("is_cash")), body.get("description")),
        )
        account = cur.fetchone()
        audit(cur, hospital_id, _actor(), "create", "account", account["id"], {"code": code, "name": name})
        return ok(account, 201)


@accounts_bp.patch("/api/accounts/accounts/<int:account_id>")
@require_permissions("accounts.setup.write")
def update_account(account_id):
    """Rename, describe or (de)activate. Category, normal balance and role are fixed
    once an account exists -- changing them would silently restate history."""
    hospital_id, body = _books(), _body()
    with transaction() as cur:
        account = resolve_account(cur, hospital_id, {"id": account_id})
        name = str(body.get("name", account["name"])).strip() or account["name"]
        active = bool(body.get("is_active", account["is_active"]))
        if not active and account["system_role"]:
            raise LedgerError(f"{account['code']} is used by posting rules ({account['system_role']}) and cannot be deactivated.", 409)
        cur.execute("UPDATE gl_accounts SET name = ?, description = ?, is_active = ? WHERE id = ? RETURNING *",
                    (name, body.get("description", account["description"]), active, account_id))
        updated = cur.fetchone()
        audit(cur, hospital_id, _actor(), "update", "account", account_id, {"name": name, "is_active": active})
        return ok(updated)


# ── Journals ────────────────────────────────────────────────────────────────


@accounts_bp.get("/api/accounts/journals")
@require_permissions("accounts.read")
def list_journals():
    hospital_id = _books()
    date_from, date_to = _range()
    clauses, params = ["j.hospital_id = ?", "j.journal_date BETWEEN ? AND ?"], [hospital_id, date_from, date_to]
    for key, column in (("voucher_type", "j.voucher_type"), ("source", "j.source_module"), ("status", "j.status")):
        if request.args.get(key):
            clauses.append(f"{column} = ?")
            params.append(request.args[key])
    if request.args.get("q"):
        # The DB helper turns every "?" into a placeholder, so the wildcards travel in the parameter.
        clauses.append("(j.journal_no ILIKE ? OR j.narration ILIKE ? OR j.source_ref ILIKE ?)")
        params += ["%" + request.args["q"] + "%"] * 3
    limit = max(1, min(int(request.args.get("limit", 200)), 1000))
    with transaction() as cur:
        cur.execute(
            f"""
            SELECT j.*, r.journal_no AS reversed_by_no, o.journal_no AS reversal_of_no
              FROM gl_journals j
              LEFT JOIN gl_journals r ON r.id = j.reversed_by_id
              LEFT JOIN gl_journals o ON o.id = j.reversal_of_id
             WHERE {' AND '.join(clauses)}
             ORDER BY j.journal_date DESC, j.id DESC LIMIT {limit}
            """,
            tuple(params),
        )
        return ok({"journals": cur.fetchall()})


@accounts_bp.get("/api/accounts/journals/<int:journal_id>")
@require_permissions("accounts.read")
def get_journal(journal_id):
    hospital_id = _books()
    with transaction() as cur:
        cur.execute("SELECT * FROM gl_journals WHERE hospital_id = ? AND id = ?", (hospital_id, journal_id))
        journal = cur.fetchone()
        if not journal:
            raise LedgerError("Journal not found.", 404)
        cur.execute(
            """
            SELECT l.*, a.code AS account_code, a.name AS account_name, cc.code AS cost_centre
              FROM gl_journal_lines l JOIN gl_accounts a ON a.id = l.account_id
              LEFT JOIN gl_cost_centres cc ON cc.id = l.cost_centre_id
             WHERE l.journal_id = ? ORDER BY l.line_no
            """,
            (journal_id,),
        )
        return ok({**row_dict(journal), "lines": cur.fetchall()})


@accounts_bp.post("/api/accounts/journals/<int:journal_id>/reverse")
@require_permissions("accounts.approve")
def reverse(journal_id):
    hospital_id, body = _books(), _body()
    with transaction() as cur:
        return ok(reverse_journal(cur, hospital_id, journal_id, body.get("reason"), _actor(), body.get("date")), 201)


# ── Operational postings & receipts ─────────────────────────────────────────


def _record_exception(hospital_id, event, reason):
    with transaction() as cur:
        cur.execute(
            """
            INSERT INTO gl_posting_exceptions (hospital_id, event_id, event_type, source_module, payload, reason)
            VALUES (?, ?, ?, ?, ?, ?)
            ON CONFLICT (hospital_id, event_id) DO UPDATE
               SET reason = EXCLUDED.reason, payload = EXCLUDED.payload, last_seen = NOW(),
                   attempts = gl_posting_exceptions.attempts + 1, resolved_at = NULL
            """,
            (hospital_id, str(event.get("event_id") or "unidentified"), str(event.get("type") or "unknown"),
             str(event.get("source") or "unknown"), json.dumps(event, default=str), reason),
        )


def _prepare_receipt(cur, hospital_id, event):
    """How much of a receipt can settle its bill; the rest is held as a patient advance."""
    if (event.get("type") or "").upper() != "PATIENT_RECEIPT" or not event.get("bill_no"):
        return event
    patient = event.get("patient") or {}
    cur.execute(
        """
        SELECT o.amount - o.settled AS outstanding
          FROM gl_open_items o JOIN gl_accounts a ON a.id = o.account_id
         WHERE o.hospital_id = ? AND a.system_role = 'AR_PATIENT' AND o.party_id = ? AND o.document_no = ?
        """,
        (hospital_id, str(patient.get("id") or ""), event["bill_no"]),
    )
    row = cur.fetchone()
    return {**event, "apply_to_bill": row["outstanding"] if row else 0}


def post_event(hospital_id, event, actor):
    """Post one operational event in its own transaction, so one bad event never
    blocks the rest of a batch. Rejections are kept for the finance team."""
    event_id = str(event.get("event_id") or "")
    try:
        with transaction() as cur:
            event = _prepare_receipt(cur, hospital_id, event)
            source_module, journal = journal_for(event)
            row, duplicate = post_journal(cur, hospital_id, source_module=source_module, actor=actor,
                                          idempotency_key=event_id, **journal)
            cur.execute(
                "UPDATE gl_posting_exceptions SET resolved_at = NOW() WHERE hospital_id = ? AND event_id = ? AND resolved_at IS NULL",
                (hospital_id, event_id))
            return {"event_id": event_id, "status": "duplicate" if duplicate else "posted",
                    "journal_id": row["id"], "journal_no": row["journal_no"]}
    except LedgerError as exc:
        _record_exception(hospital_id, event, str(exc))
        return {"event_id": event_id, "status": "rejected", "reason": str(exc)}


# Documents first, then the receipts and settlements that clear them.
_EVENT_ORDER = {"PATIENT_BILL": 0, "PHARMACY_SALE": 0, "PHARMACY_GRN": 0, "PAYROLL_RUN": 0}


@accounts_bp.post("/api/accounts/postings")
@require_permissions("accounts.ledger.write")
def post_events():
    """A batch of operational events (bills, receipts, settlements, GRNs, payroll).
    Idempotent per event_id."""
    hospital_id, body = _books(), _body()
    events = body.get("events") or []
    if not isinstance(events, list) or len(events) > 500:
        raise LedgerError("Send `events` as a list of at most 500.")
    events = sorted(events, key=lambda e: (_EVENT_ORDER.get(str(e.get("type")).upper(), 1), str(e.get("date") or "")))
    results = [post_event(hospital_id, event, _actor()) for event in events]
    summary = {status: sum(1 for r in results if r["status"] == status) for status in ("posted", "duplicate", "rejected")}
    return ok({"summary": summary, "results": results})


@accounts_bp.post("/api/accounts/receipts")
@require_permissions("accounts.ledger.write")
def cashier_receipt():
    """A receipt taken at the finance desk. Posts at once -- cash in hand is not
    something to queue for approval."""
    hospital_id, body = _books(), _body()
    receipt_no = str(body.get("receipt_no") or "").strip() or f"FD-{datetime.now():%Y%m%d%H%M%S%f}"
    event = {**body, "type": "PATIENT_RECEIPT", "receipt_no": receipt_no, "event_id": f"RCPT-{receipt_no}",
             "source": "accounts"}
    result = post_event(hospital_id, event, _actor())
    if result["status"] == "rejected":
        raise LedgerError(result["reason"])
    return ok(result, 201)


@accounts_bp.get("/api/accounts/posting-exceptions")
@require_permissions("accounts.read")
def posting_exceptions():
    hospital_id = _books()
    with transaction() as cur:
        cur.execute(
            "SELECT * FROM gl_posting_exceptions WHERE hospital_id = ? AND resolved_at IS NULL ORDER BY last_seen DESC LIMIT 500",
            (hospital_id,))
        return ok({"exceptions": cur.fetchall()})


@accounts_bp.post("/api/accounts/posting-exceptions/<int:exception_id>/retry")
@require_permissions("accounts.ledger.write")
def retry_exception(exception_id):
    hospital_id = _books()
    with transaction() as cur:
        cur.execute("SELECT payload FROM gl_posting_exceptions WHERE hospital_id = ? AND id = ?", (hospital_id, exception_id))
        row = cur.fetchone()
    if not row:
        raise LedgerError("Exception not found.", 404)
    payload = row["payload"] if isinstance(row["payload"], dict) else json.loads(row["payload"])
    return ok(post_event(hospital_id, payload, _actor()))


# ── Sub-ledgers ─────────────────────────────────────────────────────────────


@accounts_bp.get("/api/accounts/ageing/<ledger>")
@require_permissions("accounts.read")
def ageing(ledger):
    if ledger.upper() not in ("AR", "AP"):
        raise LedgerError("ledger must be AR or AP.", 404)
    hospital_id = _books()
    with transaction() as cur:
        return ok(reports.ageing(cur, hospital_id, ledger.upper(), request.args.get("as_of") or date.today()))


# ── Vouchers (maker-checker) ────────────────────────────────────────────────


@accounts_bp.get("/api/accounts/vouchers")
@require_permissions("accounts.read")
def list_vouchers():
    hospital_id = _books()
    status = request.args.get("status")
    with transaction() as cur:
        cur.execute(
            f"""
            SELECT v.*, j.journal_no FROM gl_vouchers v LEFT JOIN gl_journals j ON j.id = v.journal_id
             WHERE v.hospital_id = ? {'AND v.status = ?' if status else ''}
             ORDER BY v.created_at DESC LIMIT 500
            """,
            (hospital_id, status) if status else (hospital_id,),
        )
        return ok({"vouchers": cur.fetchall(), "me": _actor()})


@accounts_bp.post("/api/accounts/vouchers")
@require_permissions("accounts.ledger.write")
def submit_voucher():
    hospital_id = _books()
    with transaction() as cur:
        return ok(workflows.submit_voucher(cur, hospital_id, _body(), _actor()), 201)


@accounts_bp.post("/api/accounts/vouchers/<int:voucher_id>/cancel")
@require_permissions("accounts.ledger.write")
def cancel_voucher(voucher_id):
    hospital_id = _books()
    with transaction() as cur:
        return ok(workflows.decide_voucher(cur, hospital_id, voucher_id, "cancel", _actor()))


@accounts_bp.post("/api/accounts/vouchers/<int:voucher_id>/<decision>")
@require_permissions("accounts.approve")
def decide_voucher(voucher_id, decision):
    if decision not in ("approve", "reject"):
        raise LedgerError("Unknown action.", 404)
    hospital_id = _books()
    with transaction() as cur:
        return ok(workflows.decide_voucher(cur, hospital_id, voucher_id, decision, _actor(), _body().get("reason")))


# ── Reports ─────────────────────────────────────────────────────────────────


@accounts_bp.get("/api/accounts/reports/<name>")
@require_permissions("accounts.read")
def report(name):
    hospital_id = _books()
    date_from, date_to = _range()
    with transaction() as cur:
        if name == "trial-balance":
            return ok(reports.trial_balance(cur, hospital_id, date_from, date_to))
        if name == "profit-loss":
            return ok(reports.profit_and_loss(cur, hospital_id, date_from, date_to))
        if name == "balance-sheet":
            return ok(reports.balance_sheet(cur, hospital_id, request.args.get("as_of") or date_to))
        if name == "gst":
            return ok(reports.gst_summary(cur, hospital_id, date_from, date_to))
        if name == "ledger":
            result = reports.account_ledger(cur, hospital_id, int(request.args.get("account_id") or 0), date_from, date_to)
            if not result:
                raise LedgerError("Account not found.", 404)
            return ok(result)
    raise LedgerError(f"Unknown report {name!r}.", 404)


# ── Periods ─────────────────────────────────────────────────────────────────


@accounts_bp.get("/api/accounts/periods")
@require_permissions("accounts.read")
def list_periods():
    hospital_id = _books()
    with transaction() as cur:
        cur.execute("SELECT * FROM gl_fiscal_years WHERE hospital_id = ? ORDER BY start_date DESC", (hospital_id,))
        years = [row_dict(y) for y in cur.fetchall()]
        for year in years:
            cur.execute(
                """
                SELECT p.*, (SELECT COUNT(*) FROM gl_journals j WHERE j.period_id = p.id) AS journal_count
                  FROM gl_periods p WHERE p.fiscal_year_id = ? ORDER BY p.period_no
                """,
                (year["id"],),
            )
            year["periods"] = cur.fetchall()
        return ok({"fiscal_years": years})


@accounts_bp.post("/api/accounts/periods/<int:period_id>/<action>")
@require_permissions("accounts.periods.manage")
def period_action(period_id, action):
    hospital_id = _books()
    with transaction() as cur:
        if action in ("close", "reopen"):
            status = "closed" if action == "close" else "open"
            workflows.set_period_status(cur, hospital_id, period_id, status, _actor())
            return ok({"status": status})
        if action == "depreciation":
            return ok(workflows.run_depreciation(cur, hospital_id, period_id, _actor()))
    raise LedgerError("Unknown action.", 404)


@accounts_bp.post("/api/accounts/fiscal-years/<int:fiscal_year_id>/close")
@require_permissions("accounts.periods.manage")
def close_year(fiscal_year_id):
    hospital_id = _books()
    with transaction() as cur:
        return ok(workflows.close_fiscal_year(cur, hospital_id, fiscal_year_id, _actor()))


# ── Fixed assets & budgets ──────────────────────────────────────────────────


@accounts_bp.get("/api/accounts/assets")
@require_permissions("accounts.read")
def list_assets():
    hospital_id = _books()
    with transaction() as cur:
        cur.execute(
            """
            SELECT a.*, acc.code AS asset_account_code, acc.name AS asset_account_name, cc.code AS cost_centre,
                   COALESCE((SELECT SUM(d.amount) FROM fa_depreciation d WHERE d.asset_id = a.id), 0) AS accumulated
              FROM fa_assets a JOIN gl_accounts acc ON acc.id = a.asset_account_id
              LEFT JOIN gl_cost_centres cc ON cc.id = a.cost_centre_id
             WHERE a.hospital_id = ? ORDER BY a.asset_code
            """,
            (hospital_id,),
        )
        assets = []
        for row in cur.fetchall():
            item = row_dict(row)
            item["net_book_value"] = row["cost"] - row["accumulated"]
            assets.append(item)
        return ok({"assets": assets})


@accounts_bp.post("/api/accounts/assets")
@require_permissions("accounts.setup.write")
def create_asset():
    hospital_id = _books()
    with transaction() as cur:
        return ok(workflows.register_asset(cur, hospital_id, _body(), _actor()), 201)


@accounts_bp.get("/api/accounts/budgets/<int:fiscal_year_id>")
@require_permissions("accounts.read")
def budgets(fiscal_year_id):
    hospital_id = _books()
    with transaction() as cur:
        return ok(workflows.budget_vs_actual(cur, hospital_id, fiscal_year_id))


@accounts_bp.put("/api/accounts/budgets")
@require_permissions("accounts.setup.write")
def set_budget():
    hospital_id = _books()
    with transaction() as cur:
        workflows.set_budget(cur, hospital_id, _body(), _actor())
        return ok({"saved": True})


# ── Cash & bank ─────────────────────────────────────────────────────────────


@accounts_bp.get("/api/accounts/cash-sessions")
@require_permissions("accounts.read")
def list_cash_sessions():
    hospital_id = _books()
    with transaction() as cur:
        cur.execute(
            """
            SELECT s.*, a.code AS account_code, a.name AS account_name
              FROM gl_cash_sessions s JOIN gl_accounts a ON a.id = s.cash_account_id
             WHERE s.hospital_id = ? ORDER BY s.opened_at DESC LIMIT 200
            """,
            (hospital_id,),
        )
        return ok({"sessions": cur.fetchall(), "me": _actor()})


@accounts_bp.post("/api/accounts/cash-sessions")
@require_permissions("accounts.ledger.write")
def open_cash_session():
    hospital_id = _books()
    with transaction() as cur:
        return ok(workflows.open_cash_session(cur, hospital_id, _body(), _actor()), 201)


@accounts_bp.post("/api/accounts/cash-sessions/<int:session_id>/<action>")
@require_permissions("accounts.ledger.write")
def cash_session_action(session_id, action):
    hospital_id, body = _books(), _body()
    with transaction() as cur:
        if action == "close":
            return ok(workflows.close_cash_session(cur, hospital_id, session_id, body.get("counted"), _actor(), body.get("notes")))
        if action == "verify":
            return ok(workflows.verify_cash_session(cur, hospital_id, session_id, _actor()))
    raise LedgerError("Unknown action.", 404)


@accounts_bp.get("/api/accounts/bank-reconciliation/<int:account_id>")
@require_permissions("accounts.read")
def bank_reconciliation(account_id):
    hospital_id = _books()
    with transaction() as cur:
        return ok(workflows.bank_reconciliation(cur, hospital_id, account_id, request.args.get("as_of") or date.today()))


@accounts_bp.post("/api/accounts/bank-reconciliation/<int:account_id>")
@require_permissions("accounts.ledger.write")
def reconcile(account_id):
    hospital_id, body = _books(), _body()
    with transaction() as cur:
        done = workflows.mark_reconciled(cur, hospital_id, body.get("line_ids") or [], body.get("statement_date"),
                                         body.get("statement_ref"), _actor())
        return ok({"reconciled": done})


# ── Audit ───────────────────────────────────────────────────────────────────


@accounts_bp.get("/api/accounts/audit")
@require_permissions("accounts.read")
def audit_log():
    hospital_id = _books()
    with transaction() as cur:
        cur.execute("SELECT * FROM gl_audit_log WHERE hospital_id = ? ORDER BY at DESC LIMIT 300", (hospital_id,))
        return ok({"entries": cur.fetchall()})
