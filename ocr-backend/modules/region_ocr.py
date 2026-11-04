import asyncio
import base64
import time
import logging
from typing import List, Dict
import numpy as np
from PIL import Image
from openai import AsyncOpenAI

from core.config import settings, served_model

logger = logging.getLogger(__name__)

MODEL_OPTIONS = {
    "temperature":  0,
    "num_ctx":      8192,
    "num_predict":  4096,
}

# Below this confidence, fall back to a second, genuinely different OCR engine
# (TrOCR) on the same crop and keep whichever result scores higher — the
# hybrid-engine behavior described in the original spec ("compare confidence,
# choose highest confidence"), scoped to what's practical on one shared GPU
# (see modules/handwriting_ocr.py).
TROCR_FALLBACK_THRESHOLD = 0.75

class AsyncRegionOCR:
    """
    Handles asynchronous, region-based OCR execution using AsyncOpenAI.
    Utilizes a semaphore to control concurrent VLLM requests and prevent OOM errors.
    """
    
    def __init__(self, max_concurrent: int = 3, model_name: str = "qwen2.5-vl-7b"):
        self.semaphore = asyncio.Semaphore(max_concurrent)
        self.model_name = served_model(model_name)
        # Deliberately NOT a module-level singleton: this class is instantiated
        # fresh inside every asyncio.run() call in modules/precision_ocr.py's
        # process_single_page (once per page). A module-level AsyncOpenAI
        # client would bind its connection pool to whichever event loop was
        # running the FIRST time it was used, then fail with connection
        # errors on every call after that event loop closes — a real,
        # reproducible bug (Celery workers are long-lived and process many
        # pages/jobs over their lifetime, each in its own asyncio.run() event
        # loop). Bounded timeout (SDK default is 600s) — a hung/overloaded
        # vLLM server should fail one region fast and let the existing
        # 6-strategy retry loop / Celery's own retry policy handle it, not
        # silently block a worker for up to 10 minutes per region.
        self.client = AsyncOpenAI(base_url=settings.VLLM_BASE_URL, api_key="EMPTY", timeout=90.0)

    async def _call_model_with_retry_async(self, raw_img: Image.Image, prompt: str) -> tuple[str, str, list, float]:
        """
        Async version of call_model_with_retry.
        Tries each preprocessing strategy in order.

        Returns (result, strategy_name, predictions, ocr_confidence). ocr_confidence
        is the mean per-token log-prob of the model's response, exponentiated to a
        [0, 1] probability — a genuine model-confidence signal (via the vLLM
        OpenAI-compatible endpoint's logprobs support), not a text heuristic. Used
        by _process_region to decide whether to try the TrOCR fallback.
        """
        # Local import to prevent circular dependency with precision_ocr.py
        from modules.precision_ocr import STRATEGIES, img_to_bytes, clean_output
        from modules.unified_resolver import resolve_entities_in_text

        for strategy_name, strategy_fn in STRATEGIES:
            try:
                # High resolution image processing for accurate OCR
                max_dim = 3000
                w, h = raw_img.size
                if max(w, h) > max_dim:
                    scale = max_dim / max(w, h)
                    raw_img = raw_img.resize((int(w * scale), int(h * scale)), Image.BILINEAR)

                processed = strategy_fn(raw_img)
                image_bytes = img_to_bytes(processed)

                confidence = 0.0
                try:
                    base64_img = base64.b64encode(image_bytes).decode('utf-8')
                    resp = await self.client.chat.completions.create(
                        model=self.model_name,
                        messages=[{
                            "role": "user",
                            "content": [
                                {"type": "text", "text": prompt},
                                {"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{base64_img}"}}
                            ]
                        }],
                        temperature=MODEL_OPTIONS.get("temperature", 0),
                        max_tokens=MODEL_OPTIONS.get("num_predict", 2048),
                        logprobs=True,
                        top_logprobs=1,
                    )
                    raw_text = resp.choices[0].message.content
                    logprobs_content = resp.choices[0].logprobs.content if resp.choices[0].logprobs else None
                    if logprobs_content:
                        mean_logprob = float(np.mean([t.logprob for t in logprobs_content]))
                        confidence = float(np.exp(mean_logprob))
                except Exception as e:
                    logger.warning(f"vLLM unavailable or request failed: {e}")
                    raw_text = ""

                # Proceed with cleaning even if raw_text is empty
                result = clean_output(raw_text)
                predictions = []

                try:
                    result, predictions = resolve_entities_in_text(result)
                except Exception:
                    pass

                if result and len(result.strip()) >= 5:
                    return result, strategy_name, predictions, confidence

            except Exception as e:
                logger.warning(f"Async Strategy '{strategy_name}' failed: {e}")
                continue

        return "", "", [], 0.0

    async def _process_region(self, region: Dict, raw_img: Image.Image, page_num: int, prompt: str) -> Dict:
        """
        Processes a single layout region asynchronously, wrapped in a semaphore.
        Falls back to TrOCR (a genuinely different engine, not another retry of
        the same model) when the primary vLLM result's own confidence is low.
        """
        async with self.semaphore:
            box = region['bbox']
            # Add a 5px padding around crop to ensure edges aren't cut
            pad = 5
            w, h = raw_img.size
            crop_box = (max(0, box[0]-pad), max(0, box[1]-pad), min(w, box[2]+pad), min(h, box[3]+pad))
            cropped_img = raw_img.crop(crop_box)

            extracted_text, strategy_used, predictions, ocr_confidence = await self._call_model_with_retry_async(
                cropped_img, prompt
            )
            ocr_model_used = self.model_name

            if not extracted_text or ocr_confidence < TROCR_FALLBACK_THRESHOLD:
                # TrOCR is strictly trained on single lines of text (IAM dataset).
                # Passing a full page or massive paragraph to TrOCR causes it to hallucinate
                # a single word with artificially high confidence, overwriting the VLM's result.
                is_small_region = (cropped_img.width * cropped_img.height) < (w * h * 0.3)
                if is_small_region:
                    try:
                        from modules.handwriting_ocr import TrOCREngine
                        trocr_text, trocr_confidence = await asyncio.to_thread(
                            TrOCREngine().recognize, cropped_img
                        )
                        if trocr_text and trocr_confidence > ocr_confidence:
                            extracted_text = trocr_text
                            ocr_confidence = trocr_confidence
                            ocr_model_used = "trocr-base-handwritten"
                            strategy_used = "trocr-fallback"
                    except Exception as e:
                        logger.warning(f"TrOCR fallback failed for region {region['region_id']}: {e}")

            return {
                "page": page_num,
                "region_id": region["region_id"],
                "region_type": region["region_type"],
                "text": extracted_text,
                "bbox": box,
                "predictions": predictions,
                "strategy_used": strategy_used,
                "layout_confidence": region.get("confidence", 1.0),
                "ocr_confidence": ocr_confidence,
                "ocr_model_used": ocr_model_used,
            }

    async def process_page_regions(self, regions: List[Dict], raw_img: Image.Image, page_num: int, prompt: str) -> List[Dict]:
        """
        Processes all regions on a page concurrently up to the semaphore limit.
        Returns a list of structured region results in the exact order they were provided.
        """
        tasks = []
        for region in regions:
            # Create a task for each region
            task = asyncio.create_task(self._process_region(region, raw_img, page_num, prompt))
            tasks.append(task)
            
        # Gather all tasks concurrently
        results = await asyncio.gather(*tasks)
        return list(results)


