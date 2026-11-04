import os
import re
import pytest

FIXTURES_DIR = os.path.join(os.path.dirname(__file__), "fixtures")
BAD_OUTPUT_PATH = os.path.join(FIXTURES_DIR, "isbar_handover_bad_output.md")

def parse_markdown_tables(md_text: str) -> list[list[list[str]]]:
    """
    Parses markdown text into a list of tables.
    Each table is represented as a list of rows, where each row is a list of cell strings.
    """
    tables = []
    current_table = []
    
    for line in md_text.splitlines():
        striped = line.strip()
        if striped.startswith("|") and striped.endswith("|"):
            cells = [c.strip() for c in striped.strip("|").split("|")]
            # Ignore markdown header separators like |---|---|
            if cells and any("-" in c for c in cells) and all(re.match(r"^:?-+:?$", c) for c in cells if c):
                continue
            current_table.append(cells)
        else:
            if current_table:
                tables.append(current_table)
                current_table = []
    if current_table:
        tables.append(current_table)
        
    return tables


class TestISBARGridRegression:
    @staticmethod
    def load_bad_output() -> str:
        with open(BAD_OUTPUT_PATH, "r", encoding="utf-8") as f:
            return f.read()

    def test_no_blank_row_runs(self, md_text: str = None):
        """Assert no more than 2 consecutive table rows where every cell is empty."""
        if md_text is None:
            md_text = self.load_bad_output()
            
        tables = parse_markdown_tables(md_text)
        max_consecutive_blank_rows = 0
        
        for table in tables:
            consecutive_blank = 0
            # Check data rows (excluding header)
            for row in table[1:]:
                if not any(cell.strip() for cell in row):
                    consecutive_blank += 1
                    if consecutive_blank > max_consecutive_blank_rows:
                        max_consecutive_blank_rows = consecutive_blank
                else:
                    consecutive_blank = 0
                    
        assert max_consecutive_blank_rows <= 2, f"Found {max_consecutive_blank_rows} consecutive blank table rows (max allowed: 2)"

    def test_single_grid_not_fragmented(self, md_text: str = None):
        """Assert the page produces at most 2 markdown tables, not 7."""
        if md_text is None:
            md_text = self.load_bad_output()
            
        tables = parse_markdown_tables(md_text)
        table_count = len(tables)
        assert table_count <= 2, f"Found {table_count} tables on the page (max allowed: 2)"

    def test_labels_are_rows_not_headers(self, md_text: str = None):
        """Assert the string 'Patient ID Tag on within' appears in the FIRST column of a data row, never inside a header row."""
        if md_text is None:
            md_text = self.load_bad_output()
            
        tables = parse_markdown_tables(md_text)
        target = "Patient ID Tag on within"
        
        found_in_data_first_col = False
        found_in_header = False
        
        for table in tables:
            if not table:
                continue
            header_row = table[0]
            if any(target in cell for cell in header_row):
                found_in_header = True
                
            for data_row in table[1:]:
                if data_row and target in data_row[0]:
                    found_in_data_first_col = True
                    
        assert not found_in_header, f"Target label '{target}' was found in a header row"
        assert found_in_data_first_col, f"Target label '{target}' was not found in the first column of any data row"

    def test_fixed_isbar_output_passes_all_checks(self):
        """Verifies that a fixed single ISBAR table passes all 3 regression assertions."""
        fixed_md = """# Nursing Handover / ISBAR Checklist

| Item | Entry 1 | Entry 2 | Entry 3 |
|---|---|---|---|
| Patient ID Tag on within | Y | Y | N |
| Call bell/staff made available with in the reach of patient | Y | Y | Y |
| IV Site checked / Intact / Date of insertion | Y | NA | Y |
| Handing over Nurse Sign & ID No. | Sarah | Nurse B | Nurse C |
"""
        self.test_no_blank_row_runs(fixed_md)
        self.test_single_grid_not_fragmented(fixed_md)
        self.test_labels_are_rows_not_headers(fixed_md)


EXPECTED_STRUCTURE_PATH = os.path.join(FIXTURES_DIR, "isbar_expected_structure.md")

