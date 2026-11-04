#!/usr/bin/env python3
"""
Convert the massive JSON array (itemmaster_lookup_full.json) into a JSON object keyed by ITEM_CD.
Result written to datasets/itemmaster_lookup_by_id.json
"""

import json
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = PROJECT_ROOT / "datasets"
FULL_JSON = DATA_DIR / "itemmaster_lookup_full.json"
KEYED_JSON = DATA_DIR / "itemmaster_lookup_by_id.json"

def main():
    if not FULL_JSON.is_file():
        raise FileNotFoundError(f"Source file missing: {FULL_JSON}")
    # Load the original list
    with FULL_JSON.open("r", encoding="utf-8") as f:
        records = json.load(f)
    # Build dictionary
    keyed = {rec["ITEM_CD"]: rec for rec in records}
    # Write out
    with KEYED_JSON.open("w", encoding="utf-8") as f:
        json.dump(keyed, f, ensure_ascii=False, indent=2)
    print(f"Created keyed JSON with {len(keyed)} entries at {KEYED_JSON}")

if __name__ == "__main__":
    main()
