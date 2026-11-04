"""Financial statements, all derived from journal lines at query time.

Nothing here reads a stored balance -- there is none. Every report is a query over
gl_journal_lines, so the trial balance, P&L and balance sheet always agree with the
journals and with each other.

Sign convention (see _signed): on a statement, assets and expenses are debit-positive
and liabilities, equity and income credit-positive. Contra accounts (accumulated
depreciation: an asset with a credit balance) therefore come out negative within
their category and reduce it -- the old ledger added them to total assets.
"""

from datetime import date, timedelta
from decimal import Decimal

from .ledger import as_date

ZERO = Decimal("0.00")


def _fy_start(cur, hospital_id, day):
    cur.execute(
        "SELECT start_date FROM gl_fiscal_years WHERE hospital_id = ? AND start_date <= ? AND end_date >= ?",
        (hospital_id, day, day),
    )
    row = cur.fetchone()
    if row:
        return row["start_date"]
    return date(day.year if day.month >= 4 else day.year - 1, 4, 1)


def _account_rows(cur, hospital_id):
    cur.execute(
        """
        SELECT id, code, name, category, normal_balance, parent_id, is_group, system_role, is_bank, is_cash
          FROM gl_accounts WHERE hospital_id = ? ORDER BY code
        """,
        (hospital_id,),
    )
    return cur.fetchall()


def _movements(cur, hospital_id, date_from=None, date_to=None):
    """{account_id: (debit, credit)} for lines dated within [date_from, date_to]."""
    clauses, params = ["l.hospital_id = ?"], [hospital_id]
    if date_from:
        clauses.append("j.journal_date >= ?")
        params.append(date_from)
    if date_to:
        clauses.append("j.journal_date <= ?")
        params.append(date_to)
    cur.execute(
        f"""
        SELECT l.account_id, COALESCE(SUM(l.debit), 0) AS dr, COALESCE(SUM(l.credit), 0) AS cr
          FROM gl_journal_lines l JOIN gl_journals j ON j.id = l.journal_id
         WHERE {' AND '.join(clauses)}
         GROUP BY l.account_id
        """,
        tuple(params),
    )
    return {row["account_id"]: (row["dr"], row["cr"]) for row in cur.fetchall()}


def _natural(account, debit, credit):
    """Balance in the account's own normal direction (statement of account, ledger view)."""
    return (debit - credit) if account["normal_balance"] == "debit" else (credit - debit)


def _signed(account, debit, credit):
    """Amount as it adds into its category on a statement: assets and expenses are
    debit-positive, everything else credit-positive. A contra account (accumulated
    depreciation, a contra-revenue) comes out negative and nets off its category."""
    return (debit - credit) if account["category"] in ("asset", "expense") else (credit - debit)


def trial_balance(cur, hospital_id, date_from, date_to):
    """Opening, period movement and closing per account. Debit total = credit total, always."""
    date_from, date_to = as_date(date_from), as_date(date_to)
    opening = _movements(cur, hospital_id, None, date_from - timedelta(days=1))
    period = _movements(cur, hospital_id, date_from, date_to)
    rows, totals = [], {k: ZERO for k in ("opening_dr", "opening_cr", "period_dr", "period_cr", "closing_dr", "closing_cr")}
    for account in _account_rows(cur, hospital_id):
        if account["is_group"]:
            continue
        o_dr, o_cr = opening.get(account["id"], (ZERO, ZERO))
        p_dr, p_cr = period.get(account["id"], (ZERO, ZERO))
        if not any((o_dr, o_cr, p_dr, p_cr)):
            continue
        opening_net, closing_net = o_dr - o_cr, o_dr - o_cr + p_dr - p_cr
        row = {
            "account_id": account["id"], "code": account["code"], "name": account["name"],
            "category": account["category"],
            "opening_dr": max(opening_net, ZERO), "opening_cr": max(-opening_net, ZERO),
            "period_dr": p_dr, "period_cr": p_cr,
            "closing_dr": max(closing_net, ZERO), "closing_cr": max(-closing_net, ZERO),
        }
        for key in totals:
            totals[key] += row[key]
        rows.append(row)
    return {"from": date_from, "to": date_to, "rows": rows, "totals": totals,
            "balanced": totals["closing_dr"] == totals["closing_cr"]}


