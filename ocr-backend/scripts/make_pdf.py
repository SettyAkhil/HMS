#!/usr/bin/env python3
"""Generate a structured Case Study Summary PDF from blueprint + extracted data.
Demonstrates: fixed structure, blank fields for missing data, checkbox/checklist rendering."""
import json, sys
import os
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.lib import colors
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.platypus import (SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle,
                                HRFlowable, KeepTogether)
from reportlab.lib.enums import TA_CENTER

NAVY = colors.HexColor("#1a5276")
LIGHT = colors.HexColor("#eaf2ff")
GREY = colors.HexColor("#7f8c8d")
BLANKC = colors.HexColor("#c0392b")

bp = json.load(open("datasets/case_summary_blueprint.json"))
data = json.load(open("sample_patient_data.json")) # NOTE: you need sample_patient_data.json for this to run
rules = bp["rendering_rules"]
BLANK = rules["missing_value_placeholder"]

ss = getSampleStyleSheet()
H1 = ParagraphStyle("H1", parent=ss["Heading1"], fontSize=15, textColor=NAVY, spaceAfter=2, alignment=TA_CENTER)
SUB = ParagraphStyle("SUB", parent=ss["Normal"], fontSize=9, textColor=GREY, alignment=TA_CENTER, spaceAfter=2)
SEC = ParagraphStyle("SEC", parent=ss["Heading2"], fontSize=11.5, textColor=colors.white,
                     backColor=NAVY, leftIndent=4, spaceBefore=10, spaceAfter=4, leading=18,
                     borderPadding=(3, 4, 3, 4))
LBL = ParagraphStyle("LBL", parent=ss["Normal"], fontSize=8.5, textColor=NAVY, fontName="Helvetica-Bold")
VAL = ParagraphStyle("VAL", parent=ss["Normal"], fontSize=8.5, textColor=colors.HexColor("#222222"))
VALB = ParagraphStyle("VALB", parent=ss["Normal"], fontSize=8.5, textColor=BLANKC)  # blank
CELL = ParagraphStyle("CELL", parent=ss["Normal"], fontSize=7.6, leading=9.5)
CELLH = ParagraphStyle("CELLH", parent=ss["Normal"], fontSize=7.8, textColor=colors.white, fontName="Helvetica-Bold")
NOTE = ParagraphStyle("NOTE", parent=ss["Normal"], fontSize=7, textColor=GREY, alignment=TA_CENTER)

def is_blank(v):
    if v is None: return True
    if isinstance(v, str) and v.strip().lower() in ("", "null", "none", "n/a", "na", "—"): return True
    if isinstance(v, (list, dict)) and len(v) == 0: return True
    return False

def boxsym(state):
    s = (state or "not_recorded").lower()
    return "[x]" if s == "checked" else ("[ ]" if s == "unchecked" else "[ ]*")

def val_para(v):
    if is_blank(v):
        return Paragraph(BLANK, VALB)
    return Paragraph(str(v), VAL)

story = []
story.append(Paragraph("GREAT EASTERN MEDICAL SCHOOL &amp; HOSPITAL", H1))
story.append(Paragraph("Inpatient Case Study Summary &nbsp;·&nbsp; Auto-generated (OCR + LLM) — verify against source records", SUB))
story.append(HRFlowable(width="100%", thickness=2, color=NAVY, spaceAfter=6))

pid = data.get("patient_identification", {})
meta = Table([[
    Paragraph(f"<b>Patient:</b> {pid.get('patient_name') or BLANK}", VAL),
    Paragraph(f"<b>Age/Sex:</b> {pid.get('age') or BLANK} / {pid.get('sex') or BLANK}", VAL),
    Paragraph(f"<b>IP No.:</b> {pid.get('ip_no') or BLANK}", VAL),
    Paragraph(f"<b>UMR:</b> {pid.get('umr_no') or BLANK}", VAL),
]], colWidths=[60*mm, 38*mm, 42*mm, 42*mm])
meta.setStyle(TableStyle([("BACKGROUND", (0,0), (-1,-1), LIGHT), ("BOX",(0,0),(-1,-1),0.5,NAVY),
                          ("INNERGRID",(0,0),(-1,-1),0.4,colors.white), ("VALIGN",(0,0),(-1,-1),"MIDDLE"),
                          ("TOPPADDING",(0,0),(-1,-1),4),("BOTTOMPADDING",(0,0),(-1,-1),4)]))
story.append(meta)
story.append(Paragraph("<font color='#c0392b'>[ ]* = box present on form but not recorded / unclear.</font> "
                       "Red &#8212; = field blank (not found in source).", NOTE))

def kv_rows(pairs):
    rows = []
    for i in range(0, len(pairs), 2):
        left = pairs[i]
        right = pairs[i+1] if i+1 < len(pairs) else (Paragraph("", LBL), Paragraph("", VAL))
        rows.append([left[0], left[1], right[0], right[1]])
    t = Table(rows, colWidths=[40*mm, 52*mm, 40*mm, 50*mm])
    t.setStyle(TableStyle([("VALIGN",(0,0),(-1,-1),"TOP"),
                           ("TOPPADDING",(0,0),(-1,-1),2),("BOTTOMPADDING",(0,0),(-1,-1),2),
                           ("LINEBELOW",(0,0),(-1,-1),0.3,colors.HexColor("#dddddd"))]))
    return t

