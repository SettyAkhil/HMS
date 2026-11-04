#!/usr/bin/env python3
"""
scripts/train_unified_model.py

Combines three datasets:
1. Frequency.xlsx
2. TenetServices.xlsx 
3. itemmaster_sri_sri.xlsx

Creates a unified JSON lookup and trains a single TF-IDF + LinearSVC model.
"""

import pandas as pd
import json
import joblib
import random
import re
from pathlib import Path
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.naive_bayes import MultinomialNB
import warnings

warnings.filterwarnings("ignore", category=UserWarning)

# ---------------------------------------------------------------------------
# Paths
PROJECT_ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = PROJECT_ROOT / "datasets"

FREQ_FILE = DATA_DIR / "Frequency.xlsx"
TENET_FILE = DATA_DIR / "TenetServices.xlsx"
ITEM_FILE = DATA_DIR / "itemmaster_sri_sri.xlsx"

UNIFIED_JSON = DATA_DIR / "unified_lookup.json"
MODEL_PATH = DATA_DIR / "unified_model.joblib"

# ---------------------------------------------------------------------------
# Helper for data augmentation (noise generation)
import numpy as np
from sklearn.metrics.pairwise import cosine_similarity
import scipy.sparse

class UnifiedTfidfModel:
    def __init__(self, vectorizer, X_matrix, labels):
        self.vectorizer = vectorizer
        self.X_matrix = X_matrix
        self.labels = np.array(labels)

    def predict(self, texts):
        X_query = self.vectorizer.transform(texts)
        # Cosine similarity
        sims = cosine_similarity(X_query, self.X_matrix)
        best_indices = sims.argmax(axis=1)
        return self.labels[best_indices]

def main():
    unified_records = {}
    X_raw = []
    Y_label = []
    
    print("Loading Frequency.xlsx...")
    freq_xls = pd.ExcelFile(FREQ_FILE)
    for sheet in freq_xls.sheet_names:
        df = pd.read_excel(FREQ_FILE, sheet_name=sheet)
        for _, row in df.iterrows():
            freq = str(row.get('Frequency', '')).strip()
            if not freq or freq == 'nan': continue
            key = f"FREQ|{freq}"
            
            meaning = str(row.get('Meaning', ''))
            admin = str(row.get('Administration Timing', ''))
            example = str(row.get('Example Instruction', ''))
            
            unified_records[key] = {
                "TYPE": "FREQUENCY", "CODE": freq, "MEANING": meaning,
                "ADMIN_TIMING": admin, "EXAMPLE": example
            }
            
            # Base text
            text = f"{freq} {meaning} {admin}".strip()
            if text:
                X_raw.append(text)
                Y_label.append(key)
                X_raw.append(freq)
                Y_label.append(key)
                
            # Synthesize variations to handle noisy OCR/user input
            if freq:
                variants = set()
                if '-' in freq and re.search(r'\d', freq):
                    variants.add(freq.replace('-', ' - '))
                    variants.add(freq.replace('-', ' '))
                    variants.add(freq.replace('-', '–')) # en dash
                
                # Add common suffixes
                temp_variants = list(variants) + [freq]
                for v in temp_variants:
                    variants.add(f"{v} x 5 days")
                    variants.add(f"{v} x5 days")
                    variants.add(f"{v} for 5 days")
                    variants.add(f"take {v}")
                    variants.add(f"{v} after meals")
                
                for v in variants:
                    X_raw.append(v)
                    Y_label.append(key)
                    X_raw.append(f"{v} {meaning} {admin}".strip())
                    Y_label.append(key)
                        
    print("Loading TenetServices.xlsx...")
    tenet_xls = pd.ExcelFile(TENET_FILE)
    for sheet in tenet_xls.sheet_names:
        df = pd.read_excel(TENET_FILE, sheet_name=sheet)
        for _, row in df.iterrows():
            code = str(row.get('SERVICE_CD', '')).strip()
            if not code or code == 'nan': continue
            key = f"SERVICE|{code}"
            
            name = str(row.get('SERVICE_NAME', ''))
            desc = str(row.get('SERVICE_DESC', ''))
            disp = str(row.get('SERVICE_DISPNAME', ''))
            
            unified_records[key] = {
                "TYPE": "SERVICE", "CODE": code, "NAME": name,
                "DESC": desc, "DISPNAME": disp, "SHEET": sheet
            }
            
            text = f"{code} {name} {desc} {disp}".strip()
            if text:
                X_raw.append(text)
                Y_label.append(key)

    print("Loading itemmaster_sri_sri.xlsx...")
    item_xls = pd.ExcelFile(ITEM_FILE)
    for sheet in item_xls.sheet_names:
        df = pd.read_excel(ITEM_FILE, sheet_name=sheet)
        for _, row in df.iterrows():
            code = str(row.get('ITEM_CD', '')).strip()
            if not code or code == 'nan': continue
            key = f"ITEM|{code}"
            
            name = str(row.get('ITEM_NAME', ''))
            il1 = str(row.get('IL1_NAME', ''))
            il2 = str(row.get('IL2_NAME', ''))
            
            unified_records[key] = {
                "TYPE": "ITEM", "CODE": code, "NAME": name,
                "IL1_NAME": il1, "IL2_NAME": il2
            }
            
            text = f"{code} {name} {il1} {il2}".strip()
            if text:
                X_raw.append(text)
                Y_label.append(key)

    print(f"Saving unified lookup to {UNIFIED_JSON}...")
    with open(UNIFIED_JSON, "w", encoding="utf-8") as f:
        json.dump(unified_records, f, indent=2)

    print(f"Vectorizing {len(X_raw)} unified entities...")
    vectorizer = TfidfVectorizer(analyzer="char", ngram_range=(2, 4))
    X_vec = vectorizer.fit_transform(X_raw)
    
    # Save components as a dict so it can be unpickled anywhere safely
    model_bundle = {
        "vectorizer": vectorizer,
        "X_matrix": X_vec,
        "labels": np.array(Y_label)
    }
    joblib.dump(model_bundle, MODEL_PATH)
    print(f"Unified model saved to {MODEL_PATH}")

if __name__ == "__main__":
    main()
