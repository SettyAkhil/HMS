import re
from typing import List

ISBAR_EXPECTED_LABELS = [
    "Patient ID Tag on within (Y/N)",
    "Call bell/ staff made available with in the reach of patient (Y/N)",
    "Bed side RAIL Sup (Y/N/NA)",
    "Safety First Board Placed (Y/N/NA)",
    "IV table Available (Y/N)",
    "IV Fluid on flow (Y/N)",
    "Drop Factor label present (Y/N)",
    "Label available & Colour code followed (Y/N)",
    "VIP Score (Please Describe)",
    "Patient(Y/N)",
    "Position(Y/N)",
    "Multiple Drains Labelled (Y/N)",
    "Foley's Catheter in situ (Y/N)",
    "Diet/ Meals served (Y/N/NA)",
    "Ryles Tube in situ (Y/N/NA)",
    "Bowel Movement (Y/N/NA)",
    "Tube in situ(Y/N)",
    "Site of the Tube (L/R)",
    "Alpha bed functioning (Y/N/NA)",
    "Device Associated injury(Y/N)",
    "If Patient on restraints, required care provided (Y/N/NA)",
    "Completion Time",
    "Handing over Nurse Sign & ID No.",
    "Taking over Nurse Sign & ID No.",
    "Is the hand over is taken appropriately (Y/N)",
    "In-charge/ Shift In-charge Sign"
]

def audit_grid_row_coverage(text: str, expected_labels: List[str]) -> List[str]:
    """
    Audits output text for grid row coverage against expected printed labels.
    Returns list of missing labels.
    """
    if not text or not expected_labels:
        return []

    first_col_values = []
    for line in text.splitlines():
        line_s = line.strip()
        if line_s.startswith("|") and not bool(re.fullmatch(r'[\s|:\-]+', line_s)):
            cells = [c.strip() for c in line_s.strip("|").split("|")]
            if len(cells) >= 3:
                # check Item column is index 2 in Section|Group|Check Item table, or index 0 in 1-column table
                val = cells[2] if "check item" in text.lower() and len(cells) > 2 else cells[0]
                first_col_values.append(val.lower())
            elif cells:
                first_col_values.append(cells[0].lower())

    missing = []
    for expected in expected_labels:
        exp_lower = expected.lower()
        probe = exp_lower[:12]
        if not any(probe in cell for cell in first_col_values):
            missing.append(expected)

    return missing