class TestISBARStructureContract:
    @staticmethod
    def load_expected_scaffold() -> str:
        with open(EXPECTED_STRUCTURE_PATH, "r", encoding="utf-8") as f:
            return f.read()

    @staticmethod
    def extract_check_item_labels(md_text: str) -> list[str]:
        tables = parse_markdown_tables(md_text)
        if not tables:
            return []
        table = tables[0]
        if not table or len(table) < 2:
            return []
        
        # Check Item column is usually index 2 if Section|Group|Check Item, or index 0 if label-left
        header = [h.lower() for h in table[0]]
        check_item_col_idx = 2 if len(header) > 2 and "check item" in header[2] else 0

        labels = []
        for row in table[1:]:
            if len(row) > check_item_col_idx:
                labels.append(row[check_item_col_idx].strip())
        return labels

    def test_single_table(self, md_text: str = None):
        if md_text is None:
            md_text = TestISBARGridRegression.load_bad_output()
        tables = parse_markdown_tables(md_text)
        assert len(tables) == 1, f"Expected exactly 1 table, found {len(tables)}"

    def test_row_count(self, md_text: str = None):
        if md_text is None:
            md_text = TestISBARGridRegression.load_bad_output()
        tables = parse_markdown_tables(md_text)
        assert len(tables) == 1
        data_rows = tables[0][1:]  # excluding header
        assert len(data_rows) == 26, f"Expected exactly 26 data rows, found {len(data_rows)}"

    def test_row_labels_match_scaffold(self, md_text: str = None):
        if md_text is None:
            md_text = TestISBARGridRegression.load_bad_output()
        expected_labels = self.extract_check_item_labels(self.load_expected_scaffold())
        actual_labels = self.extract_check_item_labels(md_text)
        
        def norm(s: str) -> str:
            return re.sub(r"\s+", " ", s.strip().lower())

        norm_expected = [norm(l) for l in expected_labels]
        norm_actual = [norm(l) for l in actual_labels]

        assert norm_actual == norm_expected, f"Row labels mismatch.\nExpected: {norm_expected}\nActual: {norm_actual}"

    def test_no_label_in_header(self, md_text: str = None):
        if md_text is None:
            md_text = TestISBARGridRegression.load_bad_output()
        tables = parse_markdown_tables(md_text)
        assert tables
        header = [c.lower() for c in tables[0][0]]
        expected_labels = self.extract_check_item_labels(self.load_expected_scaffold())
        
        for exp in expected_labels:
            exp_lower = exp.lower()
            assert not any(exp_lower in h for h in header), f"Check-item label '{exp}' found in header row: {header}"

    def test_group_not_repeated(self, md_text: str = None):
        if md_text is None:
            md_text = TestISBARGridRegression.load_bad_output()
        target = "IV Management (If Applicable)"
        occurrences = md_text.count(target)
        assert occurrences == 1, f"Expected group label '{target}' to appear exactly once, found {occurrences}"

    def test_no_epilogue(self, md_text: str = None):
        if md_text is None:
            md_text = TestISBARGridRegression.load_bad_output()
        pattern = re.compile(r'(?i)(this|the above)\b[^\n]{0,200}\b(transcription|fidelity|as instructed)')
        assert not pattern.search(md_text), "Epilogue commentary leak detected in markdown text"

    def test_completion_time_single_value(self, md_text: str = None):
        if md_text is None:
            md_text = TestISBARGridRegression.load_bad_output()
        tables = parse_markdown_tables(md_text)
        assert len(tables) == 1
        table = tables[0]
        time_row = None
        for row in table[1:]:
            if row and any("completion time" in c.lower() for c in row[:3]):
                time_row = row
                break
        assert time_row is not None, "'Completion Time' row not found"
        for cell in time_row[3:]:
            time_matches = re.findall(r'\d{1,2}:\d{2}', cell)
            assert len(time_matches) <= 1, f"Completion time cell contains multiple time tokens: '{cell}'"


    def test_rendered_template_passes_structure_contract(self):
        """Verifies that a rendered ISBAR template output passes all 7 structure contract assertions."""
        from modules.form_templates import ISBAR_HANDOVER_F22B, render_markdown
        cells_mock = {str(i): ["Y"] * 10 for i in range(1, 27)}
        cells_mock["21"] = ["08:30 am"] * 10  # Completion Time
        cells_mock["22"] = ["Nurse A"] * 10    # Signature
        rendered_text, _ = render_markdown(ISBAR_HANDOVER_F22B, cells_mock, 10)

        self.test_single_table(rendered_text)
        self.test_row_count(rendered_text)
        self.test_row_labels_match_scaffold(rendered_text)
        self.test_no_label_in_header(rendered_text)
        self.test_group_not_repeated(rendered_text)
        self.test_no_epilogue(rendered_text)
        self.test_completion_time_single_value(rendered_text)


LABELS_FIXTURE_PATH = os.path.join(FIXTURES_DIR, "isbar_f22b_labels.txt")