def _group_tree(accounts, amounts, categories):
    """Category -> sections (top-level groups) -> accounts with non-zero amounts."""
    by_id = {a["id"]: a for a in accounts}

    def top_group(account):
        # The ancestor just below the category heading -- or the account itself
        # when it sits directly under the heading (e.g. "Pharmacy sales").
        node = account
        while node["parent_id"] and by_id[node["parent_id"]]["parent_id"]:
            node = by_id[node["parent_id"]]
        return node

    result = {}
    for category in categories:
        sections, total = {}, ZERO
        for account in accounts:
            if account["category"] != category or account["is_group"]:
                continue
            amount = amounts.get(account["id"], ZERO)
            if amount == ZERO:
                continue
            group = top_group(account)
            section = sections.setdefault(group["id"], {"code": group["code"], "name": group["name"], "accounts": [], "total": ZERO})
            section["accounts"].append({"account_id": account["id"], "code": account["code"], "name": account["name"], "amount": amount})
            section["total"] += amount
            total += amount
        result[category] = {"sections": sorted(sections.values(), key=lambda s: s["code"]), "total": total}
    return result


def profit_and_loss(cur, hospital_id, date_from, date_to):
    date_from, date_to = as_date(date_from), as_date(date_to)
    accounts = _account_rows(cur, hospital_id)
    moves = _movements(cur, hospital_id, date_from, date_to)
    amounts = {a["id"]: _signed(a, *moves.get(a["id"], (ZERO, ZERO))) for a in accounts}
    tree = _group_tree(accounts, amounts, ("income", "expense"))
    surplus = tree["income"]["total"] - tree["expense"]["total"]
    return {"from": date_from, "to": date_to, "income": tree["income"], "expense": tree["expense"],
            "surplus": surplus}


def balance_sheet(cur, hospital_id, as_of):
    """Position at `as_of`. Unclosed income/expense is shown as surplus inside equity,
    split into this financial year and earlier years, so A = L + E holds exactly."""
    as_of = as_date(as_of)
    accounts = _account_rows(cur, hospital_id)
    moves = _movements(cur, hospital_id, None, as_of)
    amounts = {a["id"]: _signed(a, *moves.get(a["id"], (ZERO, ZERO))) for a in accounts}
    tree = _group_tree(accounts, amounts, ("asset", "liability", "equity"))
    fy_start = _fy_start(cur, hospital_id, as_of)
    current = profit_and_loss(cur, hospital_id, fy_start, as_of)["surplus"]
    lifetime = sum(
        (_signed(a, *moves.get(a["id"], (ZERO, ZERO))) * (1 if a["category"] == "income" else -1)
         for a in accounts if a["category"] in ("income", "expense") and not a["is_group"]),
        ZERO,
    )
    earlier = lifetime - current
    equity = tree["equity"]
    for label, amount in (("Surplus brought forward (unclosed years)", earlier), ("Surplus for the year to date", current)):
        if amount != ZERO:
            equity["sections"].append({"code": "", "name": label, "accounts": [], "total": amount})
            equity["total"] += amount
    total_assets = tree["asset"]["total"]
    liabilities_and_equity = tree["liability"]["total"] + equity["total"]
    return {"as_of": as_of, "assets": tree["asset"], "liabilities": tree["liability"], "equity": equity,
            "total_assets": total_assets, "total_liabilities_and_equity": liabilities_and_equity,
            "balanced": total_assets == liabilities_and_equity}


