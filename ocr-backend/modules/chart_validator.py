"""
Chart Validator Module — Runs safety and sanity checks on extracted Drug Chart / MAR rows.
Attach flags/warnings to rows WITHOUT mutating values.
"""

import re
import json
from pathlib import Path
from modules.frequency_resolver import VALID_FREQUENCIES, VALID_ROUTES, detect_column_propagation

# Known drugs that are typically dosed in micrograms (mcg), not milligrams (mg)
MICROGRAM_DRUGS = {
    "thyronorm", "levothyroxine", "eltroxin", "thyrox",
    "digoxin", "lanoxin",
    "fentanyl",
    "adrenaline", "epinephrine"
}

# Route to Dosage Form mismatch patterns
INCOMPATIBLE_ROUTE_FORMS = [
    (r'\b(tab|tablet|syp|syrup|cap|capsule)\b', r'\b(iv|im|sc|id)\b', "Oral form specified with Parenteral route"),
    (r'\b(inj|injection)\b', r'\b(po|oral)\b', "Injectable form specified with Oral (PO) route")
]

# Time pattern for administration times: 7am, 2pm, 10:00am, etc.
TIME_ADMIN_PATTERN = re.compile(r'\b\d{1,2}(?::\d{2})?\s*(?:am|pm)\b', re.IGNORECASE)


def validate_chart_row(row: dict, row_idx: int) -> list[dict]:
    """
    Validates a single drug chart row.
    Returns a list of warning dicts: {"row": row_idx, "field": field, "severity": "critical"|"warning", "message": msg}
    """
    flags = []
    
    drug_name = str(row.get("drug_name", row.get("Name of the Drug", ""))).strip()
    dose_val = str(row.get("dose", row.get("Dose", ""))).strip()
    route_val = str(row.get("route", row.get("Route", ""))).strip()
    freq_val = str(row.get("freq", row.get("Freq.", ""))).strip()
    nurse_val = str(row.get("nurse", row.get("Time given (T) / Initials of Nurse (I)", ""))).strip()
    stop_val = str(row.get("stop_orders", row.get("Stop Orders", ""))).strip()

    drug_lower = drug_name.lower()
    dose_lower = dose_val.lower()

    # 1. Unit sanity by drug class (mcg vs mg)
    for mcg_drug in MICROGRAM_DRUGS:
        if mcg_drug in drug_lower:
            if re.search(r'\bmg\b', dose_lower) and not re.search(r'\bmcg\b', dose_lower):
                flags.append({
                    "row": row_idx,
                    "field": "dose",
                    "severity": "critical",
                    "message": f"Dosing hazard: {drug_name} is dosed in mcg, but transcribed as mg (1000x error hazard)."
                })

    # 2. Dose magnitude checks (e.g. Zofer > 8mg, Heparin > 25000 IU, etc.)
    if "zofer" in drug_lower or "ondansetron" in drug_lower:
        m = re.search(r'(\d+)\s*mg', dose_lower)
        if m and int(m.group(1)) > 16:
            flags.append({
                "row": row_idx,
                "field": "dose",
                "severity": "critical",
                "message": f"Dose magnitude anomaly: {drug_name} dose of {m.group(1)} mg is 10x outside standard adult single dose (4-8mg)."
            })

    # 3. Route / Dosage Form agreement
    if drug_name and route_val:
        for form_pat, route_pat, msg in INCOMPATIBLE_ROUTE_FORMS:
            if re.search(form_pat, drug_lower) and re.search(route_pat, route_val.lower()):
                flags.append({
                    "row": row_idx,
                    "field": "route",
                    "severity": "warning",
                    "message": f"Route/Form mismatch: {msg} for {drug_name} ({route_val})."
                })

    # 4. Frequency legality check
    if freq_val:
        clean_freq = freq_val.strip().upper().replace(".", "").replace(" ", "")
        if clean_freq not in VALID_FREQUENCIES and clean_freq != "":
            flags.append({
                "row": row_idx,
                "field": "freq",
                "severity": "warning",
                "message": f"Illegal frequency code '{freq_val}' is outside closed set ({', '.join(sorted(VALID_FREQUENCIES))})."
            })

    # 5. Stop Orders column leakage check
    if stop_val and TIME_ADMIN_PATTERN.search(stop_val) and not nurse_val:
        flags.append({
            "row": row_idx,
            "field": "stop_orders",
            "severity": "critical",
            "message": f"Column bleed detected: Stop Orders contains administration time '{stop_val}' while Nurse column is empty."
        })

    return flags


def validate_chart_rows(rows: list[dict]) -> list[dict]:
    """
    Validates all rows of a Drug Chart table and runs page-level heuristic checks.
    """
    all_flags = []
    
    for idx, r in enumerate(rows):
        all_flags.extend(validate_chart_row(r, idx))

    # Page-level column propagation check
    if detect_column_propagation(rows, field="freq", threshold=0.8):
        all_flags.append({
            "row": -1,
            "field": "freq",
            "severity": "warning",
            "message": "Probable column propagation: >=80% of rows carry an identical Frequency value."
        })

    return all_flags
