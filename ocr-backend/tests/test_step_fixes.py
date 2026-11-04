import os
import sys
import pytest

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from modules.precision_ocr import prune_empty_table_rows, _normalize_markdown_tables
from modules.region_ocr import is_degenerate_json_ir, _is_degenerate
from modules.required_fields import audit_grid_row_coverage, ISBAR_EXPECTED_LABELS

def test_p1_prune_empty_table_rows():
    """Verify prune_empty_table_rows removes empty data rows while keeping header."""
    sample = "| Col A | Col B |\n|---|---|\n| | |\n| Val 1 | Val 2 |\n| | |\n| | |"
    pruned = prune_empty_table_rows(sample)
    lines = [l.strip() for l in pruned.splitlines() if l.strip().startswith("|")]
    assert len(lines) == 3  # Header, separator, Val 1/Val 2
    assert "Val 1" in pruned


def test_p2_json_ir_degeneracy():
    """Verify is_degenerate_json_ir catches repetitive/empty JSON IR."""
    ir_empty = {"rows": [[""] * 5 for _ in range(100)]}
    is_deg, reason = is_degenerate_json_ir(ir_empty)
    assert is_deg is True
    assert reason in {"consecutive_identical_rows", "empty_rows_flood"}


def test_p8_audit_grid_row_coverage():
    """Verify audit_grid_row_coverage returns missing check items."""
    good_text = "| Patient ID Tag on within | Y |\n| Call bell/staff made available | N |"
    missing = audit_grid_row_coverage(good_text, ISBAR_EXPECTED_LABELS)
    assert len(missing) > 0
    assert "Patient ID Tag on within" not in missing
