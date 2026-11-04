#!/usr/bin/env python3
"""Convert the full itemmaster_sri_sri.xlsx sheet to a JSON array.
The output file will be datasets/itemmaster_lookup_full.json and will contain one
JSON object per row with all columns preserved.
"""

import json
from pathlib import Path
import pandas as pd

DATA_DIR = Path(__file__).resolve().parents[1] / "datasets"
EXCEL_PATH = DATA_DIR / "itemmaster_sri_sri.xlsx"
OUTPUT_PATH = DATA_DIR / "itemmaster_lookup_full.json"

def main():
    if not EXCEL_PATH.exists():
        print(f"Excel file not found: {EXCEL_PATH}")
        return
    df = pd.read_excel(EXCEL_PATH, dtype=str)  # read everything as string to preserve values
    # Replace NaN with None for JSON compatibility
    df = df.where(pd.notnull(df), None)
    records = df.to_dict(orient="records")
    with open(OUTPUT_PATH, "w", encoding="utf-8") as f:
        json.dump(records, f, ensure_ascii=False, indent=2)
    print(f"Wrote {len(records)} records to {OUTPUT_PATH}")

if __name__ == "__main__":
    main()
