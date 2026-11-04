"""Operational events -> balanced journals.

This is the one place that knows how a hospital transaction is accounted for.
Departments never write journals: billing, pharmacy, insurance and payroll emit
*events* describing what happened in their own terms ("bill INV-9 raised for
₹4,200, ₹3,000 insurer share"), and the rules below turn each into debits and
credits by account ROLE. Each event carries an `event_id`, used as the journal's
idempotency key, so an event delivered twice posts once.

Amounts are reconciled, never invented: an event whose parts do not add up to its
total is rejected with the reason (and kept in gl_posting_exceptions for the
finance team), rather than posted with a plug figure.
"""

from datetime import timedelta

from .ledger import LedgerError, as_date, money

# HMS department -> (revenue role, cost centre)
DEPARTMENTS = {
    "outpatient": ("REV_OPD", "OPD"), "opd": ("REV_OPD", "OPD"),
    "inpatient": ("REV_IPD", "IPD"), "ipd": ("REV_IPD", "IPD"),
    "emergency": ("REV_ER", "ER"), "er": ("REV_ER", "ER"),
    "icu": ("REV_ICU", "ICU"),
    "surgery": ("REV_OT", "OT"), "ot": ("REV_OT", "OT"),
    "laboratory": ("REV_LAB", "LAB"), "lab": ("REV_LAB", "LAB"),
    "radiology": ("REV_RADIOLOGY", "RAD"),
    "pharmacy": ("REV_PHARMACY", "PHARM"),
}

# Cash collected at a department's own counter goes to that counter's till.
COUNTER_CASH = {"OPD": "CASH_OPD", "IPD": "CASH_IPD", "ICU": "CASH_IPD", "OT": "CASH_IPD",
                "ER": "CASH_ER", "PHARM": "CASH_PHARMACY", "LAB": "CASH_OPD", "RAD": "CASH_OPD"}

CASH_METHODS = {"cash", "insurance copay"}


def _department(name):
    key = (name or "").strip().lower()
    if key not in DEPARTMENTS:
        raise LedgerError(f"Unknown department {name!r}; map it in posting_rules.DEPARTMENTS.")
    return DEPARTMENTS[key]


def _collection_account(method, cost_centre):
    if (method or "cash").strip().lower() in CASH_METHODS:
        return {"role": COUNTER_CASH.get(cost_centre, "CASH_MAIN")}
    return {"role": "BANK_COLLECTION"}


def _party(raw, kind):
    raw = raw or {}
    party_id = str(raw.get("id") or "").strip()
    name = str(raw.get("name") or "").strip()
    if not party_id or not name:
        raise LedgerError(f"The {kind} needs an id and a name.")
    return {"id": party_id, "name": name}


def _payer_role(payer_type):
    return "AR_CORPORATE" if (payer_type or "").lower() == "corporate" else "AR_INSURANCE"


def _require(event, *keys):
    missing = [key for key in keys if event.get(key) in (None, "")]
    if missing:
        raise LedgerError(f"Missing {', '.join(missing)}.")


# ── Rules ───────────────────────────────────────────────────────────────────
# Each returns the post_journal() keyword arguments for one event.


def patient_bill(event):
    """A finalised hospital bill (OP / IP / ER / ICU / OT / lab / radiology).

    DR patient AR (patient share) + DR insurer/corporate AR (payer share) + DR discounts
    CR department revenue (gross) + CR output GST
    """
    _require(event, "bill_no", "department", "gross")
    revenue_role, cost_centre = _department(event["department"])
    patient = _party(event.get("patient"), "patient")
    gross, discount, tax = money(event["gross"]), money(event.get("discount")), money(event.get("tax"))
    net = gross - discount + tax
    patient_share = money(event.get("patient_share", net))
    payer_share = money(event.get("payer_share"))
    if gross <= 0:
        raise LedgerError("Bill gross amount must be positive.")
    if patient_share + payer_share != net:
        raise LedgerError(
            f"Bill shares do not reconcile: patient ₹{patient_share} + payer ₹{payer_share} "
            f"≠ net ₹{net} (gross ₹{gross} − discount ₹{discount} + tax ₹{tax}).")
    day, bill_no = as_date(event.get("date")), event["bill_no"]
    due = event.get("due_date")
    lines = []
    if patient_share > 0:
        lines.append({"account": {"role": "AR_PATIENT"}, "debit": patient_share, "party": patient,
                      "document_no": bill_no, "due_date": due or str(day), "cost_centre": cost_centre})
    if payer_share > 0:
        payer = _party(event.get("payer"), "payer")
        lines.append({"account": {"role": _payer_role(event.get("payer", {}).get("type"))}, "debit": payer_share,
                      "party": payer, "document_no": bill_no, "cost_centre": cost_centre,
                      "due_date": due or str(day + timedelta(days=45)),
                      "narration": f"{payer['name']} share for {patient['name']}"})
    if discount > 0:
        lines.append({"account": {"role": "DISCOUNT_ALLOWED"}, "debit": discount, "cost_centre": cost_centre})
    lines.append({"account": {"role": revenue_role}, "credit": gross, "cost_centre": cost_centre})
    if tax > 0:
        lines.extend(_output_gst(tax, event.get("igst")))
    return dict(voucher_type="SI", journal_date=day, source_ref=bill_no, lines=lines,
                narration=f"Bill {bill_no} — {patient['name']} ({event['department']})")


