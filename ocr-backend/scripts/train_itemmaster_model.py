#!/usr/bin/env python3
"""
scripts/train_itemmaster_model.py

Creates a simple TF‑IDF + LinearSVC model that maps noisy OCR strings to the canonical
``ITEM_CD``.  The model is saved as ``datasets/itemmaster_model.joblib``.

The script is intentionally lightweight – it does not require a large corpus.  It
uses the existing ``itemmaster_lookup_full.json`` as the source of truth.  For
training data we treat the ``ITEM_NAME`` and ``ITEM_CD`` themselves as *raw OCR
tokens* that should resolve to the canonical ``ITEM_CD``.  You can extend the
``raw_examples`` list with additional noisy strings if you have them.
"""

import json
import joblib
import random
import re
from pathlib import Path
from typing import List, Tuple

from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.svm import LinearSVC

# ---------------------------------------------------------------------------
# Paths
PROJECT_ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = PROJECT_ROOT / "datasets"
FULL_JSON = DATA_DIR / "itemmaster_lookup_full.json"
MODEL_PATH = DATA_DIR / "itemmaster_model.joblib"

# ---------------------------------------------------------------------------
# Helper to generate a few synthetic noisy variants of a token
def _add_noise(token: str) -> List[str]:
    """Return a small list of noisy versions of *token*.

    Handles None or empty strings gracefully.
    """
    if not token:
        return []
    variants = [token]
    # lower‑case
    variants.append(token.lower())
    # insert random spaces
    if " " not in token:
        pos = random.randint(1, len(token) - 1)
        variants.append(token[:pos] + " " + token[pos:])
    # replace hyphens with spaces or remove them
    if "-" in token:
        variants.append(token.replace("-", " "))
        variants.append(token.replace("-", ""))
    # add trailing/leading spaces
    variants.append(" " + token)
    variants.append(token + " ")
    return list(set(variants))

# ---------------------------------------------------------------------------
# Load the full itemmaster JSON (a list of dicts)
with FULL_JSON.open("r", encoding="utf-8") as f:
    records = json.load(f)
# If the JSON is a dict keyed by ITEM_CD, convert to list of records
if isinstance(records, dict):
    # Transform into list of records where each record includes its ITEM_CD
    records = [{"ITEM_CD": k, **v} for k, v in records.items()]


# Build training data: raw token → ITEM_CD (label)
X_raw: List[str] = []
Y_label: List[str] = []
for rec in records:
    item_cd = rec.get("ITEM_CD")
    if not item_cd:
        continue
    item_name = rec.get("ITEM_NAME", "")
    # Use the raw ITEM_CD and ITEM_NAME as base tokens
    base_tokens = [item_cd, item_name]
    for token in base_tokens:
        for noisy in _add_noise(token):
            X_raw.append(noisy)
            Y_label.append(item_cd)


# Shuffle to avoid any ordering bias
combined = list(zip(X_raw, Y_label))
random.shuffle(combined)
X_raw, Y_label = zip(*combined)

# ---------------------------------------------------------------------------
# Vectorise and train
vectorizer = TfidfVectorizer(analyzer="char", ngram_range=(2, 5))
X_vec = vectorizer.fit_transform(X_raw)
model = LinearSVC()
model.fit(X_vec, Y_label)

# ---------------------------------------------------------------------------
# Save a tiny wrapper that includes the vectorizer and the classifier
class ItemMasterModel:
    """Simple wrapper exposing ``predict`` compatible with existing resolver.

    The resolver will call ``MODEL.predict([raw_string])`` and expects the
    prediction to be an ``ITEM_CD``.  Storing both the vectorizer and classifier
    inside a single object makes pickling straightforward.
    """

    def __init__(self, vec, clf):
        self.vec = vec
        self.clf = clf

    def predict(self, raw_list: List[str]):
        X = self.vec.transform(raw_list)
        return self.clf.predict(X)

# Persist the wrapper
wrapper = ItemMasterModel(vectorizer, model)
joblib.dump(wrapper, MODEL_PATH)
print(f"Item‑master model trained on {len(X_raw)} samples and saved to {MODEL_PATH}")

"""
scripts/train_itemmaster_model.py

Generate a lightweight TF‑IDF + LinearSVC model that maps noisy OCR strings
to the canonical ITEM_CD. The model is saved as
datasets/itemmaster_model.joblib.

Usage:
    python3 scripts/train_itemmaster_model.py
"""

import json
import re
from pathlib import Path

# Optional sklearn imports – they will be installed in the environment.
try:
    from sklearn.feature_extraction.text import TfidfVectorizer
    from sklearn.svm import LinearSVC
    import joblib
except ImportError as e:
    raise RuntimeError("scikit-learn and joblib are required to train the model. Install with 'pip install scikit-learn joblib'.")

# ---------------------------------------------------------------------------
PROJECT_ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = PROJECT_ROOT / "datasets"
FULL_JSON = DATA_DIR / "itemmaster_lookup_full.json"
MODEL_PATH = DATA_DIR / "itemmaster_model.joblib"

def load_items() -> list[dict]:
    """Load the full itemmaster JSON array.

    Returns a list of records, each containing at least ``ITEM_CD`` and ``ITEM_NAME``.
    """
    with FULL_JSON.open("r", encoding="utf-8") as f:
        return json.load(f)

def build_training_data(records: list[dict]):
    """Create training samples.

    For each record we produce a *raw* example that mimics typical OCR output.
    Here we simply use a few variations of the item code and name – you can
    extend this with a real OCR corpus if you have one.
    """
    texts = []   # raw OCR strings (inputs to the model)
    labels = []   # canonical ITEM_CD (target)
    for rec in records:
        code = rec.get("ITEM_CD", "")
        name = rec.get("ITEM_NAME", "")
        # Basic variants – you may enrich this list later
        variants = [
            code,
            code.replace("-", " "),
            code.replace("_", ""),
            name,
            name.lower(),
            re.sub(r"[\s-]+", "", name),
        ]
        for v in variants:
            if v:
                texts.append(v)
                labels.append(code)
    return texts, labels

def train_and_save(texts: list[str], labels: list[str]):
    """Train TF‑IDF + LinearSVC and persist the model."""
    vectorizer = TfidfVectorizer(analyzer="char", ngram_range=(2, 4))
    X = vectorizer.fit_transform(texts)
    clf = LinearSVC()
    clf.fit(X, labels)
    # Store a dictionary with both the vectorizer and the classifier
    model_bundle = {"vectorizer": vectorizer, "classifier": clf}
    joblib.dump(model_bundle, MODEL_PATH)
    print(f"ItemMaster model written to {MODEL_PATH} ({MODEL_PATH.stat().st_size} bytes)")

def main():
    records = load_items()
    texts, labels = build_training_data(records)
    print(f"Training on {len(texts)} samples for {len(set(labels))} distinct ITEM_CD values")
    train_and_save(texts, labels)

if __name__ == "__main__":
    main()