import json

def is_degenerate_json_ir(ir: dict, is_template_fill: bool = False) -> tuple[bool, str]:
    """
    Return (True, reason) when any of these hold on ir["rows"]:
      - >= 5 consecutive identical row arrays
      - >= 40% of all rows are all-empty
      - a single non-empty cell value accounts for >= 40% of non-empty cells (skipped if is_template_fill=True)
      - len(rows) > 60 and >= 80% of cells are empty
    Return (False, "") otherwise.
    """
    if not isinstance(ir, dict):
        return False, ""
    rows = ir.get("rows", [])
    if not rows or not isinstance(rows, list):
        return False, ""

    total_rows = len(rows)

    # 1. >= 5 consecutive identical row arrays
    consecutive_count = 1
    for k in range(1, total_rows):
        if rows[k] == rows[k - 1]:
            consecutive_count += 1
            if consecutive_count >= 5:
                return True, "consecutive_identical_rows"
        else:
            consecutive_count = 1

    # 2. >= 40% of all rows are all-empty
    empty_rows_count = sum(1 for r in rows if isinstance(r, list) and not any(str(c).strip() for c in r))
    if total_rows > 0 and (empty_rows_count / total_rows) >= 0.40:
        return True, "empty_rows_flood"

    # Gather all non-empty cells
    all_cells = []
    total_cells = 0
    empty_cells = 0
    for r in rows:
        if isinstance(r, list):
            for c in r:
                total_cells += 1
                s = str(c).strip()
                if s:
                    all_cells.append(s)
                else:
                    empty_cells += 1

    # 3. a single non-empty cell value accounts for >= 40% of non-empty cells
    if not is_template_fill and all_cells:
        counts = {}
        for c in all_cells:
            counts[c] = counts.get(c, 0) + 1
        max_freq = max(counts.values())
        if (max_freq / len(all_cells)) >= 0.40:
            return True, "single_cell_value_dominance"

    # 4. len(rows) > 60 and >= 80% of cells are empty
    if total_rows > 60 and total_cells > 0:
        if (empty_cells / total_cells) >= 0.80:
            return True, "empty_cell_dominance"

    return False, ""


