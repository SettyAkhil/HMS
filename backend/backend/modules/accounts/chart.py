"""Default chart of accounts, cost centres and tax codes for an Indian hospital.

Seeded once per hospital (see bootstrap_books). Every account a posting rule needs
carries a `role` -- rules resolve accounts by role, never by code, so a hospital
can renumber or rename its chart without breaking any integration.

No opening balances are seeded. Real books start from the hospital's own opening
trial balance, entered as an Opening Balance (OB) voucher; inventing figures here
is how the previous localStorage ledger ended up out of balance by ₹66 lakh.
"""

from datetime import date

# (code, name, category, normal_balance, parent_code, flags)
# flags: group, role, party (control account), manual (default True), bank, cash
CHART = [
    ("1000", "Assets", "asset", "debit", None, {"group": True}),
    ("1100", "Cash in hand", "asset", "debit", "1000", {"group": True}),
    ("1110", "Main cash vault", "asset", "debit", "1100", {"role": "CASH_MAIN", "cash": True}),
    ("1120", "OPD billing counter cash", "asset", "debit", "1100", {"role": "CASH_OPD", "cash": True}),
    ("1130", "IPD billing counter cash", "asset", "debit", "1100", {"role": "CASH_IPD", "cash": True}),
    ("1140", "Emergency counter cash", "asset", "debit", "1100", {"role": "CASH_ER", "cash": True}),
    ("1150", "Pharmacy counter cash", "asset", "debit", "1100", {"role": "CASH_PHARMACY", "cash": True}),
    ("1200", "Bank accounts", "asset", "debit", "1000", {"group": True}),
    ("1210", "Primary operating bank account", "asset", "debit", "1200", {"role": "BANK_PRIMARY", "bank": True}),
    ("1220", "Collections bank account (cards, UPI)", "asset", "debit", "1200", {"role": "BANK_COLLECTION", "bank": True}),
    ("1300", "Receivables", "asset", "debit", "1000", {"group": True}),
    ("1310", "Patient receivables", "asset", "debit", "1300", {"role": "AR_PATIENT", "party": "patient", "manual": False}),
    ("1320", "Insurance & TPA receivables", "asset", "debit", "1300", {"role": "AR_INSURANCE", "party": "payer", "manual": False}),
    ("1330", "Corporate receivables", "asset", "debit", "1300", {"role": "AR_CORPORATE", "party": "payer", "manual": False}),
    ("1340", "TDS receivable", "asset", "debit", "1300", {"role": "TDS_RECEIVABLE"}),
    ("1400", "Inventories", "asset", "debit", "1000", {"group": True}),
    ("1410", "Pharmacy stock", "asset", "debit", "1400", {"role": "INVENTORY_PHARMACY"}),
    ("1420", "Lab consumables & reagents", "asset", "debit", "1400", {"role": "INVENTORY_LAB"}),
    ("1430", "Surgical & medical consumables", "asset", "debit", "1400", {"role": "INVENTORY_CONSUMABLES"}),
    ("1500", "Input tax credit", "asset", "debit", "1000", {"group": True}),
    ("1510", "Input CGST", "asset", "debit", "1500", {"role": "GST_INPUT_CGST"}),
    ("1520", "Input SGST", "asset", "debit", "1500", {"role": "GST_INPUT_SGST"}),
    ("1530", "Input IGST", "asset", "debit", "1500", {"role": "GST_INPUT_IGST"}),
    ("1600", "Advances & deposits paid", "asset", "debit", "1000", {"group": True}),
    ("1610", "Supplier advances", "asset", "debit", "1600", {"role": "SUPPLIER_ADVANCE"}),
    ("1620", "Security deposits", "asset", "debit", "1600", {}),
    ("1700", "Fixed assets", "asset", "debit", "1000", {"group": True}),
    ("1710", "Medical equipment", "asset", "debit", "1700", {"role": "FA_MEDICAL"}),
    ("1720", "Furniture & fixtures", "asset", "debit", "1700", {"role": "FA_FURNITURE"}),
    ("1730", "IT hardware", "asset", "debit", "1700", {"role": "FA_IT"}),
    ("1740", "Vehicles (ambulances)", "asset", "debit", "1700", {"role": "FA_VEHICLES"}),
    ("1750", "Buildings", "asset", "debit", "1700", {"role": "FA_BUILDINGS"}),
    # Contra-assets: asset category, credit normal balance -- they reduce assets.
    ("1790", "Accumulated depreciation", "asset", "credit", "1700", {"role": "ACCUM_DEPRECIATION"}),
    ("2000", "Liabilities", "liability", "credit", None, {"group": True}),
    ("2100", "Trade payables", "liability", "credit", "2000", {"group": True}),
    ("2110", "Suppliers payable", "liability", "credit", "2100", {"role": "AP_TRADE", "party": "supplier", "manual": False}),
    ("2120", "Doctor fees payable", "liability", "credit", "2100", {"role": "AP_DOCTOR_FEES"}),
    ("2200", "Patient advances & deposits", "liability", "credit", "2000", {"group": True}),
    ("2210", "Patient advance deposits", "liability", "credit", "2200", {"role": "PATIENT_ADVANCE"}),
    ("2300", "Duties & taxes", "liability", "credit", "2000", {"group": True}),
    ("2310", "Output CGST", "liability", "credit", "2300", {"role": "GST_OUTPUT_CGST"}),
    ("2320", "Output SGST", "liability", "credit", "2300", {"role": "GST_OUTPUT_SGST"}),
    ("2330", "Output IGST", "liability", "credit", "2300", {"role": "GST_OUTPUT_IGST"}),
    ("2340", "TDS payable", "liability", "credit", "2300", {"role": "TDS_PAYABLE"}),
    ("2400", "Payroll liabilities", "liability", "credit", "2000", {"group": True}),
    ("2410", "Salaries payable", "liability", "credit", "2400", {"role": "SALARY_PAYABLE"}),
    ("2420", "PF payable", "liability", "credit", "2400", {"role": "PF_PAYABLE"}),
    ("2430", "ESI payable", "liability", "credit", "2400", {"role": "ESI_PAYABLE"}),
    ("2440", "Professional tax payable", "liability", "credit", "2400", {"role": "PT_PAYABLE"}),
    ("2500", "Other current liabilities", "liability", "credit", "2000", {"group": True}),
    ("2510", "Accrued expenses", "liability", "credit", "2500", {"role": "ACCRUED_EXPENSES"}),
    ("2900", "Opening balance suspense", "liability", "credit", "2000", {"role": "OPENING_SUSPENSE"}),
    ("3000", "Equity", "equity", "credit", None, {"group": True}),
    ("3100", "Capital", "equity", "credit", "3000", {"role": "CAPITAL"}),
    ("3200", "Retained surplus", "equity", "credit", "3000", {"role": "RETAINED_EARNINGS"}),
    ("4000", "Revenue", "income", "credit", None, {"group": True}),
    ("4100", "Clinical services revenue", "income", "credit", "4000", {"group": True}),
    ("4110", "OPD consultation revenue", "income", "credit", "4100", {"role": "REV_OPD"}),
    ("4120", "IPD room, nursing & procedures", "income", "credit", "4100", {"role": "REV_IPD"}),
    ("4130", "Emergency services revenue", "income", "credit", "4100", {"role": "REV_ER"}),
    ("4140", "ICU & critical care revenue", "income", "credit", "4100", {"role": "REV_ICU"}),
    ("4150", "OT & surgery revenue", "income", "credit", "4100", {"role": "REV_OT"}),
    ("4200", "Diagnostics revenue", "income", "credit", "4000", {"group": True}),
    ("4210", "Laboratory revenue", "income", "credit", "4200", {"role": "REV_LAB"}),
    ("4220", "Radiology & imaging revenue", "income", "credit", "4200", {"role": "REV_RADIOLOGY"}),
    ("4300", "Pharmacy sales", "income", "credit", "4000", {"role": "REV_PHARMACY"}),
    ("4900", "Other income", "income", "credit", "4000", {"role": "REV_OTHER"}),
    ("5000", "Expenses", "expense", "debit", None, {"group": True}),
    ("5100", "Cost of materials consumed", "expense", "debit", "5000", {"group": True}),
    ("5110", "Cost of medicines sold", "expense", "debit", "5100", {"role": "COGS_PHARMACY"}),
    ("5120", "Lab reagents consumed", "expense", "debit", "5100", {"role": "COGS_LAB"}),
    ("5200", "Employee costs", "expense", "debit", "5000", {"group": True}),
    ("5210", "Salaries & wages", "expense", "debit", "5200", {"role": "SALARY_EXPENSE"}),
    ("5220", "Employer PF & ESI contribution", "expense", "debit", "5200", {"role": "EMPLOYER_CONTRIBUTION"}),
    ("5230", "Visiting consultant fees", "expense", "debit", "5200", {"role": "DOCTOR_FEES_EXPENSE"}),
    ("5300", "Facility costs", "expense", "debit", "5000", {"group": True}),
    ("5310", "Power, water & gas", "expense", "debit", "5300", {"role": "UTILITIES"}),
    ("5320", "Rent & lease", "expense", "debit", "5300", {}),
    ("5330", "Repairs & maintenance", "expense", "debit", "5300", {}),
    ("5400", "Depreciation", "expense", "debit", "5000", {"role": "DEPRECIATION_EXPENSE"}),
    ("5500", "Revenue deductions", "expense", "debit", "5000", {"group": True}),
    ("5510", "Discounts allowed", "expense", "debit", "5500", {"role": "DISCOUNT_ALLOWED"}),
    ("5520", "Insurance claim disallowances", "expense", "debit", "5500", {"role": "CLAIM_DISALLOWANCE"}),
    ("5530", "Bad debts written off", "expense", "debit", "5500", {"role": "BAD_DEBT"}),
    ("5900", "Other expenses", "expense", "debit", "5000", {"group": True}),
    ("5910", "Bank charges", "expense", "debit", "5900", {"role": "BANK_CHARGES"}),
    ("5920", "Cash over / short", "expense", "debit", "5900", {"role": "CASH_OVER_SHORT"}),
    ("5990", "General & administrative", "expense", "debit", "5900", {}),
]

