import os
import sys
import pytest
import numpy as np
from PIL import Image, ImageDraw

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
from modules.grid_geometry import detect_grid_columns, detect_grid_rows

def generate_synthetic_isbar_grid() -> Image.Image:
    """Generates a synthetic ISBAR grid image with 10 vertical entry columns and 26 horizontal rows."""
    w, h = 1000, 1200
    img = Image.new("RGB", (w, h), color="white")
    draw = ImageDraw.Draw(img)

    # Draw vertical rule lines
    # Label column boundary at x=420 (0.42 * 1000)
    # 10 entry columns from x=420 to x=970 (width=55 each)
    x_positions = [420] + [420 + i * 55 for i in range(1, 11)]
    for x in x_positions:
        draw.line([(x, 50), (x, 1150)], fill="black", width=2)

    # Draw 27 horizontal lines (26 rows)
    y_positions = [50 + i * 40 for i in range(27)]
    for y in y_positions:
        draw.line([(50, y), (970, y)], fill="black", width=2)

    return img


def test_detect_grid_columns_synthetic():
    img = generate_synthetic_isbar_grid()
    cols = detect_grid_columns(img, label_col_right_frac=0.40)
    assert len(cols) >= 8


def test_detect_grid_rows_synthetic():
    img = generate_synthetic_isbar_grid()
    rows = detect_grid_rows(img)
    assert len(rows) >= 24


def test_cell_has_ink():
    from modules.grid_geometry import cell_has_ink
    img = Image.new("RGB", (100, 100), color="white")
    draw = ImageDraw.Draw(img)

    assert not cell_has_ink(img, (10, 10, 90, 90))

    draw.line([(30, 30), (70, 70)], fill=(0, 0, 255), width=4)
    assert cell_has_ink(img, (10, 10, 90, 90))

