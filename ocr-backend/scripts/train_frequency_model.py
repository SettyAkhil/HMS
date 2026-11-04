#!/usr/bin/env python3
"""Train a small classifier to resolve noisy OCR frequency codes (e.g. 1-0-1).

Creates:
- datasets/frequency_model.joblib
- datasets/frequency_lookup.json

Run: python3 scripts/train_frequency_model.py
"""
import os
import re
import json
import random
from pathlib import Path

import pandas as pd
import numpy as np

from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.pipeline import Pipeline
import joblib


DATA_DIR = Path(__file__).resolve().parents[1] / "datasets"
FREQ_XLS = DATA_DIR / "Frequency.xlsx"
MODEL_OUT = DATA_DIR / "frequency_model.joblib"
LOOKUP_OUT = DATA_DIR / "frequency_lookup.json"


def load_frequency_df(path):
    df = pd.read_excel(path).fillna("")
    return df


def normalize_code(code: str) -> str:
    code = str(code).strip()
    code = re.sub(r'[–—−‑]', '-', code)
    code = re.sub(r'\s+', ' ', code)
    return code.lower()


def compact_code(code: str) -> str:
    return re.sub(r'[\s-]+', '', normalize_code(code))


def synthesize_noisy_variants(code: str, n=100):
    variants = set()
    base = compact_code(code)
    variants.add(base)

    dash_variants = ['-', '–', '—', '−', ' ']  # include space as variant
    for _ in range(n * 2):
        s = base
        # randomly replace some 1->I or I->1
        if random.random() < 0.2:
            s = s.replace('1', random.choice(['1', 'I', 'l']))
        # random dash variants
        s = re.sub(r'-', lambda _: random.choice(dash_variants), s)
        # maybe add spaces
        if random.random() < 0.2:
            s = s.replace('-', ' - ')
        # append trailing text like x5days or 'x 5 days'
        if random.random() < 0.15:
            s = s + ' x' + str(random.randint(1,14)) + 'days'
        # sometimes embed in surrounding words
        if random.random() < 0.1:
            s = f"{random.choice(['after meals', 'before meals', ''])} {s}"
        variants.add(s)
        if len(variants) >= n:
            break

    return list(variants)


def build_dataset(df, examples_per_code=200, exact_only=False):
    """Build dataset. If exact_only=True, use only canonical Frequency values from Excel (no augmentation)."""
    texts = []
    labels = []
    lookup = {}

    for _, row in df.iterrows():
        code = str(row.get('Frequency', '')).strip()
        if not code:
            continue
        key = compact_code(code)
        lookup[key] = {
            'Frequency': code,
            'Meaning': row.get('Meaning', ''),
            'Administration Timing': row.get('Administration Timing', ''),
            'Example Instruction': row.get('Example Instruction', ''),
        }

        if exact_only:
            texts.append(key)
            labels.append(key)
        else:
            variants = synthesize_noisy_variants(code, n=examples_per_code)
            for v in variants:
                texts.append(v)
                labels.append(key)

    return texts, labels, lookup


def train_and_save(texts, labels, model_path):
    pipeline = Pipeline([
        ('tfidf', TfidfVectorizer(analyzer='char_wb', ngram_range=(2,5))),
        ('clf', LogisticRegression(max_iter=2000))
    ])

    pipeline.fit(texts, labels)
    joblib.dump(pipeline, model_path)
    return pipeline


def main():
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument('--mode', choices=['synth','exact'], default='synth', help='Training mode: synth (default) or exact (use only Excel rows)')
    args = parser.parse_args()

    if not FREQ_XLS.exists():
        print(f"Frequency file not found at: {FREQ_XLS}")
        return

    df = load_frequency_df(FREQ_XLS)
    if args.mode == 'exact':
        texts, labels, lookup = build_dataset(df, exact_only=True)
    else:
        texts, labels, lookup = build_dataset(df, examples_per_code=300, exact_only=False)

    print(f"Training on {len(texts)} examples for {len(set(labels))} codes (mode={args.mode})...")
    pipeline = train_and_save(texts, labels, MODEL_OUT)
    print(f"Model saved to {MODEL_OUT}")

    with open(LOOKUP_OUT, 'w', encoding='utf-8') as f:
        json.dump(lookup, f, ensure_ascii=False, indent=2)
    print(f"Lookup saved to {LOOKUP_OUT}")

    # Quick demo predictions
    samples = ['1-0-1', '1 0 1', 'I-0-1', '1–0–1 x5days', 'after meals 1 - 0 - 1']
    print('\nDemo predictions:')
    for s in samples:
        pred = pipeline.predict([s])[0]
        info = lookup.get(pred, {})
        print(f"Input: {s} -> Predicted canonical: {pred} -> Meaning: {info.get('Meaning','')}")


if __name__ == '__main__':
    main()
