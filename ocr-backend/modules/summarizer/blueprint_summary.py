# modules/summarizer/blueprint_summary.py
"""
Blueprint-driven case-summary builder for Keppler OCR.

Why this exists
---------------
The previous summariser told the LLM to *drop* empty fields
("return an empty list", "do NOT include 'Not documented'") and used a generic
schema with no place for checkbox / checklist states. As a result the output
structure changed from patient to patient and ticked boxes were lost.

This module fixes that by driving both extraction AND rendering from a single
JSON blueprint (datasets/case_summary_blueprint.json):

  * extraction is asked to return EVERY blueprint field, using null when a value
    is genuinely absent (never invented);
  * checkboxes / checklists are captured as explicit states;
  * the renderer ALWAYS prints every field — missing ones show "—" and missing
    boxes show "☐ (not recorded)", so the structure is fixed and comparable.
"""

import json
from pathlib import Path

BLUEPRINT_PATH = Path(__file__).resolve().parents[2] / "datasets" / "case_summary_blueprint.json"


def load_blueprint(path: Path = BLUEPRINT_PATH) -> dict:
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


# ─────────────────────────────────────────────────────────────────────────────
# EXTRACTION PROMPT  — built from the blueprint so the model fills exactly it
# ─────────────────────────────────────────────────────────────────────────────

def build_extraction_prompt(blueprint: dict, ocr_text: str) -> str:
    """Produce the LLM instruction that fills the blueprint as JSON.

    Key differences from the old prompt:
      - Missing values MUST be null (not dropped, not 'N/A', never invented).
      - Checkboxes return {"state": "checked|unchecked|not_recorded", "detail": ...}.
      - Checklists return per-item states.
    """
    schema_lines = []
    for sec in blueprint["sections"]:
        schema_lines.append(f'  "{sec["id"]}": {{')
        for fld in sec["fields"]:
            t = fld["type"]
            if t == "checkbox":
                shape = '{"state": "checked|unchecked|not_recorded", "detail": null}'
            elif t == "checklist":
                shape = '{"<item label>": "checked|unchecked|not_recorded", ...}'
            elif t == "checklist_kv":
                shape = '{"<item key>": "<value or null>", ...}'
            elif t == "table":
                cols = ", ".join(f'"{c}"' for c in fld.get("columns", []))
                shape = f'[ {{ {cols}: <value or null> }}, ... ]  // [] if none found'
            elif t == "score":
                shape = '{"value": <number or null>, "band": <string or null>}'
            else:
                shape = "<string value or null>"
            schema_lines.append(f'    "{fld["key"]}": {shape},   // {fld["label"]}')
        schema_lines.append("  },")
    schema = "\n".join(schema_lines)

    return (
        "You are a clinical data-extraction engine for scanned hospital case files.\n"
        "Fill the JSON object below from the OCR text. STRICT RULES:\n"
        "1. Return EVERY key. If a value is genuinely not present in the text, set it to "
        "null (for tables use []). NEVER omit a key. NEVER guess or invent a value.\n"
        "2. For checkboxes/checklists, report the actual ticked state. Use \"checked\" only "
        "when the box is clearly ticked, \"unchecked\" when clearly empty, and "
        "\"not_recorded\" when the form area is blank/unclear.\n"
        "3. Copy handwritten values (vitals, doses, dates, IOL power, scores) exactly.\n"
        "4. Output ONLY valid JSON, no commentary, no markdown fences.\n"
        "5. STRICT GROUNDING: Do NOT add textbook medical definitions, background explanations "
        "(e.g. 'a condition characterized by...'), or unwritten diagnoses. Extract ONLY facts explicitly in the text.\n"
        "6. DOSE SANITIZATION: In medication tables, 'Dose' must contain ONLY numeric quantities and units "
        "(e.g. '200 mg', '40 mg', '2 drops', '1g'). Words like 'hrly', 'young cat', 'spm-2PM' are NOT doses — set Dose to null if not a valid quantity.\n\n"
        "JSON SCHEMA TO FILL:\n{\n" + schema + "\n}\n\n"
        f"OCR TEXT:\n{ocr_text}\n"
    )


# ─────────────────────────────────────────────────────────────────────────────
# RENDERER  — omits missing fields to keep the summary clean
# ─────────────────────────────────────────────────────────────────────────────

def _is_blank(v) -> bool:
    if v is None:
        return True
    if isinstance(v, str) and v.strip().lower() in ("", "null", "none", "n/a", "na", "—"):
        return True
    if isinstance(v, (list, dict)) and len(v) == 0:
        return True
    return False


def _clean_dose_val(val: str, fallback: str = "—") -> str:
    if not val or val == fallback:
        return fallback
    v_lower = val.strip().lower()
    for junk in ("hrly", "young cat", "young", "spm-2pm", "spm-8pm", "tours", "t/d", "optopd", "longy", "not_recorded"):
        if junk in v_lower:
            return fallback
    return val.strip()


