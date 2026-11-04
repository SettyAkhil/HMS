import os
import re
import sys
import pytest

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
from modules.form_templates import ISBAR_HANDOVER_F22B, TEMPLATES

FIXTURE_PATH = os.path.join(os.path.dirname(__file__), "fixtures", "isbar_f22b_labels.txt")

def test_labels_match_fixture():
    """Assert ISBAR_HANDOVER_F22B.labels equals lines of tests/fixtures/isbar_f22b_labels.txt exactly."""
    assert os.path.exists(FIXTURE_PATH), f"Fixture not found at {FIXTURE_PATH}"
    with open(FIXTURE_PATH, "r", encoding="utf-8") as f:
        expected = [line.strip() for line in f if line.strip()]
    assert ISBAR_HANDOVER_F22B.labels == expected, (
        f"Template labels do not match fixture.\nActual: {ISBAR_HANDOVER_F22B.labels}\nExpected: {expected}"
    )


def test_no_hallucinated_label_canary():
    """Assert no label in any template matches hallucinated model phrases."""
    canary_pattern = re.compile(
        r'(?i)\b(assessment done|documented|cross checked|handed over|Fall risk|SpO2|Pain score|Remarks|Plan of Care)\b'
    )
    for tmpl in TEMPLATES:
        for label in tmpl.labels:
            assert not canary_pattern.search(label), (
                f"Template '{tmpl.template_id}' label '{label}' contains hallucinated model canary phrase"
            )
