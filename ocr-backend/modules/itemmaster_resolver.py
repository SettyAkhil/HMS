#!/usr/bin/env python3
"""Utility to resolve itemmaster codes to their metadata.

The full itemmaster data is stored in ``datasets/itemmaster_lookup_full.json``.
This module loads that JSON once at import time, builds two lookup tables:
1. ``ITEM_INDEX`` – exact match on ``ITEM_CD``.
2. ``COMPACT_INDEX`` – a normalized key where spaces, dashes and case are stripped.
It also optionally loads a trained model (``itemmaster_model.joblib``) for fuzzy
matching of noisy OCR tokens, mirroring the behaviour of ``frequency_resolver``.
"""

import json
import re
from pathlib import Path
from typing import Optional, Dict, Any

# Optional model support (mirrors frequency_resolver)
try:
    import joblib
    _have_joblib = True
except Exception:
    _have_joblib = False

DATA_DIR = Path(__file__).resolve().parents[2] / "datasets"
LOOKUP_PATH = DATA_DIR / "itemmaster_lookup_full.json"
MODEL_PATH = DATA_DIR / "itemmaster_model.joblib"

# Load the full JSON array (list of dicts)
try:
    with LOOKUP_PATH.open(encoding="utf-8") as f:
        _ITEM_LIST = json.load(f)
except FileNotFoundError:
    raise RuntimeError(f"Itemmaster JSON not found at {LOOKUP_PATH}")

# Build exact lookup: ITEM_CD -> record
ITEM_INDEX: Dict[str, Dict[str, Any]] = {rec["ITEM_CD"]: rec for rec in _ITEM_LIST}

# Helper to create a compact key (remove spaces/dashes, lower‑case)
def _compact_code(code: str) -> str:
    # Remove whitespace, hyphens, en‑dash, em‑dash, minus sign, and make lower case
    code = re.sub(r"[\s\-–—−]", "", code)
    return code.lower()

# Build compact lookup for tolerant matching (keyed by compacted ITEM_CD)
COMPACT_INDEX: Dict[str, Dict[str, Any]] = {
    _compact_code(rec["ITEM_CD"]): rec for rec in _ITEM_LIST
}

# Load optional model (if present)
MODEL = None
if _have_joblib and MODEL_PATH.exists():
    try:
        MODEL = joblib.load(MODEL_PATH)
    except Exception:
        MODEL = None

def resolve_item(item_cd: str) -> Optional[Dict[str, Any]]:
    """Return the metadata record for *item_cd*.

    The function attempts three strategies in order:
    1️⃣ Exact match against ``ITEM_INDEX``.
    2️⃣ Compact match (ignores spaces/dashes/case).
    3️⃣ Model fallback (if a model is available).
    Returns ``None`` when no match is found.
    """
    # Exact match
    if item_cd in ITEM_INDEX:
        return ITEM_INDEX[item_cd]
    # Compact match
    compact_key = _compact_code(item_cd)
    if compact_key in COMPACT_INDEX:
        return COMPACT_INDEX[compact_key]
    # Model fallback
    if MODEL is not None:
        try:
            pred = MODEL.predict([item_cd])[0]
            return ITEM_INDEX.get(pred)
        except Exception:
            pass
    return None

# Simple demo when run as a script
if __name__ == "__main__":
    test_codes = ["ITEM6297", "item6297", "ITEM 6297", "ITEM-6297"]
    for code in test_codes:
        result = resolve_item(code)
        print(f"Lookup {code!r} -> {result}")