def _is_degenerate(text: str, is_template_fill: bool = False) -> tuple[bool, str]:
    """
    Checks if text (JSON IR or Markdown) is degenerate.
    """
    if not text:
        return False, ""
    text_trimmed = text.strip()
    if text_trimmed.startswith("{") and text_trimmed.endswith("}"):
        try:
            ir = json.loads(text_trimmed)
            if isinstance(ir, dict) and "rows" in ir:
                return is_degenerate_json_ir(ir, is_template_fill=is_template_fill)
        except Exception:
            pass

    lines = [l for l in text.split("\n") if "|" in l and not _is_table_separator(l)]
    if not is_template_fill and len(lines) >= 20:
        allowed_vals = {"NO", "YES", "-", "N/A", "", "N/A.", "Y", "N", "NA", "NIL", "✓", "✗", "X"}
        boring_rows = 0
        for l in lines:
            cells = [c.strip().upper() for c in l.strip("|").split("|")]
            if all(c in allowed_vals for c in cells):
                boring_rows += 1
        if boring_rows >= 20:
            return True, "boring_rows_flood"

    if len(lines) >= 5:
        pipe_counts = [l.count("|") for l in lines]
        if max(pipe_counts) == min(pipe_counts) and pipe_counts[0] > 1:
            unique_lines = set(lines)
            if len(unique_lines) <= 2:
                return True, "markdown_repetitive"
    return False, ""



def _is_table_separator(line: str) -> bool:
    return bool(re.fullmatch(r'[\s|:\-]+', line)) and '-' in line


async def retry_ambiguous_table_cells(
    async_ocr, raw_img: Image.Image, text: str
) -> tuple[str, bool]:
    """
    Identifies suspect Y/N entry cells in a table, issues ONE follow-up call to re-verify,
    and returns (updated_text, needs_review).
    """
    lines = text.split("\n")
    table_lines = [l.strip() for l in lines if l.strip().startswith("|")]
    if not table_lines:
        return text, False

    closed_set = {"Y", "N", "NA", "N/A", "[?]", ""}
    suspect_cells = []
    total_entry_cells = 0

    parsed_rows = []
    for line in table_lines:
        if _is_table_separator(line):
            continue
        cells = [c.strip() for c in line.strip("|").split("|")]
        parsed_rows.append(cells)

    if len(parsed_rows) <= 1:
        return text, False

    data_rows = parsed_rows[1:]

    for r_idx, row in enumerate(data_rows):
        row_label = row[0] if row else f"Row {r_idx+1}"
        for c_idx, cell in enumerate(row[1:], start=1):
            total_entry_cells += 1
            cell_val = cell.upper()
            if len(cell_val) <= 3 and cell_val not in closed_set:
                suspect_cells.append((row_label, c_idx, cell))

    if not suspect_cells:
        return text, False

    needs_review = (len(suspect_cells) / max(1, total_entry_cells)) > 0.20

    suspect_list_str = "\n".join([f"- {lbl} | Column {c_idx}: '{val}'" for lbl, c_idx, val in suspect_cells])
    prompt = (
        "Re-verify the following table cells. For each listed cell, answer Y, N, NA, or UNCERTAIN.\n"
        f"Answer only with '<row label> | <column number>: <verdict>'.\n\n{suspect_list_str}"
    )

    try:
        verdict_text, _, _, _ = await async_ocr._call_model_with_retry_async(raw_img, prompt)
        if verdict_text:
            verdict_map = {}
            for v_line in verdict_text.splitlines():
                if ":" in v_line:
                    key_part, ans_part = v_line.split(":", 1)
                    ans = ans_part.strip().upper()
                    if ans in {"Y", "N", "NA", "N/A"}:
                        verdict_map[key_part.strip().lower()] = ans
                    elif "UNCERTAIN" in ans:
                        verdict_map[key_part.strip().lower()] = "[?]"

            new_lines = []
            for line in lines:
                if line.strip().startswith("|") and not _is_table_separator(line.strip()):
                    cells = [c.strip() for c in line.strip("|").split("|")]
                    if cells:
                        row_lbl = cells[0].lower()
                        for c_idx in range(1, len(cells)):
                            key = f"{row_lbl} | column {c_idx}"
                            if key in verdict_map:
                                cells[c_idx] = verdict_map[key]
                        line = "| " + " | ".join(cells) + " |"
                new_lines.append(line)
            return "\n".join(new_lines), needs_review
    except Exception as e:
        logger.warning(f"Ambiguous table cell retry failed: {e}")

    return text, needs_review