def patient_receipt(event):
    """Money collected from a patient. Settles the bill it names; any excess, or a
    receipt with no bill (a deposit), is held as a patient advance -- a liability."""
    _require(event, "receipt_no", "amount")
    amount = money(event["amount"])
    if amount <= 0:
        raise LedgerError("Receipt amount must be positive.")
    patient = _party(event.get("patient"), "patient")
    cost_centre = _department(event["department"])[1] if event.get("department") else None
    applied = min(amount, money(event.get("apply_to_bill", amount))) if event.get("bill_no") else money(0)
    lines = [{"account": _collection_account(event.get("method"), cost_centre), "debit": amount,
              "cost_centre": cost_centre, "narration": f"{event.get('method') or 'Cash'} {event.get('reference') or ''}".strip()}]
    if applied > 0:
        lines.append({"account": {"role": "AR_PATIENT"}, "credit": applied, "party": patient,
                      "document_no": event["bill_no"], "cost_centre": cost_centre})
    if amount - applied > 0:
        lines.append({"account": {"role": "PATIENT_ADVANCE"}, "credit": amount - applied,
                      "cost_centre": cost_centre, "narration": f"Advance from {patient['name']}"})
    return dict(voucher_type="RV", journal_date=as_date(event.get("date")), source_ref=event["receipt_no"],
                lines=lines, narration=f"Receipt {event['receipt_no']} — {patient['name']}")


def insurance_settlement(event):
    """An insurer / TPA paying a claim.

    DR bank (amount received) + DR TDS receivable (tax the insurer withheld)
    + DR claim disallowance (deduction the hospital absorbs)
    CR insurer AR for the full claimed share; a deduction passed to the patient
    moves to the patient's AR instead of being written off.
    """
    _require(event, "bill_no", "settled")
    payer = _party(event.get("payer"), "payer")
    settled, tds, deduction = money(event["settled"]), money(event.get("tds")), money(event.get("deduction"))
    if settled < 0 or tds < 0 or deduction < 0 or settled + tds + deduction <= 0:
        raise LedgerError("Settlement amounts must be non-negative and not all zero.")
    bill_no, cost_centre = event["bill_no"], None
    lines = []
    if settled > 0:
        lines.append({"account": {"role": "BANK_PRIMARY"}, "debit": settled,
                      "narration": f"UTR {event.get('reference') or '—'}"})
    if tds > 0:
        lines.append({"account": {"role": "TDS_RECEIVABLE"}, "debit": tds, "narration": "TDS withheld by insurer"})
    if deduction > 0:
        if (event.get("deduction_to") or "writeoff") == "patient":
            patient = _party(event.get("patient"), "patient")
            lines.append({"account": {"role": "AR_PATIENT"}, "debit": deduction, "party": patient,
                          "document_no": f"{bill_no}-SHORTFALL", "narration": "Insurer deduction billed to patient"})
        else:
            lines.append({"account": {"role": "CLAIM_DISALLOWANCE"}, "debit": deduction,
                          "narration": event.get("deduction_reason") or "Claim disallowance"})
    lines.append({"account": {"role": _payer_role(event.get("payer", {}).get("type"))},
                  "credit": settled + tds + deduction, "party": payer, "document_no": bill_no,
                  "cost_centre": cost_centre})
    return dict(voucher_type="RV", journal_date=as_date(event.get("date")),
                source_ref=event.get("claim_ref") or bill_no, lines=lines,
                narration=f"Claim settlement {event.get('claim_ref') or bill_no} — {payer['name']}")


def pharmacy_sale(event):
    """A pharmacy bill. Cash sales debit the pharmacy till; credit sales (insurance,
    IP ward, corporate) open a receivable. Cost of goods posts when `cost` is known."""
    _require(event, "bill_no", "taxable")
    patient = _party(event.get("patient"), "patient")
    taxable, cgst, sgst = money(event["taxable"]), money(event.get("cgst")), money(event.get("sgst"))
    igst = money(event.get("igst"))
    total = taxable + cgst + sgst + igst
    if event.get("total") not in (None, "") and money(event["total"]) != total:
        raise LedgerError(f"Pharmacy bill does not reconcile: taxable + GST = ₹{total}, bill total ₹{money(event['total'])}.")
    day, bill_no = as_date(event.get("date")), event["bill_no"]
    if event.get("on_credit"):
        debit = {"account": {"role": "AR_PATIENT"}, "party": patient, "document_no": bill_no}
    else:
        debit = {"account": _collection_account(event.get("method"), "PHARM")}
    lines = [{**debit, "debit": total, "cost_centre": "PHARM"},
             {"account": {"role": "REV_PHARMACY"}, "credit": taxable, "cost_centre": "PHARM"}]
    for role, amount in (("GST_OUTPUT_CGST", cgst), ("GST_OUTPUT_SGST", sgst), ("GST_OUTPUT_IGST", igst)):
        if amount > 0:
            lines.append({"account": {"role": role}, "credit": amount})
    cost = money(event.get("cost"))
    if cost > 0:
        lines.append({"account": {"role": "COGS_PHARMACY"}, "debit": cost, "cost_centre": "PHARM"})
        lines.append({"account": {"role": "INVENTORY_PHARMACY"}, "credit": cost})
    return dict(voucher_type="SI", journal_date=day, source_ref=bill_no, lines=lines,
                narration=f"Pharmacy bill {bill_no} — {patient['name']}")


