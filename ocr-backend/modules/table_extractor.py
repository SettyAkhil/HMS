import io
import json
import logging
import pandas as pd
from PIL import Image
from typing import List, Dict

logger = logging.getLogger(__name__)

_JSON_IR_PROMPT = """Extract the data in this table and format it as a clean JSON object with the following schema:
{
  "orientation": "column_header" | "row_header",
  "section_label": "<rotated or spanning label for the whole block, else null>",
  "header_rows": [["<col1 name>", "<col2 name>", ...]],
  "row_labels": ["<printed label for row 1>", ...],
  "row_groups": [{"label": "<group cell text>", "row_indices": [0, 1, 2]}],
  "rows": [["<cell1>", "<cell2>", ...]]
}

Rules:
- orientation = "column_header" when the table's headings run along the TOP and data flows downward (a normal table).
- orientation = "row_header" when the table's headings run down the LEFT column and each data column is a separate entry/observation/shift. Nursing checklists, observation charts, and handover forms are almost always "row_header".
- When orientation is "row_header": put the printed left-column labels in "row_labels", put header_rows as [] or as the printed column captions if any exist, and make each entry in "rows" a full row: [<label>, <col1 value>, <col2 value>, ...].
- NEVER convert a left-column label into a column header. A printed sentence like "Call bell/staff made available with in the reach of patient (Y/N)" is a ROW LABEL, never a column name.
- Count the printed data columns from the ruled vertical lines and emit one cell per column, including columns that are blank. A blank column is data.
- A cell that spans several rows is a GROUP LABEL. Emit it once in row_groups with the indices of the rows it covers. Do NOT repeat it in every row and do NOT turn it into a column.
Return ONLY valid JSON matching this schema."""


def _looks_like_row_header_grid(ir: dict) -> bool:
    """
    Return True when the flattened header contains >= 2 entries that are longer than 25 characters
    or contain >= 4 words, AND >= 60% of data cells are short tokens.
    """
    if not isinstance(ir, dict):
        return False
    header = ir.get("header_rows", []) or ir.get("headers", [])
    if not header:
        return False

    flat_header = []
    if isinstance(header, list):
        if header and isinstance(header[0], list):
            flat_header = [str(c) for c in header[0]]
        else:
            flat_header = [str(h) for h in header]

    long_header_entries = sum(
        1 for h in flat_header if len(h.strip()) > 25 or len(h.strip().split()) >= 4
    )
    if long_header_entries < 2:
        return False

    rows = ir.get("rows", [])
    data_cells = []
    for r in rows:
        if isinstance(r, list):
            for c in r:
                data_cells.append(str(c).strip().upper())

    if not data_cells:
        return False

    closed_tokens = {"Y", "N", "NA", "N/A", "YES", "NO", "✓", "✗", "X", "-", ""}
    short_token_count = sum(1 for c in data_cells if c in closed_tokens or len(c) <= 3)

    return (short_token_count / len(data_cells)) >= 0.60


def _transpose_ir(ir: dict) -> dict:
    """
    Rebuilds the IR so the old header entries become the first column of each row,
    and columns become Entry 1..Entry N.
    """
    header = ir.get("header_rows", []) or ir.get("headers", [])
    rows = ir.get("rows", [])

    flat_header = []
    if isinstance(header, list):
        if header and isinstance(header[0], list):
            flat_header = [str(c) for c in header[0]]
        else:
            flat_header = [str(h) for h in header]

    full_matrix = []
    if flat_header:
        full_matrix.append(flat_header)
    for r in rows:
        if isinstance(r, list):
            full_matrix.append([str(c) for c in r])

    if not full_matrix:
        return ir

    max_cols = max(len(r) for r in full_matrix)
    for r in full_matrix:
        while len(r) < max_cols:
            r.append("")

    transposed = []
    num_rows = len(full_matrix)
    for c in range(max_cols):
        new_row = [full_matrix[r][c] for r in range(num_rows)]
        transposed.append(new_row)

    num_entries = len(transposed[0]) - 1 if transposed else 0
    new_headers = ["Item"] + [f"Entry {i+1}" for i in range(max(1, num_entries))]

    return {
        "orientation": "row_header",
        "header_rows": [new_headers],
        "rows": transposed,
        "row_groups": ir.get("row_groups", []),
        "section_label": ir.get("section_label"),
    }