COST_CENTRES = [
    ("OPD", "Outpatient department"),
    ("IPD", "Inpatient wards"),
    ("ER", "Emergency"),
    ("ICU", "Critical care"),
    ("OT", "Operation theatres"),
    ("LAB", "Laboratory"),
    ("RAD", "Radiology"),
    ("PHARM", "Pharmacy"),
    ("ADMIN", "Administration"),
]

TAX_CODES = [
    ("GST0", "GST exempt (healthcare services)", 0, "exempt"),
    ("GST5", "GST 5%", 5, "gst"),
    ("GST12", "GST 12%", 12, "gst"),
    ("GST18", "GST 18%", 18, "gst"),
    ("TDS194J", "TDS 194J professional fees", 10, "tds"),
    ("TDS194C", "TDS 194C contractors", 2, "tds"),
]

_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]


def fiscal_year_bounds(day: date):
    """Indian financial year (April–March) containing `day`: (code, start, end)."""
    start_year = day.year if day.month >= 4 else day.year - 1
    return (
        f"{start_year}-{str(start_year + 1)[-2:]}",
        date(start_year, 4, 1),
        date(start_year + 1, 3, 31),
    )


def month_periods(start: date):
    """The 12 monthly periods of the fiscal year starting at `start`."""
    periods = []
    year, month = start.year, start.month
    for number in range(1, 13):
        first = date(year, month, 1)
        next_year, next_month = (year + 1, 1) if month == 12 else (year, month + 1)
        last = date.fromordinal(date(next_year, next_month, 1).toordinal() - 1)
        periods.append((number, f"{_MONTHS[month - 1]} {year}", first, last))
        year, month = next_year, next_month
    return periods