def pharmacy_grn(event):
    """Goods received against a supplier invoice: stock + input GST, owed to the supplier."""
    _require(event, "grn_no", "supplier_invoice_no", "taxable")
    supplier = _party(event.get("supplier"), "supplier")
    taxable = money(event["taxable"])
    taxes = {role: money(event.get(key)) for role, key in
             (("GST_INPUT_CGST", "cgst"), ("GST_INPUT_SGST", "sgst"), ("GST_INPUT_IGST", "igst"))}
    total = taxable + sum(taxes.values())
    if taxable <= 0:
        raise LedgerError("GRN value must be positive.")
    lines = [{"account": {"role": event.get("inventory_role") or "INVENTORY_PHARMACY"}, "debit": taxable, "cost_centre": "PHARM"}]
    lines += [{"account": {"role": role}, "debit": amount} for role, amount in taxes.items() if amount > 0]
    lines.append({"account": {"role": "AP_TRADE"}, "credit": total, "party": supplier,
                  "document_no": event["supplier_invoice_no"], "due_date": event.get("due_date")})
    return dict(voucher_type="PI", journal_date=as_date(event.get("date")), source_ref=event["grn_no"],
                lines=lines, narration=f"GRN {event['grn_no']} — {supplier['name']} inv {event['supplier_invoice_no']}")


def payroll_run(event):
    """A month's approved payroll: gross cost against net pay and statutory dues."""
    _require(event, "run_id", "gross", "net")
    gross, net = money(event["gross"]), money(event["net"])
    deductions = {role: money(event.get(key)) for role, key in
                  (("PF_PAYABLE", "pf"), ("ESI_PAYABLE", "esi"), ("PT_PAYABLE", "professional_tax"), ("TDS_PAYABLE", "tds"))}
    other = money(event.get("other_deductions"))
    if net + sum(deductions.values()) + other != gross:
        raise LedgerError(f"Payroll does not reconcile: net ₹{net} + deductions ₹{sum(deductions.values()) + other} ≠ gross ₹{gross}.")
    employer = money(event.get("employer_contribution"))
    lines = [{"account": {"role": "SALARY_EXPENSE"}, "debit": gross, "cost_centre": "ADMIN"},
             {"account": {"role": "SALARY_PAYABLE"}, "credit": net + other}]
    lines += [{"account": {"role": role}, "credit": amount} for role, amount in deductions.items() if amount > 0]
    if employer > 0:
        lines += [{"account": {"role": "EMPLOYER_CONTRIBUTION"}, "debit": employer, "cost_centre": "ADMIN"},
                  {"account": {"role": "PF_PAYABLE"}, "credit": employer}]
    return dict(voucher_type="JV", journal_date=as_date(event.get("date")), source_ref=event["run_id"],
                lines=lines, narration=f"Payroll {event.get('month') or event['run_id']}")


def _output_gst(tax, interstate):
    if interstate:
        return [{"account": {"role": "GST_OUTPUT_IGST"}, "credit": tax}]
    half = money(tax / 2)
    return [{"account": {"role": "GST_OUTPUT_CGST"}, "credit": half},
            {"account": {"role": "GST_OUTPUT_SGST"}, "credit": tax - half}]


RULES = {
    "PATIENT_BILL": ("billing", patient_bill),
    "PATIENT_RECEIPT": ("billing", patient_receipt),
    "INSURANCE_SETTLEMENT": ("insurance", insurance_settlement),
    "PHARMACY_SALE": ("pharmacy", pharmacy_sale),
    "PHARMACY_GRN": ("pharmacy", pharmacy_grn),
    "PAYROLL_RUN": ("hrms", payroll_run),
}


def journal_for(event):
    """(source_module, post_journal kwargs) for one event, or LedgerError."""
    event_type = (event.get("type") or "").upper()
    if event_type not in RULES:
        raise LedgerError(f"Unknown event type {event.get('type')!r}. Known: {', '.join(RULES)}.")
    if not event.get("event_id"):
        raise LedgerError("Every event needs an event_id (its idempotency key).")
    source_module, rule = RULES[event_type]
    return source_module, rule(event)
