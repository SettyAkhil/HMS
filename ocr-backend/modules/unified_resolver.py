#!/usr/bin/env python3
import json
import re
from pathlib import Path
import numpy as np

try:
    import joblib
    _have_joblib = True
except Exception:
    _have_joblib = False

DATA_DIR = Path(__file__).resolve().parents[1] / "datasets"
MODEL_PATH = DATA_DIR / "unified_model.joblib"
LOOKUP_PATH = DATA_DIR / "unified_lookup.json"

# We must define the class so joblib can unpickle it
from sklearn.metrics.pairwise import cosine_similarity
import scipy.sparse
class UnifiedTfidfModel:
    def __init__(self, vectorizer, X_matrix, labels):
        self.vectorizer = vectorizer
        self.X_matrix = X_matrix
        self.labels = np.array(labels)

    def predict(self, texts):
        X_query = self.vectorizer.transform(texts)
        sims = cosine_similarity(X_query, self.X_matrix)
        best_indices = sims.argmax(axis=1)
        return self.labels[best_indices], sims.max(axis=1)

def load_resources():
    model = None
    lookup = {}
    if LOOKUP_PATH.exists():
        try:
            with open(LOOKUP_PATH, 'r', encoding='utf-8') as f:
                lookup = json.load(f)
        except Exception:
            pass

    if _have_joblib and MODEL_PATH.exists():
        try:
            bundle = joblib.load(MODEL_PATH)
            model = UnifiedTfidfModel(bundle['vectorizer'], bundle['X_matrix'], bundle['labels'])
        except Exception as e:
            print("Model load error:", e)

    return model, lookup

MODEL, LOOKUP = load_resources()

# Build an exact code map for instant lookups (bypassing TF-IDF if exact code is found)
EXACT_CODE_MAP = {}
for key, info in LOOKUP.items():
    code = info.get("CODE", "").strip().upper()
    if code:
        EXACT_CODE_MAP[code] = key

def get_prediction(text: str):
    """Try exact code match first, then fallback to TF-IDF model."""
    clean_text = text.strip().upper()
    if clean_text in EXACT_CODE_MAP:
        return [EXACT_CODE_MAP[clean_text]], [1.0]
    
    if MODEL:
        return MODEL.predict([text])
    
    return [], [0.0]

def format_annotation(key: str, info: dict) -> str:
    typ = info.get("TYPE", "UNKNOWN")
    if typ == "FREQUENCY":
        meaning = info.get("MEANING", "")
        admin = info.get("ADMIN_TIMING", "")
        code = info.get("CODE", key)
        return f"[{code} → {meaning} {admin}]".strip()
    elif typ == "ITEM":
        name = info.get("NAME", "")
        return f"[{info['CODE']} → {name}]".strip()
    elif typ == "SERVICE":
        name = info.get("NAME", "")
        return f"[{info['CODE']} → {name}]".strip()
    return f"[{key}]"

def is_medical_candidate(text: str) -> bool:
    t = text.strip()
    if t.upper() in EXACT_CODE_MAP:
        return True
    if len(t) < 2:
        return False
        
    # Exclude demographic and metadata fields
    lower_t = t.lower()
    exclude_prefixes = (
        'name', 'patient name', 'age', 'sex', 'gender', 'address', 'date', 
        'time', 'dob', 'dr.', 'dr ', 'doctor', 'ph:', 'phone:', 'email', 
        'mobile', 'mr.', 'mrs.', 'ms.', 'patient:', 'referred by', 'hospital'
    )
    if any(lower_t.startswith(prefix) for prefix in exclude_prefixes):
        return False
        
    # Also exclude patterns that look like pure dates (e.g., DD/MM/YYYY)
    if re.match(r'^\d{1,2}[/-]\d{1,2}[/-]\d{2,4}', t):
        return False
    if re.match(r'^\d{1,2}\s*(am|pm)$', t, re.I):
        return False
    if re.match(r'^\d{1,2}:\d{2}', t):
        return False
    if re.match(r'^\d+\s+[a-z]+$', t, re.I):
        return False
    if re.match(r'^\d+([./]\d+)?[a-z]{0,3}$', t, re.I) and not re.search(r'[A-Z]{2,}', t):
        return False
    if re.search(r'\d', t):
        return True
    letters_only = re.sub(r'[^a-zA-Z]', '', t)
    upper_ratio = sum(1 for c in letters_only if c.isupper()) / max(len(letters_only), 1)
    if upper_ratio >= 0.8 and 2 <= len(t) <= 12:
        return True
    return False

def resolve_entities_in_text(text: str):
    """Scan text, identify medical entities (items, services, frequencies) via Unified Model, and annotate them."""
    if not text:
        return text, []

    lines = text.split('\n')
    annotated_lines = []
    predictions = []

    for line in lines:
        # Ignore markdown separators
        if re.match(r'^[\s\|\-]+$', line):
            annotated_lines.append(line)
            continue

        # If it's a table row, process each cell
        if '|' in line:
            cells = line.split('|')
            new_cells = []
            for cell in cells:
                c_str = cell.strip()
                if not c_str or c_str.lower() in ['s.no', 'test code/name', 'sample type', 'patient name', 'age/sex']:
                    new_cells.append(cell)
                    continue
                
                # Check if cell text is a potential entity
                if is_medical_candidate(c_str):
                    labels, scores = get_prediction(c_str)
                    if labels and scores[0] > 0.55:
                        info = LOOKUP.get(labels[0], {})
                        if info:
                            # Autocorrect the text itself using the dataset
                            matched_term = info.get("NAME", info.get("MEANING", c_str))
                            # We already know scores[0] > 0.55, so forcefully autocorrect
                            cell = f" {matched_term} {format_annotation(labels[0], info)} "
                                
                            predictions.append({
                                "Original Text": c_str,
                                "Predicted Code": info.get("CODE", labels[0]),
                                "Predicted Name": info.get("NAME", info.get("MEANING", "")),
                                "Type": info.get("TYPE", "UNKNOWN"),
                                "Confidence": f"{scores[0]:.2f}"
                            })
                new_cells.append(cell)
            annotated_lines.append('|'.join(new_cells))
        else:
            c_str = line.strip()
            clean_str = re.sub(r'^[\-\*\•]\s+', '', c_str)
            clean_str = re.sub(r'^\d+\.\s+', '', clean_str)
            if is_medical_candidate(clean_str):
                labels, scores = get_prediction(clean_str)
                if labels and scores[0] > 0.55:
                    info = LOOKUP.get(labels[0], {})
                    if info:
                        # Autocorrect the text itself using the dataset
                        matched_term = info.get("NAME", info.get("MEANING", clean_str))
                        # We already know scores[0] > 0.55, so forcefully autocorrect
                        line = line.replace(clean_str, matched_term) + f" {format_annotation(labels[0], info)}"
                            
                        predictions.append({
                            "Original Text": clean_str,
                            "Predicted Code": info.get("CODE", labels[0]),
                            "Predicted Name": info.get("NAME", info.get("MEANING", "")),
                            "Type": info.get("TYPE", "UNKNOWN"),
                            "Confidence": f"{scores[0]:.2f}"
                        })
            annotated_lines.append(line)

    return '\n'.join(annotated_lines), predictions

if __name__ == "__main__":
    sample = "- Hetrovec 250mg\n- Q4H\n- AC\n- 11A2712"
    print("Testing Resolver:")
    res, preds = resolve_entities_in_text(sample)
    print(res)
    print(preds)
