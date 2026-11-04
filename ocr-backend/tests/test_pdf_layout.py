import pytest
from modules.precision_ocr import (
    compute_column_widths,
    parse_markdown_table,
    inject_column_widths,
    table_type_scale,
    generate_pro_pdf,
    MIN_COL_PCT,
    MAX_COL_PCT,
)


def test_compute_column_widths_uneven_lengths():
    """Verify compute_column_widths prevents narrow column collapse and clamps wide columns."""
    sample_table = [
        ["TEST NAME", "RESULT", "UNITS", "REF INTERVAL", "PLI", "PD", "INC"],
        ["FASTING BLOOD SUGAR (FBS) EXTENDED DESCRIPTION FOR LAB TEST", "128", "mg/dl", "70 - 110", "1", "0", "0"],
        ["POST PRANDIAL BLOOD SUGAR (PPBS)", "244", "mg/dl", "70 - 140", "0", "1", "0"],
        ["RANDOM BLOOD SUGAR (RBS)", "281", "mg/dl", "70 - 140", "0", "0", "1"],
    ]

    widths = compute_column_widths(sample_table)
    assert len(widths) == 7
    assert sum(widths) == pytest.approx(100.0, abs=0.01)

    # 1. No column below MIN_COL_PCT (5%)
    for w in widths:
        assert w >= MIN_COL_PCT, f"Column width {w}% is below minimum threshold {MIN_COL_PCT}%"

    # 2. Longest column (FBS) does not exceed MAX_COL_PCT (35%)
    assert widths[0] <= MAX_COL_PCT, f"Longest column width {widths[0]}% exceeds max threshold {MAX_COL_PCT}%"

    # 3. Longest column width is greater than narrow columns
    assert widths[0] > widths[4]  # Test Name > PLI


def test_table_type_scale():
    """Verify font size and orientation scaling by column count."""
    scale_5 = table_type_scale(5)
    assert scale_5["orientation"] == "portrait"
    assert scale_5["font"] == "10px"

    scale_7 = table_type_scale(7)
    assert scale_7["orientation"] == "landscape"
    assert scale_7["font"] == "10px"

    scale_10 = table_type_scale(10)
    assert scale_10["orientation"] == "landscape"
    assert scale_10["font"] == "8.5px"

    scale_13 = table_type_scale(13)
    assert scale_13["orientation"] == "landscape"
    assert scale_13["font"] == "7.5px"


def test_inject_column_widths():
    """Verify inject_column_widths adds inline width styles to th tags."""
    md_text = """| TEST | RESULT | UNITS |
|---|---|---|
| FBS | 128 | mg/dl |"""
    
    html = "<table><thead><tr><th>TEST</th><th>RESULT</th><th>UNITS</th></tr></thead></table>"
    injected = inject_column_widths(html, md_text, "Lab Report")
    
    assert '<th style="width:' in injected
    assert injected.count('style="width:') == 3


def test_generate_pro_pdf_output():
    """Verify generate_pro_pdf returns valid PDF bytes for a multi-column table."""
    md_text = """# Lab Investigation Report

| TEST NAME | RESULT | UNITS | REF INTERVAL | PLI | PD | INC |
|---|---|---|---|---|---|---|
| FASTING BLOOD SUGAR (FBS) | 128 | mg/dl | 70 - 110 | 1 | 0 | 0 |
| POST PRANDIAL BLOOD SUGAR (PPBS) | 244 | mg/dl | 70 - 140 | 0 | 1 | 0 |
"""
    pdf_bytes = generate_pro_pdf(md_text, "Lab Report")
    assert isinstance(pdf_bytes, bytes)
    assert pdf_bytes.startswith(b"%PDF-")
