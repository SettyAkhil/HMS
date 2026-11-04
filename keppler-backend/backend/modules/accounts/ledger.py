"""The posting engine: the only code that writes journals.

Everything that changes the books -- an operational event, a cashier receipt, an
approved payment voucher, a depreciation run, a year-end close -- ends up in
post_journal(), inside one database transaction together with its sub-ledger
effects. Either the journal, its lines, its gapless number, and its AR/AP open
items all commit, or none of them do.

The database backs every rule here with a constraint or trigger (see schema.py);
the checks below exist to fail early with a message a finance user can act on.
"""

import json
from contextlib import contextmanager
from datetime import date, datetime, timedelta
from decimal import ROUND_HALF_UP, Decimal, InvalidOperation

from utils.database import get_connection

from .chart import CHART, COST_CENTRES, TAX_CODES, fiscal_year_bounds, month_periods

CENT = Decimal("0.01")
DEFAULT_CREDIT_DAYS = {"AR": 30, "AP": 30}


def row_dict(row):
    return None if row is None else {key: row[key] for key in row.keys()}


class LedgerError(Exception):
    """A posting the books must refuse. `status` is the HTTP status to report."""

    def __init__(self, message, status=400):
        super().__init__(message)
        self.status = status


def money(value) -> Decimal:
    try:
        amount = Decimal(str(value if value not in (None, "") else 0))
    except (InvalidOperation, ValueError):
        raise LedgerError(f"Invalid amount: {value!r}")
    return amount.quantize(CENT, rounding=ROUND_HALF_UP)


def as_date(value) -> date:
    if isinstance(value, date) and not isinstance(value, datetime):
        return value
    if isinstance(value, datetime):
        return value.date()
    if not value:
        return date.today()
    try:
        return date.fromisoformat(str(value)[:10])
    except ValueError:
        raise LedgerError(f"Invalid date: {value!r}")


@contextmanager
def transaction():
    """One unit of work. Commits on success; any exception rolls everything back."""
    with get_connection() as conn:
        cursor = conn.cursor()
        yield cursor
        conn.commit()


def audit(cur, hospital_id, actor, action, entity, entity_id=None, detail=None):
    cur.execute(
        "INSERT INTO gl_audit_log (hospital_id, actor, action, entity, entity_id, detail) VALUES (?, ?, ?, ?, ?, ?)",
        (hospital_id, actor, action, entity, None if entity_id is None else str(entity_id),
         json.dumps(detail, default=str) if detail is not None else None),
    )


# ── Bootstrap ───────────────────────────────────────────────────────────────


def bootstrap_books(cur, hospital_id):
    """Seed this hospital's chart, cost centres, tax codes and current fiscal year once."""
    cur.execute("SELECT 1 FROM gl_accounts WHERE hospital_id = ? LIMIT 1", (hospital_id,))
    if cur.fetchone():
        return
    cur.execute("SELECT pg_advisory_xact_lock(hashtext('gl_bootstrap'), ?)", (hospital_id,))
    cur.execute("SELECT 1 FROM gl_accounts WHERE hospital_id = ? LIMIT 1", (hospital_id,))
    if cur.fetchone():
        return
    ids = {}
    for code, name, category, normal, parent, flags in CHART:
        cur.execute(
            """
            INSERT INTO gl_accounts (hospital_id, code, name, category, normal_balance, parent_id,
                                     is_group, system_role, party_type, allow_manual, is_bank, is_cash)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id
            """,
            (hospital_id, code, name, category, normal, ids.get(parent), bool(flags.get("group")),
             flags.get("role"), flags.get("party"), flags.get("manual", True),
             bool(flags.get("bank")), bool(flags.get("cash"))),
        )
        ids[code] = cur.fetchone()["id"]
    for code, name in COST_CENTRES:
        cur.execute("INSERT INTO gl_cost_centres (hospital_id, code, name) VALUES (?, ?, ?)", (hospital_id, code, name))
    for code, name, rate, kind in TAX_CODES:
        cur.execute(
            "INSERT INTO gl_tax_codes (hospital_id, code, name, rate, kind) VALUES (?, ?, ?, ?, ?)",
            (hospital_id, code, name, rate, kind),
        )
    ensure_fiscal_year(cur, hospital_id, date.today())
    audit(cur, hospital_id, "system", "bootstrap", "books", hospital_id, {"accounts": len(CHART)})


# ── Calendar ────────────────────────────────────────────────────────────────