class ISBARFabricationContract:
    @staticmethod
    def load_fixture_labels() -> list[str]:
        if os.path.exists(LABELS_FIXTURE_PATH):
            with open(LABELS_FIXTURE_PATH, "r", encoding="utf-8") as f:
                return [line.strip() for line in f if line.strip()]
        return []

    def test_no_invented_labels(self, md_text: str = None):
        if md_text is None:
            md_text = TestISBARGridRegression.load_bad_output()
        fixture_labels = self.load_fixture_labels()
        actual_labels = TestISBARStructureContract.extract_check_item_labels(md_text)
        
        invented = [l for l in actual_labels if l not in fixture_labels]
        assert not invented, f"Invented check-item labels found in output: {invented}"

    def test_no_missing_labels(self, md_text: str = None):
        if md_text is None:
            md_text = TestISBARGridRegression.load_bad_output()
        fixture_labels = self.load_fixture_labels()
        actual_labels = TestISBARStructureContract.extract_check_item_labels(md_text)
        
        missing = [l for l in fixture_labels if l not in actual_labels]
        assert not missing, f"Required fixture labels missing from output: {missing}"

    def test_label_order(self, md_text: str = None):
        if md_text is None:
            md_text = TestISBARGridRegression.load_bad_output()
        fixture_labels = self.load_fixture_labels()
        actual_labels = TestISBARStructureContract.extract_check_item_labels(md_text)
        assert actual_labels == fixture_labels, f"Output label order does not match fixture order.\nActual: {actual_labels}\nExpected: {fixture_labels}"

    def test_no_uniform_value_block(self, md_text: str = None):
        if md_text is None:
            md_text = TestISBARGridRegression.load_bad_output()
        tables = parse_markdown_tables(md_text)
        if not tables:
            pytest.fail("No tables found in output to check value block uniformity")
        
        all_vals = []
        for table in tables:
            for row in table[1:]:
                cells = row[3:] if len(row) > 3 else row[1:]
                for c in cells:
                    v = c.strip()
                    if v:
                        all_vals.append(v)
        
        if not all_vals:
            return

        counts = {}
        for v in all_vals:
            counts[v] = counts.get(v, 0) + 1
        
        max_val, max_count = max(counts.items(), key=lambda item: item[1])
        ratio = max_count / len(all_vals)
        assert ratio <= 0.70, f"Value '{max_val}' occupies {ratio:.1%} of non-empty cells (exceeds 70% max allowed threshold)"

    def test_entry_columns_bounded(self, md_text: str = None):
        if md_text is None:
            md_text = TestISBARGridRegression.load_bad_output()
        tables = parse_markdown_tables(md_text)
        if not tables:
            pytest.fail("No table found")
        header = tables[0][0]
        entry_cols = len(header) - 3 if len(header) >= 3 else len(header) - 1
        assert 4 <= entry_cols <= 12, f"Entry columns count {entry_cols} out of bounds [4, 12]"


SAFETY_ITEMS_FIXTURE_PATH = os.path.join(FIXTURES_DIR, "safety_checklist_items.txt")

class SafetyChecklistContract:
    @staticmethod
    def load_fixture_items() -> list[str]:
        if os.path.exists(SAFETY_ITEMS_FIXTURE_PATH):
            with open(SAFETY_ITEMS_FIXTURE_PATH, "r", encoding="utf-8") as f:
                return [line.strip() for line in f if line.strip()]
        return []

    def test_only_ticked_items_present(self, md_text: str):
        for line in md_text.splitlines():
            s = line.strip()
            if s.startswith("- ") or s.startswith("* "):
                assert "[X]" in s or "[?]" in s, f"Bare bullet line found without tick marker: '{s}'"

    def test_no_unticked_leakage(self, md_text: str):
        assert "SI5" not in md_text

    def test_no_invented_items(self, md_text: str):
        fixture_items = self.load_fixture_items()
        for line in md_text.splitlines():
            if "[X]" in line or "[?]" in line:
                item_text = line.split("]", 1)[-1].strip()
                item_text_clean = re.sub(r'^\s*[-*]\s*', '', item_text).strip()
                if item_text_clean:
                    assert any(item_text_clean in f or f in item_text_clean for f in fixture_items), \
                        f"Invented checklist item found: '{item_text_clean}'"

    def test_no_cross_section_duplication(self, md_text: str):
        lines = md_text.splitlines()
        in_time_out = False
        target = "Procedure to be performed matches the consent"
        for line in lines:
            if "TIME OUT" in line:
                in_time_out = True
            elif "SIGN OUT" in line:
                in_time_out = False
            if in_time_out and target in line:
                pytest.fail(f"SIGN IN item '{target}' duplicated under TIME OUT section")

    def test_no_cascading_indent(self, md_text: str):
        for line in md_text.splitlines():
            indent = len(line) - len(line.lstrip(' '))
            assert indent <= 4, f"Cascading indentation detected ({indent} spaces): '{line}'"

    def test_items_not_merged(self, md_text: str):
        pattern = re.compile(r'Consent signed by patient.*Known allergies', re.IGNORECASE)
        assert not pattern.search(md_text), "Merged checklist items detected in single line"





