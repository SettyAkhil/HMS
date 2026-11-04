import os
import sys
import pytest
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

import pandas as pd
from modules.table_region_merge import merge_vertical_table_regions
from modules.table_extractor import TableExtractor, _transpose_ir, _looks_like_row_header_grid


def test_vertical_table_merge_stacked_bands():
    """Two stacked table bands should merge into one region."""
    page_w, page_h = 1000, 1000
    r1 = {"region_id": "r1", "region_type": "Table", "bbox": [100, 100, 900, 300], "confidence": 0.9}
    r2 = {"region_id": "r2", "region_type": "Table", "bbox": [105, 310, 895, 500], "confidence": 0.85}

    res = merge_vertical_table_regions([r1, r2], page_w=page_w, page_h=page_h)
    assert len(res) == 1
    assert res[0]["region_type"] == "Table"
    assert res[0]["bbox"] == [100, 100, 900, 500]
    assert res[0]["confidence"] == 0.85


def test_vertical_table_merge_side_by_side():
    """Two side-by-side tables should NOT merge."""
    page_w, page_h = 1000, 1000
    r1 = {"region_id": "r1", "region_type": "Table", "bbox": [50, 100, 450, 500], "confidence": 0.9}
    r2 = {"region_id": "r2", "region_type": "Table", "bbox": [550, 100, 950, 500], "confidence": 0.9}

    res = merge_vertical_table_regions([r1, r2], page_w=page_w, page_h=page_h)
    assert len(res) == 2


def test_vertical_table_merge_table_and_text():
    """A table and a Text/Paragraph region should NOT merge."""
    page_w, page_h = 1000, 1000
    r1 = {"region_id": "r1", "region_type": "Table", "bbox": [100, 100, 900, 300], "confidence": 0.9}
    r2 = {"region_id": "r2", "region_type": "Paragraph", "bbox": [100, 305, 900, 400], "confidence": 0.9}

    res = merge_vertical_table_regions([r1, r2], page_w=page_w, page_h=page_h)
    assert len(res) == 2


def test_vertical_table_merge_large_vertical_gap():
    """A 200px vertical gap should NOT merge."""
    page_w, page_h = 1000, 1000
    r1 = {"region_id": "r1", "region_type": "Table", "bbox": [100, 100, 900, 300], "confidence": 0.9}
    r2 = {"region_id": "r2", "region_type": "Table", "bbox": [100, 500, 900, 700], "confidence": 0.9}

    res = merge_vertical_table_regions([r1, r2], page_w=page_w, page_h=page_h)
    assert len(res) == 2


def test_transposition_helpers():
    ir = {
        "header_rows": [["Patient ID Tag on within (Y/N/NA)", "Call bell available (Y/N)"]],
        "rows": [["Y", "Y"], ["N", "Y"]]
    }
    assert _looks_like_row_header_grid(ir) is True
    transposed = _transpose_ir(ir)
    assert transposed["header_rows"][0] == ["Item", "Entry 1", "Entry 2"]
    assert transposed["rows"][0][0] == "Patient ID Tag on within (Y/N/NA)"