def ensure_fiscal_year(cur, hospital_id, day):
    """The fiscal year containing `day`, created (with its 12 periods) if needed."""
    code, start, end = fiscal_year_bounds(day)
    cur.execute("SELECT * FROM gl_fiscal_years WHERE hospital_id = ? AND code = ?", (hospital_id, code))
    row = cur.fetchone()
    if row:
        return row
    cur.execute("SELECT pg_advisory_xact_lock(hashtext('gl_fy'), ?)", (hospital_id,))
    cur.execute("SELECT * FROM gl_fiscal_years WHERE hospital_id = ? AND code = ?", (hospital_id, code))
    row = cur.fetchone()
    if row:
        return row
    cur.execute(
        "INSERT INTO gl_fiscal_years (hospital_id, code, start_date, end_date) VALUES (?, ?, ?, ?) RETURNING *",
        (hospital_id, code, start, end),
    )
    row = cur.fetchone()
    for number, name, first, last in month_periods(start):
        cur.execute(
            "INSERT INTO gl_periods (hospital_id, fiscal_year_id, period_no, name, start_date, end_date) VALUES (?, ?, ?, ?, ?, ?)",
            (hospital_id, row["id"], number, name, first, last),
        )
    return row


def open_period_for(cur, hospital_id, day):
    """The open period a posting dated `day` belongs to, or a LedgerError saying why not."""
    fiscal_year = ensure_fiscal_year(cur, hospital_id, day)
    if fiscal_year["status"] != "open":
        raise LedgerError(f"Fiscal year {fiscal_year['code']} is closed; postings dated {day} are not allowed.", 409)
    cur.execute(
        "SELECT * FROM gl_periods WHERE fiscal_year_id = ? AND start_date <= ? AND end_date >= ?",
        (fiscal_year["id"], day, day),
    )
    period = cur.fetchone()
    if period["status"] != "open":
        raise LedgerError(f"Period {period['name']} is closed; postings dated {day} are not allowed.", 409)
    return period, fiscal_year


def next_journal_no(cur, hospital_id, voucher_type, fiscal_year):
    """Gapless per type and year: the counter row is locked until this transaction ends,
    and a rolled-back posting rolls its number back with it."""
    cur.execute(
        "INSERT INTO gl_sequences (hospital_id, voucher_type, fiscal_year_id) VALUES (?, ?, ?) ON CONFLICT DO NOTHING",
        (hospital_id, voucher_type, fiscal_year["id"]),
    )
    cur.execute(
        """
        UPDATE gl_sequences SET next_no = next_no + 1
         WHERE hospital_id = ? AND voucher_type = ? AND fiscal_year_id = ?
        RETURNING next_no - 1 AS number
        """,
        (hospital_id, voucher_type, fiscal_year["id"]),
    )
    return f"{voucher_type}/{fiscal_year['code']}/{cur.fetchone()['number']:06d}"


# ── Masters ─────────────────────────────────────────────────────────────────


def resolve_account(cur, hospital_id, ref):
    """An account by {"id"}, {"code"} or {"role"} (or a bare code string)."""
    if isinstance(ref, str):
        ref = {"code": ref}
    if ref.get("id"):
        cur.execute("SELECT * FROM gl_accounts WHERE hospital_id = ? AND id = ?", (hospital_id, ref["id"]))
    elif ref.get("role"):
        cur.execute("SELECT * FROM gl_accounts WHERE hospital_id = ? AND system_role = ?", (hospital_id, ref["role"]))
    elif ref.get("code"):
        cur.execute("SELECT * FROM gl_accounts WHERE hospital_id = ? AND code = ?", (hospital_id, str(ref["code"])))
    else:
        raise LedgerError("Every journal line needs an account.")
    account = cur.fetchone()
    if not account:
        raise LedgerError(f"Unknown account {ref}.")
    return account


def resolve_cost_centre(cur, hospital_id, code):
    if not code:
        return None
    cur.execute("SELECT id FROM gl_cost_centres WHERE hospital_id = ? AND code = ?", (hospital_id, code))
    row = cur.fetchone()
    if not row:
        raise LedgerError(f"Unknown cost centre {code!r}.")
    return row["id"]


def _ledger_of(account):
    if account["party_type"] in ("patient", "payer"):
        return "AR"
    if account["party_type"] == "supplier":
        return "AP"
    return None


# ── Posting ─────────────────────────────────────────────────────────────────


