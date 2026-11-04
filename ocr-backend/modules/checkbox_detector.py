import cv2
import re
import numpy as np
import logging
from dataclasses import dataclass
from PIL import Image
from typing import List, Tuple, Dict, Any, Optional

logger = logging.getLogger(__name__)

@dataclass
class Checkbox:
    bbox: Tuple[int, int, int, int]  # (x1, y1, x2, y2)
    state: str                        # "checked" | "unchecked" | "unclear"
    label: str = ""
    column_index: int = 0
    is_na_box: bool = False
    companion_item_text: str = ""


def _calculate_ink_ratios(img_cv: np.ndarray, bbox: Tuple[int, int, int, int]) -> Tuple[float, float]:
    """
    Computes interior ink ratio and 4px outer ring ink ratio.
    """
    x1, y1, x2, y2 = bbox
    h_img, w_img = img_cv.shape[:2]

    # Crop interior excluding 2px border
    ix1, iy1 = max(0, x1 + 2), max(0, y1 + 2)
    ix2, iy2 = min(w_img, x2 - 2), min(h_img, y2 - 2)

    if ix2 <= ix1 or iy2 <= iy1:
        return 0.0, 0.0

    gray = cv2.cvtColor(img_cv, cv2.COLOR_BGR2GRAY) if img_cv.ndim == 3 else img_cv
    binary = cv2.adaptiveThreshold(gray, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY_INV, 15, 2)

    interior_crop = binary[iy1:iy2, ix1:ix2]
    interior_ink = float(np.mean(interior_crop > 0))

    # Outer 4px ring
    ox1, oy1 = max(0, x1 - 4), max(0, y1 - 4)
    ox2, oy2 = min(w_img, x2 + 4), min(h_img, y2 + 4)
    outer_crop = binary[oy1:oy2, ox1:ox2]

    ring_mask = np.ones_like(outer_crop, dtype=bool)
    ring_ix1, ring_iy1 = ix1 - ox1, iy1 - oy1
    ring_ix2, ring_iy2 = ring_ix1 + (ix2 - ix1), ring_iy1 + (iy2 - iy1)
    ring_mask[ring_iy1:ring_iy2, ring_ix1:ring_ix2] = False

    ring_ink = float(np.mean(outer_crop[ring_mask] > 0)) if np.any(ring_mask) else 0.0
    return interior_ink, ring_ink


def _associate_label(
    cb_bbox: Tuple[int, int, int, int],
    word_boxes: List[Dict[str, Any]],
    next_cb_x: Optional[int] = None,
    search_right_px: int = 350,
    search_vert_px: int = 20
) -> str:
    """
    Associates text to the right of cb_bbox up to search_right_px or next_cb_x.
    """
    x1, y1, x2, y2 = cb_bbox
    cb_cy = (y1 + y2) / 2.0
    max_right = min(x2 + search_right_px, next_cb_x if next_cb_x is not None else x2 + search_right_px)

    matching_words = []
    for w in word_boxes:
        w_x1, w_y1, w_x2, w_y2 = w["bbox"]
        w_cy = (w_y1 + w_y2) / 2.0
        if abs(w_cy - cb_cy) <= search_vert_px and x2 - 5 <= w_x1 <= max_right:
            matching_words.append((w_x1, w["text"]))

    matching_words.sort(key=lambda x: x[0])
    label_text = " ".join([w[1] for w in matching_words]).strip()
    return label_text


