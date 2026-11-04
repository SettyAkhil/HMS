import re
import json
from pathlib import Path
from difflib import get_close_matches

import pandas as pd

try:
    import joblib
    _have_joblib = True
except Exception:
    _have_joblib = False

DATA_DIR = Path(__file__).resolve().parents[1] / "datasets"
MODEL_PATH = DATA_DIR / "frequency_model.joblib"
LOOKUP_PATH = DATA_DIR / "frequency_lookup.json"
FREQ_XLS_PATH = DATA_DIR / "Frequency.xlsx"


def normalize_code(tok: str) -> str:
    t = str(tok).strip()
    t = re.sub(r'[–—−‑]', '-', t)
    t = re.sub(r'\s+', ' ', t)
    return t.lower()


def compact_code(tok: str) -> str:
    return re.sub(r'[\s-]+', '', normalize_code(tok))


def load_lookup_from_excel():
    lookup = {}
    raw_to_key = {}
    if not FREQ_XLS_PATH.exists():
        return lookup, raw_to_key

    try:
        df = pd.read_excel(FREQ_XLS_PATH).fillna('')
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
            raw_to_key[normalize_code(code)] = key
    except Exception:
        pass

    return lookup, raw_to_key


def load_resources():
    model = None
    lookup, raw_to_key = load_lookup_from_excel()

    if not lookup and LOOKUP_PATH.exists():
        try:
            with open(LOOKUP_PATH, 'r', encoding='utf-8') as f:
                temp = json.load(f)
                lookup = {compact_code(k): v for k, v in temp.items()}
                raw_to_key = {normalize_code(k): compact_code(k) for k in temp.keys()}
        except Exception:
            lookup = {}
            raw_to_key = {}

    if _have_joblib and MODEL_PATH.exists():
        try:
            model = joblib.load(MODEL_PATH)
        except Exception:
            model = None

    return model, lookup, raw_to_key


MODEL, LOOKUP, RAW_TO_KEY = load_resources()
KNOWN_CODES = sorted(RAW_TO_KEY.keys(), key=len, reverse=True)


def find_dataset_match(raw: str):
    raw_norm = normalize_code(raw)
    raw_compact = compact_code(raw)

    if raw_norm in RAW_TO_KEY:
        key = RAW_TO_KEY[raw_norm]
        return key, LOOKUP.get(key)
    if raw_compact in LOOKUP:
        return raw_compact, LOOKUP.get(raw_compact)

    for code_key in KNOWN_CODES:
        if code_key in raw_norm or raw_norm in code_key:
            return RAW_TO_KEY.get(code_key), LOOKUP.get(RAW_TO_KEY.get(code_key))
    for code_key in KNOWN_CODES:
        key = RAW_TO_KEY.get(code_key)
        if key and (key in raw_compact or raw_compact in key):
            return key, LOOKUP.get(key)

    return None, None


def resolve_token(raw: str):
    key, info = find_dataset_match(raw)
    if info:
        return key, info

    if MODEL is not None:
        try:
            pred = MODEL.predict([compact_code(raw)])[0]
            info = LOOKUP.get(pred)
            if info:
                return pred, info
        except Exception:
            pass

    keys = list(LOOKUP.keys())
    if keys:
        matches = get_close_matches(compact_code(raw), keys, n=1, cutoff=0.7)
        if matches:
            return matches[0], LOOKUP.get(matches[0])

    return None, None


def code_pattern(raw_code: str) -> str:
    pattern = re.escape(raw_code)
    pattern = pattern.replace(r'\ ', r'[\s-]+')
    pattern = pattern.replace(r'\-', r'[\s-]*')
    return pattern


def build_code_regex():
    if not KNOWN_CODES:
        return None

    raw_patterns = [code_pattern(code) for code in KNOWN_CODES]
    pattern = r'(?<![A-Za-z0-9])(' + '|'.join(raw_patterns) + r')(?![A-Za-z0-9])'
    return re.compile(pattern, re.IGNORECASE)


CODE_REGEX = build_code_regex()


def resolve_frequencies_in_text(text: str) -> str:
    """Annotate found frequency tokens in the text with their resolved meaning."""
    if not text:
        return text

    def _repl(m):
        raw = m.group(1)
        key, info = resolve_token(raw)
        if info:
            meaning = info.get('Meaning', '')
            instr = info.get('Example Instruction', '')
            return f"{raw} [Freq → {meaning}; Instr → {instr}]"
        return raw

    if CODE_REGEX:
        return CODE_REGEX.sub(_repl, text)

    return text


# --- Closed Vocabulary & Column Propagation Helpers ---

VALID_FREQUENCIES = {
    "OD", "BD", "TID", "TDS", "QID", "QDS", "HS", "SOS", "STAT",
    "Q4H", "Q6H", "Q8H", "Q12H", "WEEKLY", "ALT",
}

VALID_ROUTES = {
    "IV", "PO", "IM", "SC", "SL", "PR", "TOP", "NEB", "ID", "NG", "INH",
}


def validate_frequency(raw: str) -> tuple[bool, str]:
    """
    Returns (is_valid, normalised). Does NOT correct — callers should set
    needs_review=True on invalid tokens rather than substituting a guess.
    """
    if raw is None:
        return False, ""
    token = raw.strip().upper().replace(".", "").replace(" ", "")
    if not token:
        return True, ""          # empty is legal
    if token == "?":
        return False, "?"        # explicitly flagged by the model
    return token in VALID_FREQUENCIES, token


def validate_route(raw: str) -> tuple[bool, str]:
    """Returns (is_valid, normalised) for drug route validation."""
    if raw is None:
        return False, ""
    token = raw.strip().upper().replace(".", "").replace(" ", "")
    if not token:
        return True, ""
    return token in VALID_ROUTES, token


def detect_column_propagation(rows: list[dict], field: str = "freq",
                              threshold: float = 0.8) -> bool:
    """
    Self-detects column propagation bug: if >=80% of rows carry an identical Freq. value,
    the model has almost certainly propagated one reading down the column.
    """
    values = [str(r.get(field, "")).strip().upper() for r in rows]
    values = [v for v in values if v]
    if len(values) < 4:
        return False
    top_count = max(values.count(v) for v in set(values))
    return (top_count / len(values)) >= threshold

