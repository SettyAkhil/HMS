"""
Form template registry — GEMS ISBARCHART Nurse Handing Over / Taking Over.

CRITICAL: every label string in this file was read off the printed form and is
GROUND TRUTH. These strings must never be generated, paraphrased, expanded, or
"cleaned up" by a language model. If a future version of the form changes, a
human re-reads the paper form and edits this file by hand.

The whole point of this registry is to remove the model's opportunity to invent
check items. A model asked to produce a nurse-handover checklist will happily
emit plausible items like "Fall risk assessment done" or "SpO2 / Oxygen therapy
checked" that appear nowhere on the page. Pinning the labels here makes that
impossible: the model is only ever asked for CELL VALUES, never for labels.
"""

import re
import logging
from dataclasses import dataclass, field
from typing import List, Dict, Optional, Tuple

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class FormRow:
    label: str          # printed check item, VERBATIM — do not edit without the paper form
    value_type: str     # yn | ynna | lr | text | time | signature
    section: str = ""   # rotated band label, e.g. "SAFETY CHECK"
    group: str = ""     # merged-cell group label; "" on continuation rows


@dataclass(frozen=True)
class FormTemplate:
    template_id: str
    title: str
    footer_code: str
    match_keywords: tuple[str, ...]
    rows: tuple[FormRow, ...]

    @property
    def labels(self) -> list[str]:
        return [r.label for r in self.rows]


_SC = "SAFETY CHECK"

ISBAR_HANDOVER_F22B = FormTemplate(
    template_id="ISBAR_HANDOVER_F22B",
    title="ISBARCHART - NURSE HANDING OVER TAKING OVER",
    footer_code="GEMS/SKLM/CS/GEN/F-22B",
    match_keywords=(
        "GEMS/SKLM/CS/GEN/F-22B",
        "ISBARCHART",
        "HANDING OVER TAKING OVER",
    ),
    rows=(
        # --- SAFETY CHECK band (21 rows) ---
        FormRow("Patient ID Tag on within (Y/N)", "yn", _SC),
        FormRow("Call bell/ staff made available with in the reach of patient (Y/N)", "yn", _SC),
        FormRow("Bed side RAIL Sup (Y/N/NA)", "ynna", _SC),
        FormRow("Safety First Board Placed (Y/N/NA)", "ynna", _SC),

        FormRow("IV table Available (Y/N)", "yn", _SC, "IV Management (If Applicable)"),
        FormRow("IV Fluid on flow (Y/N)", "yn", _SC),
        FormRow("Drop Factor label present (Y/N)", "yn", _SC),

        FormRow("Label available & Colour code followed (Y/N)", "yn", _SC, "Infusion (If Applicable)"),
        FormRow("VIP Score (Please Describe)", "text", _SC),

        FormRow("Patient(Y/N)", "yn", _SC, "Drain Checked (If Applicable)"),
        FormRow("Position(Y/N)", "yn", _SC),
        FormRow("Multiple Drains Labelled (Y/N)", "yn", _SC),

        FormRow("Foley's Catheter in situ (Y/N)", "yn", _SC),
        FormRow("Diet/ Meals served (Y/N/NA)", "ynna", _SC),
        FormRow("Ryles Tube in situ (Y/N/NA)", "ynna", _SC),
        FormRow("Bowel Movement (Y/N/NA)", "ynna", _SC),

        FormRow("Tube in situ(Y/N)", "yn", _SC, "Intubation (If Applicable)"),
        FormRow("Site of the Tube (L/R)", "lr", _SC),

        FormRow("Alpha bed functioning (Y/N/NA)", "ynna", _SC),
        FormRow("Device Associated injury(Y/N)", "yn", _SC),
        FormRow("If Patient on restraints, required care provided (Y/N/NA)", "ynna", _SC),

        # --- below the SAFETY CHECK band (5 rows) ---
        FormRow("Completion Time", "time"),
        FormRow("Handing over Nurse Sign & ID No.", "signature"),
        FormRow("Taking over Nurse Sign & ID No.", "signature"),
        FormRow("Is the hand over is taken appropriately (Y/N)", "yn"),
        FormRow("In-charge/ Shift In-charge Sign", "signature"),
    ),
)

TEMPLATES: tuple[FormTemplate, ...] = (ISBAR_HANDOVER_F22B,)

# Allowed cell values per type. Empty string is ALWAYS allowed and always means
# "not recorded" — it is never an error.
ALLOWED_VALUES = {
    "yn":   {"Y", "N", "[?]", ""},
    "ynna": {"Y", "N", "NA", "[?]", ""},
    "lr":   {"L", "R", "[?]", ""},
}