def detect_checkboxes(img: Image.Image) -> List[Checkbox]:
    """
    Detects checkboxes using OpenCV contour analysis and associates labels via Tesseract OCR word boxes.
    Segments into column bands and identifies N/A companion boxes.
    """
    w_img, h_img = img.size
    img_cv = cv2.cvtColor(np.array(img), cv2.COLOR_RGB2BGR)
    gray = cv2.cvtColor(img_cv, cv2.COLOR_BGR2GRAY)
    binary = cv2.adaptiveThreshold(gray, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY_INV, 15, 2)

    contours, _ = cv2.findContours(binary, cv2.RETR_TREE, cv2.CHAIN_APPROX_SIMPLE)

    raw_boxes = []
    for c in contours:
        x, y, w, h = cv2.boundingRect(c)
        aspect = float(w) / float(h) if h > 0 else 0
        if 12 <= w <= 45 and 12 <= h <= 45 and 0.8 <= aspect <= 1.2:
            raw_boxes.append((x, y, x + w, y + h))

    # Deduplicate overlapping boxes within 8px
    dedup_boxes = []
    for box in sorted(raw_boxes, key=lambda b: (b[1], b[0])):
        if not any(abs(box[0] - d[0]) < 8 and abs(box[1] - d[1]) < 8 for d in dedup_boxes):
            dedup_boxes.append(box)

    if not dedup_boxes:
        return []

    # Get word boxes from Tesseract
    word_boxes = []
    try:
        import pytesseract
        data = pytesseract.image_to_data(img, output_type=pytesseract.Output.DICT)
        for i in range(len(data["text"])):
            txt = data["text"][i].strip()
            if txt:
                wx, wy, ww, wh = data["left"][i], data["top"][i], data["width"][i], data["height"][i]
                word_boxes.append({"text": txt, "bbox": (wx, wy, wx + ww, wy + wh)})
    except Exception as e:
        logger.warning(f"pytesseract word box extraction failed: {e}")

    # Segment into columns via x-clustering
    x_coords = np.array([b[0] for b in dedup_boxes])
    hist, bin_edges = np.histogram(x_coords, bins=10)
    peak_bins = np.where(hist > 1)[0]

    col_clusters = []
    for pb in peak_bins:
        x_min, x_max = bin_edges[pb], bin_edges[pb + 1]
        col_boxes = [x for x in x_coords if x_min <= x <= x_max]
        if col_boxes:
            col_clusters.append(int(np.mean(col_boxes)))

    col_clusters = sorted(list(set(col_clusters)))
    if not col_clusters:
        col_clusters = [0]

    checkboxes = []
    for box in dedup_boxes:
        int_ink, ring_ink = _calculate_ink_ratios(img_cv, box)

        # Ink state evaluation with deadband
        if int_ink >= 0.25:
            state = "checked"
        elif int_ink <= 0.10 and ring_ink <= 0.15:
            state = "unchecked"
        else:
            state = "unclear"

        # Assign column index
        col_idx = int(np.argmin([abs(box[0] - c_x) for c_x in col_clusters]))

        # Find next checkbox in same row/col
        next_cb_x = None
        same_row_cbs = [b for b in dedup_boxes if abs(b[1] - box[1]) <= 15 and b[0] > box[0]]
        if same_row_cbs:
            next_cb_x = min(b[0] for b in same_row_cbs)

        label = _associate_label(box, word_boxes, next_cb_x=next_cb_x)
        is_na = bool(re.search(r'\bN/?A\b', label, re.IGNORECASE))

        checkboxes.append(Checkbox(
            bbox=box,
            state=state,
            label=label,
            column_index=col_idx,
            is_na_box=is_na
        ))

    # Detect N/A companion pairs
    for i in range(len(checkboxes)):
        cb1 = checkboxes[i]
        for j in range(i + 1, len(checkboxes)):
            cb2 = checkboxes[j]
            if abs(cb1.bbox[1] - cb2.bbox[1]) <= 12 and 15 <= (cb2.bbox[0] - cb1.bbox[2]) <= 80:
                if cb2.is_na_box or "N/A" in cb2.label.upper():
                    cb2.is_na_box = True
                    cb2.companion_item_text = cb1.label
                    cb1.companion_item_text = cb1.label

    return checkboxes


def render_checked_only(checkboxes: List[Checkbox], template: Optional[Dict[str, Any]] = None) -> str:
    """
    Renders markdown block containing ONLY checked items ([X]) and uncertain items ([?]).
    Groups boxes by column_index and matches labels to template items when provided.
    """
    if not checkboxes:
        return "*[No checkboxes detected]*"

    # Group checkboxes by column
    cols_dict: Dict[int, List[Checkbox]] = {}
    for cb in checkboxes:
        cols_dict.setdefault(cb.column_index, []).append(cb)

    lines = []
    section_titles = ["SIGN IN", "TIME OUT", "SIGN OUT"]

    for col_idx in sorted(cols_dict.keys()):
        col_cbs = sorted(cols_dict[col_idx], key=lambda cb: cb.bbox[1])
        sec_title = section_titles[col_idx] if col_idx < len(section_titles) else f"SECTION {col_idx + 1}"

        sec_lines = []
        uncertain_lines = []

        for cb in col_cbs:
            if cb.state == "unchecked":
                continue

            # Match label to template if available
            display_label = cb.label
            if template and "sections" in template and col_idx < len(template["sections"]):
                sec = template["sections"][col_idx]
                best_match = None
                best_score = 0.0
                for item in sec.items:
                    score = _string_similarity(cb.label.lower(), item.text.lower())
                    if score > best_score:
                        best_score = score
                        best_match = item.text
                if best_match and best_score >= 0.60:
                    display_label = best_match

            na_suffix = " — N/A" if cb.is_na_box else ""

            if cb.state == "checked":
                sec_lines.append(f"[X] {display_label}{na_suffix}")
            elif cb.state == "unclear":
                uncertain_lines.append(f"[?] {display_label}{na_suffix}")

        if sec_lines or uncertain_lines:
            lines.append(f"## {sec_title}")
            for l in sec_lines:
                lines.append(l)
            if uncertain_lines:
                lines.append("\n### Uncertain — verify against original")
                for l in uncertain_lines:
                    lines.append(l)
            lines.append("")

    return "\n".join(lines).strip()


def _string_similarity(s1: str, s2: str) -> float:
    """Computes simple token overlap ratio between two strings."""
    tokens1 = set(re.findall(r'\w+', s1.lower()))
    tokens2 = set(re.findall(r'\w+', s2.lower()))
    if not tokens1 or not tokens2:
        return 0.0
    intersection = tokens1.intersection(tokens2)
    return float(len(intersection)) / float(max(len(tokens1), len(tokens2)))