def post_journal(cur, hospital_id, *, voucher_type, journal_date, narration, source_module, lines,
                 actor, source_ref=None, idempotency_key=None, approved_by=None, manual=False,
                 voucher_id=None, _reversal_of=None):
    """Validate and post one balanced journal. Returns (journal_row, duplicate).

    `lines`: [{"account": {"role"|"code"|"id"}, "debit"|"credit": amount,
               "cost_centre": code, "party": {"type","id","name"},
               "document_no": "INV-1", "due_date": "YYYY-MM-DD", "narration": ""}]
    A line on an AR/AP control account that names a document either opens it (when the
    line increases the balance -- an invoice) or settles it (a receipt or payment).
    """
    if idempotency_key:
        cur.execute("SELECT pg_advisory_xact_lock(hashtext(?))", (f"{hospital_id}:{idempotency_key}",))
        cur.execute(
            "SELECT * FROM gl_journals WHERE hospital_id = ? AND idempotency_key = ?",
            (hospital_id, idempotency_key),
        )
        existing = cur.fetchone()
        if existing:
            return existing, True

    day = as_date(journal_date)
    narration = (narration or "").strip()
    if not narration:
        raise LedgerError("A journal needs a narration.")

    prepared, total_debit, total_credit = [], Decimal(0), Decimal(0)
    for index, line in enumerate(lines or [], start=1):
        account = resolve_account(cur, hospital_id, line.get("account") or {})
        label = f"Line {index} ({account['code']} {account['name']})"
        if account["is_group"]:
            raise LedgerError(f"{label}: is a heading; post to one of its accounts.")
        if not account["is_active"]:
            raise LedgerError(f"{label}: account is inactive.")
        if manual and not account["allow_manual"]:
            raise LedgerError(f"{label}: is a control account; it is posted through receipts, bills and payments, not manual journals.")
        debit, credit = money(line.get("debit")), money(line.get("credit"))
        if debit < 0 or credit < 0:
            raise LedgerError(f"{label}: amounts cannot be negative.")
        if (debit > 0) == (credit > 0):
            raise LedgerError(f"{label}: needs either a debit or a credit.")
        party = line.get("party") or {}
        if account["party_type"]:
            if not party.get("id") or not party.get("name"):
                raise LedgerError(f"{label}: control account lines need a {account['party_type']}.")
            party = {**party, "type": account["party_type"]}
        prepared.append({
            "account": account, "debit": debit, "credit": credit, "party": party,
            "cost_centre_id": line.get("cost_centre_id") or resolve_cost_centre(cur, hospital_id, line.get("cost_centre")),
            "document_no": (line.get("document_no") or "").strip() or None,
            "due_date": line.get("due_date"),
            "narration": (line.get("narration") or "").strip() or None,
        })
        total_debit += debit
        total_credit += credit

    if len(prepared) < 2:
        raise LedgerError("A journal needs at least two lines.")
    if total_debit != total_credit:
        raise LedgerError(f"Journal does not balance: debits ₹{total_debit} vs credits ₹{total_credit}.")

    period, fiscal_year = open_period_for(cur, hospital_id, day)
    journal_no = next_journal_no(cur, hospital_id, voucher_type, fiscal_year)
    cur.execute(
        """
        INSERT INTO gl_journals (hospital_id, journal_no, voucher_type, journal_date, period_id, narration,
                                 source_module, source_ref, idempotency_key, total, voucher_id,
                                 created_by, approved_by, reversal_of_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING *
        """,
        (hospital_id, journal_no, voucher_type, day, period["id"], narration, source_module, source_ref,
         idempotency_key, total_debit, voucher_id, actor, approved_by,
         _reversal_of["id"] if _reversal_of else None),
    )
    journal = cur.fetchone()

    for number, line in enumerate(prepared, start=1):
        account, party = line["account"], line["party"]
        cur.execute(
            """
            INSERT INTO gl_journal_lines (journal_id, hospital_id, line_no, account_id, debit, credit,
                                          cost_centre_id, party_type, party_id, party_name, document_no, narration)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (journal["id"], hospital_id, number, account["id"], line["debit"], line["credit"],
             line["cost_centre_id"], party.get("type"), party.get("id"), party.get("name"),
             line["document_no"], line["narration"]),
        )
        if not _reversal_of:
            _apply_open_item(cur, hospital_id, journal, day, line)

    if _reversal_of:
        _undo_open_items(cur, hospital_id, _reversal_of, journal)

    audit(cur, hospital_id, actor, "post", "journal", journal["id"],
          {"journal_no": journal_no, "total": total_debit, "source": source_module, "ref": source_ref})
    return journal, False


def _apply_open_item(cur, hospital_id, journal, day, line):
    account, ledger, document = line["account"], _ledger_of(line["account"]), line["document_no"]
    if not ledger or not document:
        return  # not a sub-ledger line, or an on-account amount with no document
    amount = line["debit"] or line["credit"]
    increases = (line["debit"] > 0) if ledger == "AR" else (line["credit"] > 0)
    party = line["party"]
    if increases:
        due = as_date(line["due_date"]) if line["due_date"] else day + timedelta(days=DEFAULT_CREDIT_DAYS[ledger])
        cur.execute(
            """
            INSERT INTO gl_open_items (hospital_id, ledger, account_id, party_type, party_id, party_name,
                                       document_no, document_date, due_date, amount, journal_id)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT (hospital_id, account_id, party_id, document_no) DO NOTHING
            RETURNING id
            """,
            (hospital_id, ledger, account["id"], party["type"], party["id"], party["name"],
             document, day, due, amount, journal["id"]),
        )
        if not cur.fetchone():
            raise LedgerError(f"{document} is already on {party['name']}'s {ledger} ledger; raise a debit/credit note instead.", 409)
        return
    cur.execute(
        """
        SELECT * FROM gl_open_items
         WHERE hospital_id = ? AND account_id = ? AND party_id = ? AND document_no = ?
         FOR UPDATE
        """,
        (hospital_id, account["id"], party["id"], document),
    )
    item = cur.fetchone()
    if not item:
        raise LedgerError(f"{document} is not an open {ledger} document for {party['name']}.", 409)
    outstanding = item["amount"] - item["settled"]
    if outstanding == 0:
        raise LedgerError(f"{document} is already fully settled for {party['name']}.", 409)
    if amount > outstanding:
        raise LedgerError(f"₹{amount} exceeds the ₹{outstanding} outstanding on {document}.", 409)
    cur.execute("UPDATE gl_open_items SET settled = settled + ? WHERE id = ?", (amount, item["id"]))
    cur.execute(
        "INSERT INTO gl_allocations (open_item_id, journal_id, amount) VALUES (?, ?, ?)",
        (item["id"], journal["id"], amount),
    )


def _undo_open_items(cur, hospital_id, original, reversal):
    """Reverse the sub-ledger effects of `original`: free what it settled, void what it opened."""
    cur.execute("SELECT * FROM gl_allocations WHERE journal_id = ?", (original["id"],))
    for allocation in cur.fetchall():
        cur.execute("UPDATE gl_open_items SET settled = settled - ? WHERE id = ?",
                    (allocation["amount"], allocation["open_item_id"]))
        cur.execute("INSERT INTO gl_allocations (open_item_id, journal_id, amount) VALUES (?, ?, ?)",
                    (allocation["open_item_id"], reversal["id"], -allocation["amount"]))
    cur.execute("SELECT * FROM gl_open_items WHERE journal_id = ? FOR UPDATE", (original["id"],))
    for item in cur.fetchall():
        if item["settled"] > 0:
            raise LedgerError(
                f"{item['document_no']} has ₹{item['settled']} settled against it; reverse those receipts/payments first.", 409)
        # Fully settle the voided document against the reversal so it leaves the ledger.
        cur.execute("UPDATE gl_open_items SET settled = amount WHERE id = ?", (item["id"],))
        cur.execute("INSERT INTO gl_allocations (open_item_id, journal_id, amount) VALUES (?, ?, ?)",
                    (item["id"], reversal["id"], item["amount"]))


def reverse_journal(cur, hospital_id, journal_id, reason, actor, reversal_date=None):
    """Correct a posted journal the only way the books allow: an equal and opposite one."""
    reason = (reason or "").strip()
    if not reason:
        raise LedgerError("A reversal needs a reason.")
    cur.execute("SELECT * FROM gl_journals WHERE hospital_id = ? AND id = ? FOR UPDATE", (hospital_id, journal_id))
    original = cur.fetchone()
    if not original:
        raise LedgerError("Journal not found.", 404)
    if original["status"] != "posted":
        raise LedgerError(f"{original['journal_no']} is already reversed.", 409)
    if original["reversal_of_id"]:
        raise LedgerError(f"{original['journal_no']} is itself a reversal; post a fresh journal instead.", 409)
    cur.execute("SELECT * FROM gl_journal_lines WHERE journal_id = ? ORDER BY line_no", (original["id"],))
    lines = [{
        "account": {"id": line["account_id"]},
        "debit": line["credit"], "credit": line["debit"],
        "party": {"type": line["party_type"], "id": line["party_id"], "name": line["party_name"]} if line["party_id"] else None,
        "document_no": line["document_no"], "narration": line["narration"],
        "cost_centre_id": line["cost_centre_id"],
    } for line in cur.fetchall()]
    reversal, _ = post_journal(
        cur, hospital_id, voucher_type="RJ", journal_date=reversal_date or date.today(),
        narration=f"Reversal of {original['journal_no']}: {reason}", source_module=original["source_module"],
        source_ref=original["source_ref"], lines=lines, actor=actor, _reversal_of=original,
    )
    cur.execute("UPDATE gl_journals SET status = 'reversed', reversed_by_id = ? WHERE id = ?",
                (reversal["id"], original["id"]))
    audit(cur, hospital_id, actor, "reverse", "journal", original["id"],
          {"journal_no": original["journal_no"], "reversal": reversal["journal_no"], "reason": reason})
    return reversal
