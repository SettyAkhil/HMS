import os
import sys
import pytest

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
from modules.precision_ocr import BLUEPRINTS, build_prompt

def test_prompt_blueprints_integrity():
    """Verify all blueprints in BLUEPRINTS have non-empty required fields and no template leakages."""
    assert len(BLUEPRINTS) >= 5
    for bp_name, bp in BLUEPRINTS.items():
        assert "identity" in bp and isinstance(bp["identity"], str) and len(bp["identity"]) > 5
        assert "structure" in bp and isinstance(bp["structure"], str) and len(bp["structure"]) > 5
        assert "instructions" in bp and isinstance(bp["instructions"], str) and len(bp["instructions"]) > 5
        assert "rules" in bp and isinstance(bp["rules"], str) and len(bp["rules"]) > 5

        full_prompt = build_prompt(bp_name)
        assert "[INSERT" not in full_prompt
        assert "{{PROMPT}}" not in full_prompt


def test_isbar_blueprint_routing():
    """Verify ISBAR keywords route to Nursing Handover / ISBAR Checklist blueprint."""
    for kw in ["ISBAR", "Handover Chart", "NURSE HANDOVER", "Safety Check"]:
        prompt = build_prompt(kw)
        assert "nursing shift-handover checklist grid" in prompt


def test_epilogue_stripping():
    """Verify clean_output strips single-newline epilogue commentary while preserving table rows."""
    from modules.precision_ocr import clean_output
    sample = (
        "| Section | Check Item | E1 |\n"
        "|---|---|---|\n"
        "| SAFETY | Patient ID | Y |\n"
        "\nThis Markdown-formatted transcription captures all the text from the image, "
        "including handwritten entries, ensuring 100% fidelity according to the rules provided."
    )
    cleaned = clean_output(sample)
    assert "| SAFETY | Patient ID | Y |" in cleaned
    assert "100% fidelity" not in cleaned
    assert "transcription captures all" not in cleaned


def test_build_fill_prompt_contains_no_label_strings():
    """R7 requirement: assert build_fill_prompt contains none of the template's label strings."""
    from modules.form_templates import ISBAR_HANDOVER_F22B, build_fill_prompt
    prompt = build_fill_prompt(ISBAR_HANDOVER_F22B, 10)
    for label in ISBAR_HANDOVER_F22B.labels:
        assert label not in prompt, f"Fill prompt leaked template label string: '{label}'"