def account_ledger(cur, hospital_id, account_id, date_from, date_to):
    """One account's statement with opening balance and a running balance."""
    date_from, date_to = as_date(date_from), as_date(date_to)
    cur.execute("SELECT * FROM gl_accounts WHERE hospital_id = ? AND id = ?", (hospital_id, account_id))
    account = cur.fetchone()
    if not account:
        return None
    cur.execute(
        """
        SELECT COALESCE(SUM(l.debit), 0) AS dr, COALESCE(SUM(l.credit), 0) AS cr
          FROM gl_journal_lines l JOIN gl_journals j ON j.id = l.journal_id
         WHERE l.hospital_id = ? AND l.account_id = ? AND j.journal_date < ?
        """,
        (hospital_id, account_id, date_from),
    )
    row = cur.fetchone()
    opening = _natural(account, row["dr"], row["cr"])
    cur.execute(
        """
        SELECT j.id AS journal_id, j.journal_no, j.journal_date, j.voucher_type, j.narration AS journal_narration,
               j.source_module, j.source_ref, j.status, l.debit, l.credit, l.narration, l.party_name,
               l.document_no, cc.code AS cost_centre
          FROM gl_journal_lines l
          JOIN gl_journals j ON j.id = l.journal_id
          LEFT JOIN gl_cost_centres cc ON cc.id = l.cost_centre_id
         WHERE l.hospital_id = ? AND l.account_id = ? AND j.journal_date BETWEEN ? AND ?
         ORDER BY j.journal_date, j.id, l.line_no
        """,
        (hospital_id, account_id, date_from, date_to),
    )
    running, entries = opening, []
    for line in cur.fetchall():
        running += _natural(account, line["debit"], line["credit"])
        entries.append({**{k: line[k] for k in line.keys()}, "balance": running})
    return {"account": {k: account[k] for k in account.keys()}, "from": date_from, "to": date_to,
            "opening": opening, "closing": running, "entries": entries}


def ageing(cur, hospital_id, ledger, as_of):
    """Open AR/AP documents bucketed by days past due, per party."""
    as_of = as_date(as_of)
    cur.execute(
        """
        SELECT o.*, a.code AS account_code, a.name AS account_name
          FROM gl_open_items o JOIN gl_accounts a ON a.id = o.account_id
         WHERE o.hospital_id = ? AND o.ledger = ? AND o.settled < o.amount AND o.document_date <= ?
         ORDER BY o.due_date
        """,
        (hospital_id, ledger, as_of),
    )
    buckets = ("current", "1-30", "31-60", "61-90", "90+")
    parties, totals = {}, {b: ZERO for b in buckets}
    items = []
    for row in cur.fetchall():
        outstanding = row["amount"] - row["settled"]
        overdue = (as_of - row["due_date"]).days
        bucket = "current" if overdue <= 0 else "1-30" if overdue <= 30 else "31-60" if overdue <= 60 else "61-90" if overdue <= 90 else "90+"
        items.append({
            "id": row["id"], "document_no": row["document_no"], "document_date": row["document_date"],
            "due_date": row["due_date"], "party_type": row["party_type"], "party_id": row["party_id"],
            "party_name": row["party_name"], "account_code": row["account_code"], "account_name": row["account_name"],
            "amount": row["amount"], "settled": row["settled"], "outstanding": outstanding,
            "days_overdue": max(overdue, 0), "bucket": bucket,
        })
        party = parties.setdefault((row["party_type"], row["party_id"]), {
            "party_type": row["party_type"], "party_id": row["party_id"], "party_name": row["party_name"],
            **{b: ZERO for b in buckets}, "total": ZERO, "documents": 0})
        party[bucket] += outstanding
        party["total"] += outstanding
        party["documents"] += 1
        totals[bucket] += outstanding
    return {"ledger": ledger, "as_of": as_of, "items": items,
            "parties": sorted(parties.values(), key=lambda p: -p["total"]),
            "totals": {**totals, "total": sum(totals.values(), ZERO)}}