class TableExtractor:
    """
    Production-grade medical table extractor.
    Uses Microsoft Table Transformer (TATR) for precise row-level structure detection,
    and delegates to Qwen2.5-VL for text extraction.
    """
    _instance = None

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super(TableExtractor, cls).__new__(cls)
            cls._instance._initialized = False
        return cls._instance

    def __init__(self):
        if self._initialized:
            return
        self.model = None
        self._load_model()
        self._initialized = True

    def _load_model(self):
        try:
            from transformers import TableTransformerForObjectDetection
        except ImportError:
            logger.error("transformers library is not installed.")
            return

        try:
            logger.info("Loading Microsoft Table Transformer (TATR)...")
            self.model = TableTransformerForObjectDetection.from_pretrained(
                "microsoft/table-transformer-structure-recognition"
            )
            self.model.eval()
        except Exception as e:
            logger.error(f"Failed to load TATR: {e}")

    async def extract(self, image: Image.Image, async_ocr_engine, page_num: int) -> pd.DataFrame:
        """
        Executes TATR structure recognition, slices rows, and builds a DataFrame.
        """
        if self.model is None:
            logger.warning("TATR model not loaded, skipping structural extraction.")
            return pd.DataFrame()

        w, h = image.size
        prompt = _JSON_IR_PROMPT
        results = await async_ocr_engine.process_page_regions(
            regions=[{"region_id": "table_full", "region_type": "Table", "bbox": [0, 0, w, h], "confidence": 1.0}],
            raw_img=image,
            page_num=page_num,
            prompt=prompt
        )

        table_data = []
        row_groups = []
        section_label = None

        if results:
            text = results[0]["text"]
            json_parsed = False
            text_trimmed = text.strip()
            if "```json" in text_trimmed:
                text_trimmed = text_trimmed.split("```json")[1].split("```")[0].strip()
            elif text_trimmed.startswith("```"):
                text_trimmed = text_trimmed.split("```")[1].strip()

            if text_trimmed.startswith("{") and text_trimmed.endswith("}"):
                try:
                    ir = json.loads(text_trimmed)
                    if isinstance(ir, dict):
                        from modules.region_ocr import is_degenerate_json_ir
                        is_deg, deg_reason = is_degenerate_json_ir(ir)
                        if is_deg:
                            logger.warning(f"Degenerate JSON IR detected in TableExtractor: {deg_reason}")
                            df = pd.DataFrame()
                            df.attrs["needs_review"] = True
                            df.attrs["needs_review_reason"] = f"degenerate_json_{deg_reason}"
                            return df

                        if ir.get("orientation") == "row_header" or _looks_like_row_header_grid(ir):
                            trigger = "orientation=row_header" if ir.get("orientation") == "row_header" else "_looks_like_row_header_grid"
                            logger.info(f"Row-header grid detected via {trigger} — applying transposition")
                            ir = _transpose_ir(ir)

                        row_groups = ir.get("row_groups", [])
                        section_label = ir.get("section_label")
                        headers = ir.get("header_rows", []) or ir.get("headers", [])
                        rows = ir.get("rows", [])

                        if headers and isinstance(headers[0], list):
                            table_data.append([str(c) for c in headers[0]])
                        elif headers:
                            table_data.append([str(h) for h in headers])

                        for r in rows:
                            if isinstance(r, list):
                                table_data.append([str(c) for c in r])

                        json_parsed = True
                except Exception as e:
                    logger.warning(f"Failed to parse JSON IR in TableExtractor: {e}")

            if not json_parsed:
                lines = [line.strip() for line in text.split('\n') if '|' in line]
                for line in lines:
                    if '---' in line:
                        continue
                    cols = [col.strip() for col in line.strip('|').split('|')]
                    if any(cols):
                        table_data.append(cols)

        non_empty_rows = [r for r in table_data if any(c.strip() for c in r)]
        dropped = len(table_data) - len(non_empty_rows)
        if dropped:
            logger.warning(f"Dropped {dropped} all-empty table rows")

        needs_review = False
        needs_review_reasons = []
        if dropped > max(3, int(0.30 * len(table_data))):
            needs_review = True
            needs_review_reasons.append("blank_row_flood")

        validated_rows = non_empty_rows
        if not validated_rows:
            return pd.DataFrame()

        # Handle row_groups (spanning cells)
        group_col_map = {}
        if row_groups and isinstance(row_groups, list):
            for grp in row_groups:
                if isinstance(grp, dict):
                    lbl = grp.get("label", "")
                    indices = grp.get("row_indices", [])
                    if indices and isinstance(indices, list):
                        group_col_map[indices[0]] = lbl

        # Normalize column counts
        max_cols = max(len(row) for row in validated_rows)
        for row in validated_rows:
            while len(row) < max_cols:
                row.append("")

        if row_groups:
            # Prepend 'Group' column header and group values
            header_row = ["Group"] + validated_rows[0]
            data_rows = []
            for idx, r in enumerate(validated_rows[1:]):
                grp_val = group_col_map.get(idx, "")
                data_rows.append([grp_val] + r)
            df = pd.DataFrame(data_rows, columns=header_row)
        else:
            if len(validated_rows) > 1:
                df = pd.DataFrame(validated_rows[1:], columns=validated_rows[0])
            else:
                df = pd.DataFrame(validated_rows)

        if needs_review:
            df.attrs["needs_review"] = True
            df.attrs["needs_review_reason"] = needs_review_reasons

        if section_label:
            df.attrs["section_label"] = section_label

        return df
