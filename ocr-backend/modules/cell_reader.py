import re
import numpy as np
import logging
from PIL import Image, ImageDraw, ImageFont
from typing import List, Tuple, Dict, Any, Optional

logger = logging.getLogger(__name__)

def descender_score(cell_crop: Image.Image) -> float:
    """
    Computes ink descender score for a single cell crop.
    Returns ratio of ink pixels below baseline to total ink pixels.
    Handwritten Y has a descender below baseline (score >= 0.15); N does not (score <= 0.05).
    """
    try:
        arr = np.array(cell_crop).astype(np.float32)
        if arr.ndim < 3 or arr.shape[2] < 3:
            return 0.0

        r, g, b = arr[:, :, 0], arr[:, :, 1], arr[:, :, 2]
        luma = 0.299 * r + 0.587 * g + 0.114 * b
        p90 = np.percentile(luma, 90)
        ink_mask = (luma < (p90 - 60.0)).astype(np.uint8)

        row_ink = np.sum(ink_mask, axis=1)
        max_row_ink = np.max(row_ink)

        if max_row_ink == 0:
            return 0.0

        # Baseline = y-position of last row where ink coverage exceeds 20% of max row coverage
        threshold = max_row_ink * 0.20
        significant_rows = np.where(row_ink >= threshold)[0]
        if len(significant_rows) == 0:
            return 0.0

        baseline = significant_rows[-1]
        total_ink = np.sum(ink_mask)
        if total_ink == 0:
            return 0.0

        below_baseline_ink = np.sum(ink_mask[baseline:, :])
        return float(below_baseline_ink / total_ink)
    except Exception as e:
        logger.warning(f"descender_score calculation failed: {e}")
        return 0.0


def compose_row_strip(img: Image.Image, row_bbox: Tuple[int, int, int, int], col_bboxes: List[Tuple[int, int]], inked_indices: List[int]) -> Image.Image:
    """
    Crops inked cells for a row, upscales 4x LANCZOS, and composes into ONE horizontal strip
    with thin separator lines and printed index number above each cell.
    """
    r_x1, r_y1, r_x2, r_y2 = row_bbox
    crops = []
    
    cell_h = max(20, r_y2 - r_y1)
    header_h = 30
    target_h = header_h + cell_h * 4

    for idx in inked_indices:
        c_x1, c_x2 = col_bboxes[idx]
        cell_crop = img.crop((c_x1, r_y1, c_x2, r_y2))
        # 4x upscale LANCZOS
        cell_upscaled = cell_crop.resize((cell_crop.width * 4, cell_crop.height * 4), Image.Resampling.LANCZOS)
        
        # Create single cell container with header space
        container = Image.new("RGB", (cell_upscaled.width, target_h), color="white")
        draw = ImageDraw.Draw(container)
        
        # Draw header box with index number (1-based)
        draw.rectangle([(0, 0), (cell_upscaled.width - 1, header_h - 1)], fill="#f0f0f0", outline="#cccccc")
        draw.text((cell_upscaled.width // 2 - 5, 5), str(idx + 1), fill="black")
        
        # Paste cell crop below header
        container.paste(cell_upscaled, (0, header_h))
        crops.append(container)

    if not crops:
        return Image.new("RGB", (100, 50), color="white")

    total_w = sum(c.width for c in crops) + (len(crops) - 1) * 4
    strip = Image.new("RGB", (total_w, target_h), color="white")
    draw_strip = ImageDraw.Draw(strip)

    cur_x = 0
    for c in crops:
        strip.paste(c, (cur_x, 0))
        cur_x += c.width
        if cur_x < total_w:
            draw_strip.line([(cur_x, 0), (cur_x, target_h)], fill="#000000", width=2)
            cur_x += 4

    return strip


async def read_row_values_async(
    img: Image.Image,
    row_bbox: Tuple[int, int, int, int],
    col_bboxes: List[Tuple[int, int]],
    ink_map_row: List[bool],
    value_type: str,
    async_ocr: Any
) -> Tuple[List[str], int, int]:
    """
    Reads row values using row-strip cropping and VLM prediction + descender heuristic validation.
    Returns (row_values, disagreement_count, inked_cell_count).
    """
    n_cols = len(col_bboxes)
    inked_indices = [i for i, has_ink in enumerate(ink_map_row) if has_ink]

    if not inked_indices:
        return [""] * n_cols, 0, 0

    strip_img = compose_row_strip(img, row_bbox, col_bboxes, inked_indices)

    # R7 prompt: NO domain words (nurse handover, ISBAR) and NO row labels
    prompt = f"""This strip contains {len(inked_indices)} handwritten cells from one row of a checklist, numbered left to right.
For each numbered cell, answer with exactly one of: Y, N, NA, or UNCERTAIN.
Answer nothing else — no labels, no explanation, no table.
Format: '<number>: <value>' one per line.
If a mark is ambiguous between Y and N, answer UNCERTAIN. Y and N are clinically opposite; a wrong guess is worse than UNCERTAIN."""

    raw_resp, _, _, _ = await async_ocr._call_model_with_retry_async(strip_img, prompt)

    # Parse response map
    parsed_vals = {}
    for line in raw_resp.splitlines():
        m = re.match(r'^\s*(\d+)\s*:\s*([A-Za-z?\[\]]+)', line)
        if m:
            c_idx = int(m.group(1)) - 1  # 0-indexed column
            val = m.group(2).strip().upper()
            parsed_vals[c_idx] = val

    result_vals = [""] * n_cols
    disagreement_count = 0

    r_x1, r_y1, r_x2, r_y2 = row_bbox

    for idx in inked_indices:
        vlm_ans = parsed_vals.get(idx, "UNCERTAIN")
        if vlm_ans in {"Y", "YES"}:
            model_val = "Y"
        elif vlm_ans in {"N", "NO"}:
            model_val = "N"
        elif vlm_ans in {"NA", "N/A"}:
            model_val = "NA"
        else:
            model_val = "[?]"

        # Compute descender score for cell crop
        c_x1, c_x2 = col_bboxes[idx]
        cell_crop = img.crop((c_x1, r_y1, c_x2, r_y2))
        d_score = descender_score(cell_crop)

        # R6 Disagreement check
        final_val = model_val
        if model_val == "Y" and d_score <= 0.05:
            logger.info(f"Disagreement detected at col {idx+1}: model said Y, descender score {d_score:.3f} <= 0.05")
            final_val = "[?]"
            disagreement_count += 1
        elif model_val == "N" and d_score >= 0.15:
            logger.info(f"Disagreement detected at col {idx+1}: model said N, descender score {d_score:.3f} >= 0.15")
            final_val = "[?]"
            disagreement_count += 1

        result_vals[idx] = final_val

    return result_vals, disagreement_count, len(inked_indices)