def gst_summary(cur, hospital_id, date_from, date_to):
    """Output GST collected, input credit available, and the net payable for the period."""
    date_from, date_to = as_date(date_from), as_date(date_to)
    moves = _movements(cur, hospital_id, date_from, date_to)
    rows = {}
    for account in _account_rows(cur, hospital_id):
        role = account["system_role"] or ""
        if role.startswith("GST_"):
            dr, cr = moves.get(account["id"], (ZERO, ZERO))
            rows[role] = {"code": account["code"], "name": account["name"], "amount": _natural(account, dr, cr)}
    output = sum((v["amount"] for k, v in rows.items() if k.startswith("GST_OUTPUT")), ZERO)
    input_credit = sum((v["amount"] for k, v in rows.items() if k.startswith("GST_INPUT")), ZERO)
    return {"from": date_from, "to": date_to, "lines": rows, "output_tax": output,
            "input_credit": input_credit, "net_payable": output - input_credit}


def overview(cur, hospital_id, today=None):
    """The dashboard: liquidity, receivables, payables, and this month / year to date."""
    today = as_date(today)
    month_start = today.replace(day=1)
    fy_start = _fy_start(cur, hospital_id, today)
    accounts = _account_rows(cur, hospital_id)
    to_date = _movements(cur, hospital_id, None, today)

    def balance_where(predicate):
        return sum((_signed(a, *to_date.get(a["id"], (ZERO, ZERO))) for a in accounts
                    if not a["is_group"] and predicate(a)), ZERO)

    month = profit_and_loss(cur, hospital_id, month_start, today)
    year = profit_and_loss(cur, hospital_id, fy_start, today)
    ar, ap = ageing(cur, hospital_id, "AR", today), ageing(cur, hospital_id, "AP", today)
    revenue_by_section = [{"name": s["name"], "amount": s["total"]} for s in year["income"]["sections"]]
    cur.execute(
        """
        SELECT to_char(j.journal_date, 'YYYY-MM') AS month, a.category,
               COALESCE(SUM(l.credit - l.debit), 0) AS net
          FROM gl_journal_lines l JOIN gl_journals j ON j.id = l.journal_id JOIN gl_accounts a ON a.id = l.account_id
         WHERE l.hospital_id = ? AND a.category IN ('income', 'expense') AND j.journal_date BETWEEN ? AND ?
         GROUP BY 1, 2 ORDER BY 1
        """,
        (hospital_id, fy_start, today),
    )
    trend = {}
    for row in cur.fetchall():
        entry = trend.setdefault(row["month"], {"month": row["month"], "income": ZERO, "expense": ZERO})
        entry["income" if row["category"] == "income" else "expense"] += row["net"] if row["category"] == "income" else -row["net"]
    cur.execute(
        "SELECT COUNT(*) AS n FROM gl_vouchers WHERE hospital_id = ? AND status = 'submitted'", (hospital_id,))
    pending = cur.fetchone()["n"]
    cur.execute(
        "SELECT COUNT(*) AS n FROM gl_posting_exceptions WHERE hospital_id = ? AND resolved_at IS NULL", (hospital_id,))
    exceptions = cur.fetchone()["n"]
    return {
        "as_of": today,
        "cash": balance_where(lambda a: a["is_cash"]),
        "bank": balance_where(lambda a: a["is_bank"]),
        "receivables": ar["totals"]["total"],
        "receivables_overdue_90": ar["totals"]["90+"],
        "payables": ap["totals"]["total"],
        "month": {"income": month["income"]["total"], "expense": month["expense"]["total"], "surplus": month["surplus"]},
        "year": {"income": year["income"]["total"], "expense": year["expense"]["total"], "surplus": year["surplus"],
                 "from": fy_start},
        "revenue_by_section": revenue_by_section,
        "trend": list(trend.values()),
        "pending_approvals": pending,
        "posting_exceptions": exceptions,
    }