def match_template(page_text: str) -> Optional[FormTemplate]:
    """
    Identify the form from OCR'd page text. Footer code first — it is printed on
    every page and is the most reliable signal. Returns None for unknown forms,
    in which case the caller MUST fall back to generic extraction rather than
    guessing a template.
    """
    if not page_text:
        return None
    haystack = " ".join(page_text.upper().split())
    for tpl in TEMPLATES:
        if tpl.footer_code.upper().replace(" ", "") in haystack.replace(" ", ""):
            return tpl
    for tpl in TEMPLATES:
        for kw in tpl.match_keywords:
            if kw.upper() in haystack:
                return tpl
    return None


def build_fill_prompt(template: FormTemplate, n_entry_cols: int) -> str:
    """
    Emits a structured prompt asking the model ONLY for cell values in JSON format.
    R7 REQUIREMENT: Does NOT include label strings or domain words (nurse handover, ISBAR)
    to prevent domain completion hallucinations.
    """
    return f"""You are a precise clinical transcription engine reading grid values from an image.
The grid has {len(template.rows)} rows and {n_entry_cols} columns.

Your objective: Extract ONLY the recorded cell values for each row index (1 to {len(template.rows)}), left to right across {n_entry_cols} columns.

Rules:
- Return exactly {n_entry_cols} values for every row index "1" to "{len(template.rows)}".
- Allowed values: Y, N, NA, L, R, time, printed name, or "".
- An unmarked or blank cell is "" — never carry values sideways or downward.
- Return ONLY valid JSON with this exact structure:

{{
  "entry_columns": {n_entry_cols},
  "cells": {{
    "1": ["val1", "val2", ...],
    "2": ["val1", "val2", ...],
    ...
    "{len(template.rows)}": ["val1", "val2", ...]
  }}
}}"""


def render_markdown(template: FormTemplate, cells: Dict, n_cols: int) -> Tuple[str, bool]:
    """
    Renders validated markdown table from template and extracted cells dict.
    Returns (markdown_text, needs_review).
    """
    needs_review = False

    header_cols = ["Section", "Group", "Check Item"] + [f"E{i+1}" for i in range(n_cols)]
    table_lines = [
        "| " + " | ".join(header_cols) + " |",
        "|" + "|".join(["---"] * len(header_cols)) + "|"
    ]

    for idx, r in enumerate(template.rows, start=1):
        row_key = str(idx)
        raw_vals = cells.get(row_key, [])
        if not isinstance(raw_vals, list):
            raw_vals = []

        if len(raw_vals) < n_cols:
            raw_vals = raw_vals + [""] * (n_cols - len(raw_vals))
            needs_review = True
        elif len(raw_vals) > n_cols:
            raw_vals = raw_vals[:n_cols]

        validated_vals = []
        for cell_raw in raw_vals:
            val_str = str(cell_raw).strip()
            v_type = r.value_type

            if v_type in ALLOWED_VALUES:
                up = val_str.upper()
                if up in {"Y", "YES", "✓"}:
                    validated_vals.append("Y")
                elif up in {"N", "NO", "✗", "X"}:
                    validated_vals.append("N")
                elif up in {"NA", "N/A"}:
                    validated_vals.append("NA")
                elif up in {"L", "LEFT"}:
                    validated_vals.append("L")
                elif up in {"R", "RIGHT"}:
                    validated_vals.append("R")
                elif up in {"[?]", "?"}:
                    validated_vals.append("[?]")
                elif not up or up == "-":
                    validated_vals.append("")
                else:
                    validated_vals.append("[?]")
                    needs_review = True
            elif v_type == "time":
                times = re.findall(r'\d{1,2}:\d{2}', val_str)
                if len(times) > 1:
                    validated_vals.append(times[0])
                    needs_review = True
                else:
                    validated_vals.append(val_str)
            elif v_type == "signature":
                has_alpha = len(re.findall(r'[a-zA-Z]', val_str)) >= 2
                has_brackets = "[" in val_str or "]" in val_str or "unclear" in val_str.lower()
                if has_alpha and not has_brackets:
                    validated_vals.append(val_str)
                else:
                    validated_vals.append("")
            else:
                validated_vals.append(val_str)

        row_cells = [r.section, r.group, r.label] + validated_vals
        table_lines.append("| " + " | ".join(row_cells) + " |")

    md_table = "\n".join(table_lines)
    full_md = f"**{template.title}**\n**Form:** {template.footer_code} · **Page No:** 2\n\n{md_table}"
    return full_md, needs_review