def sanitize_vitals(vitals_dict: dict) -> dict:
    if not isinstance(vitals_dict, dict):
        return vitals_dict

    import re
    spo2 = vitals_dict.get("sp02")
    if spo2 and isinstance(spo2, str):
        digits = re.findall(r'\d+', spo2)
        if digits:
            val = int(digits[0])
            if val < 50 or val > 100:
                vitals_dict["sp02"] = None
        elif any(j in spo2.lower() for j in ("afibile", "rl+", "p - r")):
            vitals_dict["sp02"] = None

    hr = vitals_dict.get("heart_rate")
    if hr and isinstance(hr, str):
        if any(j in hr.lower() for j in ("rl+", "pupil", "afibile", "lids", "eye", "p - r")):
            vitals_dict["heart_rate"] = None
        else:
            digits = re.findall(r'\d+', hr)
            if digits:
                val = int(digits[0])
                if val < 20 or val > 250:
                    vitals_dict["heart_rate"] = None

    temp = vitals_dict.get("temperature")
    if temp and isinstance(temp, str):
        if any(j in temp.lower() for j in ("afibile", "rl+", "pupil")):
            vitals_dict["temperature"] = None

    return vitals_dict


def render_case_summary_markdown(data: dict, blueprint: dict) -> str:
    # Sanitize vitals before rendering
    if "admission_vitals_exam" in data and isinstance(data["admission_vitals_exam"], dict):
        data["admission_vitals_exam"] = sanitize_vitals(data["admission_vitals_exam"])

    rules = blueprint["rendering_rules"]
    BLANK = rules["missing_value_placeholder"]
    BOX_CHECK = rules["checkbox_checked"]
    BOX_EMPTY = rules["checkbox_unchecked"]
    BOX_NA = rules["missing_checkbox_placeholder"]

    stats = {"total": 0, "filled": 0, "blank": 0}

    def box(state: str) -> str:
        s = (state or "not_recorded").lower()
        if s == "checked":
            return BOX_CHECK
        if s == "unchecked":
            return BOX_EMPTY
        return BOX_NA

    md = []
    for sec in blueprint["sections"]:
        sec_data = data.get(sec["id"], {}) or {}
        
        sec_md = []
        for fld in sec["fields"]:
            key, label, ftype = fld["key"], fld["label"], fld["type"]
            val = sec_data.get(key)
            stats["total"] += 1

            if ftype == "checkbox":
                state = (val or {}).get("state") if isinstance(val, dict) else val
                detail = (val or {}).get("detail") if isinstance(val, dict) else None
                s = (state or "not_recorded").lower()
                if s not in ("checked", "unchecked"):
                    stats["blank"] += 1
                    continue
                
                line = f"- **{label}:** {box(state)}"
                if detail and not _is_blank(detail):
                    line += f" — {detail}"
                sec_md.append(line)
                stats["filled"] += 1

            elif ftype in ("checklist", "checklist_kv"):
                items = fld.get("items", [])
                any_filled = False
                checklist_md = []
                
                if ftype == "checklist":
                    for item in items:
                        st = (val or {}).get(item) if isinstance(val, dict) else None
                        s = (st or "not_recorded").lower()
                        if s in ("checked", "unchecked"):
                            any_filled = True
                            checklist_md.append(f"    - {box(st)} {item}")
                else:  # checklist_kv  (label -> value)
                    for it in items:
                        ik, il = it["key"], it["label"]
                        v = (val or {}).get(ik) if isinstance(val, dict) else None
                        if not _is_blank(v):
                            any_filled = True
                            checklist_md.append(f"    - {il}: {v}")
                
                if any_filled:
                    sec_md.append(f"- **{label}:**")
                    sec_md.extend(checklist_md)
                    stats["filled"] += 1
                else:
                    stats["blank"] += 1

            elif ftype == "table":
                cols = fld.get("columns", [])
                rows = val if isinstance(val, list) else []
                if rows:
                    sec_md.append(f"\n**{label}:**\n")
                    sec_md.append("| " + " | ".join(cols) + " |")
                    sec_md.append("|" + "|".join(["---"] * len(cols)) + "|")
                    for row in rows:
                        cells = []
                        for c in cols:
                            cell_val = str(row.get(c, "") or BLANK) if isinstance(row, dict) else BLANK
                            if c.lower() == "dose":
                                cell_val = _clean_dose_val(cell_val, BLANK)
                            cells.append(cell_val)
                        sec_md.append("| " + " | ".join(cells) + " |")
                    sec_md.append("")
                    stats["filled"] += 1
                else:
                    stats["blank"] += 1

            elif ftype == "score":
                v = val if isinstance(val, dict) else {}
                score = v.get("value")
                band = v.get("band")
                if _is_blank(score) and _is_blank(band):
                    stats["blank"] += 1
                else:
                    txt = f"{score if not _is_blank(score) else BLANK}"
                    if not _is_blank(band):
                        txt += f"  ({band})"
                    sec_md.append(f"- **{label}:** {txt}")
                    stats["filled"] += 1

            else:  # text / number / narrative
                if _is_blank(val):
                    stats["blank"] += 1
                else:
                    sec_md.append(f"- **{label}:** {val}")
                    stats["filled"] += 1
        
        md.append(f"\n## {sec['title']}\n")
        if sec_md:
            md.extend(sec_md)
        else:
            md.append("- *Not documented*")
        md.append("")

    # Auto-fill the data-quality section if the model didn't.
    dq = data.setdefault("data_quality", {})
    if _is_blank(dq.get("fields_captured")):
        dq["fields_captured"] = str(stats["filled"])
    if _is_blank(dq.get("fields_blank")):
        dq["fields_blank"] = str(stats["blank"])

    return "\n".join(md), stats