def data_table(columns, rows):
    head = [Paragraph(c, CELLH) for c in columns]
    body = [head]
    if rows:
        for r in rows:
            body.append([Paragraph(str((r.get(c) if isinstance(r, dict) else "") or BLANK), CELL) for c in columns])
    else:
        body.append([Paragraph(BLANK, CELL) for _ in columns])
    n = len(columns)
    total = 182*mm
    cw = [total/n]*n
    t = Table(body, colWidths=cw, repeatRows=1)
    t.setStyle(TableStyle([("BACKGROUND",(0,0),(-1,0),NAVY),
                           ("GRID",(0,0),(-1,-1),0.4,colors.HexColor("#999999")),
                           ("ROWBACKGROUNDS",(0,1),(-1,-1),[colors.white, colors.HexColor("#f4f8ff")]),
                           ("VALIGN",(0,0),(-1,-1),"TOP"),("TOPPADDING",(0,0),(-1,-1),3),("BOTTOMPADDING",(0,0),(-1,-1),3),
                           ("LEFTPADDING",(0,0),(-1,-1),4)]))
    return t

for sec in bp["sections"]:
    sd = data.get(sec["id"], {}) or {}
    block = [Paragraph(sec["title"], SEC)]
    pairs = []   # simple key/value pairs buffer

    def flush_pairs():
        if pairs:
            block.append(kv_rows(list(pairs)))
            pairs.clear()

    for fld in sec["fields"]:
        key, label, ftype = fld["key"], fld["label"], fld["type"]
        val = sd.get(key)

        if ftype == "checkbox":
            st = (val or {}).get("state") if isinstance(val, dict) else val
            detail = (val or {}).get("detail") if isinstance(val, dict) else None
            txt = boxsym(st) + (f" {detail}" if detail and not is_blank(detail) else "")
            pairs.append((Paragraph(label, LBL), Paragraph(txt, VAL)))

        elif ftype == "checklist":
            flush_pairs()
            items = fld.get("items", [])
            cells = []
            for it in items:
                stt = (val or {}).get(it) if isinstance(val, dict) else None
                cells.append(Paragraph(f"{boxsym(stt)} {it}", CELL))
            block.append(Paragraph(label, LBL))
            # 2-column checklist
            rows = [[cells[i], cells[i+1] if i+1 < len(cells) else Paragraph("", CELL)] for i in range(0, len(cells), 2)]
            t = Table(rows, colWidths=[91*mm, 91*mm])
            t.setStyle(TableStyle([("VALIGN",(0,0),(-1,-1),"TOP"),("TOPPADDING",(0,0),(-1,-1),1),("BOTTOMPADDING",(0,0),(-1,-1),1)]))
            block.append(t)

        elif ftype == "checklist_kv":
            flush_pairs()
            block.append(Paragraph(label, LBL))
            items = fld.get("items", [])
            kvp = []
            for it in items:
                v = (val or {}).get(it["key"]) if isinstance(val, dict) else None
                kvp.append((Paragraph(it["label"], VAL), val_para(v)))
            block.append(kv_rows(kvp))

        elif ftype == "table":
            flush_pairs()
            block.append(Paragraph(label, LBL))
            rows = val if isinstance(val, list) else []
            block.append(data_table(fld.get("columns", []), rows))
            block.append(Spacer(1, 2))

        elif ftype == "score":
            v = val if isinstance(val, dict) else {}
            sc, band = v.get("value"), v.get("band")
            if is_blank(sc) and is_blank(band):
                pairs.append((Paragraph(label, LBL), Paragraph(BLANK, VALB)))
            else:
                txt = f"{sc if not is_blank(sc) else BLANK}" + (f"  ({band})" if not is_blank(band) else "")
                pairs.append((Paragraph(label, LBL), Paragraph(txt, VAL)))
        else:
            pairs.append((Paragraph(label, LBL), val_para(val)))

    flush_pairs()
    for fl in block:
        story.append(fl)
    story.append(Spacer(1, 3))

story.append(Spacer(1, 6))
story.append(HRFlowable(width="100%", thickness=0.5, color=GREY))
story.append(Paragraph("Auto-generated by Keppler OCR (OCR + LLM). Confidential — for Medical Records only. "
                       "All clinical values must be verified against the original case file.", NOTE))

# Modified output path to point inside the project directory
os.makedirs("outputs", exist_ok=True)
out = "outputs/CASE_SUMMARY_KONDU_GOURAMMA.pdf"
SimpleDocTemplate(out, pagesize=A4, topMargin=14*mm, bottomMargin=12*mm,
                  leftMargin=14*mm, rightMargin=14*mm,
                  title="Case Study Summary").build(story)
print("WROTE", out)
