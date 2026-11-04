import json
import pytest
from pathlib import Path

from modules.frequency_resolver import validate_frequency, validate_route, detect_column_propagation
from modules.chart_validator import validate_chart_rows
from modules.precision_ocr import BLUEPRINTS

FIXTURES_DIR = Path(__file__).parent / "fixtures"
GOLDEN_JSON = FIXTURES_DIR / "premier_drug_chart_001.json"


def test_drug_chart_blueprint_registered():
    """Verify that Drug Chart / MAR blueprint exists with 9 columns and closed set rules."""
    assert "Drug Chart / MAR" in BLUEPRINTS
    bp = BLUEPRINTS["Drug Chart / MAR"]
    assert "CLOSED SET" in bp["rules"]
    assert "LITERAL TRANSCRIPTION" in bp["rules"]


def test_premier_drug_chart_golden_set_regression():
    """Golden-set regression tests for Premier Hospital Drug Chart form."""
    with open(GOLDEN_JSON, "r", encoding="utf-8") as f:
        data = json.load(f)

    rows = data["rows"]
    assert len(rows) == 13

    # Regression Case 1: INJ MAGNEX FORTE is not BNT MAGNEX
    r1 = rows[0]
    assert "MAGNEX" in r1["drug_name"]
    assert "BNT" not in r1["drug_name"]
    assert r1["drug_name"].startswith("INJ")

    # Regression Case 2: THYRONORM unit is mcg, not mg
    r2 = rows[1]
    assert "THYRONORM" in r2["drug_name"]
    assert "mcg" in r2["dose"].lower()
    assert "mg" not in r2["dose"].lower()

    # Regression Case 3: ZOFER dose is 4, not 40
    r3 = rows[2]
    assert "ZOFER" in r3["drug_name"]
    assert r3["dose"].strip() == "4 mg"

    # Regression Case 4: HEPARIN freq is TID, not BD
    r4 = rows[3]
    assert "HEPARIN" in r4["drug_name"]
    assert r4["freq"] == "TID"

    # Regression Case 5: PAN, OPTINERON, LASIX, ECOSPRIN, DUPHALAC freq is OD, not BD
    od_drugs = ["PAN", "OPTINERON", "LASIX", "ECOSPRIN", "DUPHALAC"]
    for drug in od_drugs:
        matching = [r for r in rows if drug in r["drug_name"]]
        assert len(matching) == 1, f"Expected 1 matching row for {drug}"
        assert matching[0]["freq"] == "OD", f"{drug} frequency should be OD, got {matching[0]['freq']}"

    # Regression Case 6: ATORVAS freq is HS
    r9 = [r for r in rows if "ATORVAS" in r["drug_name"]][0]
    assert r9["freq"] == "HS"

    # Regression Case 7: The Stop Orders column is empty for every row
    for r in rows:
        assert r["stop_orders"] == "", f"Stop Orders should be empty for row {r['row']}, got '{r['stop_orders']}'"


def test_closed_set_frequency_validation():
    """Verify validate_frequency legal vs illegal codes."""
    is_valid, norm = validate_frequency("BD")
    assert is_valid is True
    assert norm == "BD"

    is_valid, norm = validate_frequency("TID")
    assert is_valid is True

    is_valid, norm = validate_frequency("UNKNOWN_FREQ")
    assert is_valid is False

    is_valid, norm = validate_frequency("?")
    assert is_valid is False
    assert norm == "?"


def test_closed_set_route_validation():
    """Verify validate_route legal vs illegal codes."""
    is_valid, norm = validate_route("IV")
    assert is_valid is True

    is_valid, norm = validate_route("PO")
    assert is_valid is True

    is_valid, norm = validate_route("INVALID_ROUTE")
    assert is_valid is False


def test_column_propagation_detector():
    """Verify that detect_column_propagation flags when >=80% of rows have identical Freq."""
    bad_rows = [{"freq": "BD"} for _ in range(10)]
    assert detect_column_propagation(bad_rows, "freq", 0.8) is True

    good_rows = [{"freq": "OD"}, {"freq": "BD"}, {"freq": "TID"}, {"freq": "HS"}, {"freq": "SOS"}]
    assert detect_column_propagation(good_rows, "freq", 0.8) is False


def test_chart_validator_flags_dangerous_errors():
    """Verify chart_validator flags 1000x dosage errors, 10x dose errors, and stop orders leakage."""
    bad_chart = [
        {
            "row": 1,
            "drug_name": "THYRONORM",
            "dose": "75 mg",  # Should be mcg!
            "route": "PO",
            "freq": "OD",
            "nurse": "7am",
            "stop_orders": ""
        },
        {
            "row": 2,
            "drug_name": "ZOFER",
            "dose": "40 mg",  # Should be 4 mg!
            "route": "IV",
            "freq": "SOS",
            "nurse": "",
            "stop_orders": ""
        },
        {
            "row": 3,
            "drug_name": "INJ MAGNEX FORTE",
            "dose": "1.5 g",
            "route": "IV",
            "freq": "BD",
            "nurse": "",
            "stop_orders": "7am / 7pm"  # Column bleed!
        }
    ]

    flags = validate_chart_rows(bad_chart)
    assert len(flags) >= 3

    severities = [f["severity"] for f in flags]
    assert "critical" in severities

    messages = " ".join([f["message"] for f in flags])
    assert "1000x" in messages
    assert "10x" in messages
    assert "Column bleed" in messages


@pytest.mark.asyncio
async def test_medical_corrector_never_auto_applies_on_drug_name_or_dose():
    """Verify MedicalCorrector returns drug/dose corrections as suggestions only."""
    from modules.medical_corrector import MedicalCorrector
    corrector = MedicalCorrector()

    result = await corrector.correct_text("THYRONORM 75 mg", is_chart_cell=True, field_name="Name of the Drug")
    # Original text must NOT be auto-replaced for chart cells
    assert result["corrected_text"] == "THYRONORM 75 mg"
    for c in result.get("corrections", []):
        assert c.get("suggestion_only") is True
