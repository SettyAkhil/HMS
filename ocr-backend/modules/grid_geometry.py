import cv2
import logging
import numpy as np
from PIL import Image
from typing import List, Tuple

logger = logging.getLogger(__name__)

def detect_grid_columns(img: Image.Image, label_col_right_frac: float = 0.42) -> List[Tuple[int, int]]:
    """
    Detects vertical entry column bands in a grid image using OpenCV morphological filtering.
    Returns consecutive (x_left, x_right) column bands right of label_col_right_frac.
    Returns [] if fewer than 3 entry columns are found.
    """
    try:
        w, h = img.size
        img_cv = cv2.cvtColor(np.array(img), cv2.COLOR_RGB2BGR)
        gray = cv2.cvtColor(img_cv, cv2.COLOR_BGR2GRAY)

        # 1. Adaptive threshold -> invert
        binary = cv2.adaptiveThreshold(
            gray, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY_INV, 15, 2
        )

        # 2. Isolate vertical rules with vertical kernel (1, h // 40), then dilate
        kernel_h = max(10, h // 40)
        vert_kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (1, kernel_h))
        vert_img = cv2.erode(binary, vert_kernel, iterations=1)
        vert_img = cv2.dilate(vert_img, vert_kernel, iterations=2)

        # 3. Column-sum projection, take peaks as rule x-positions
        col_sum = np.sum(vert_img, axis=0)
        thresh_sum = np.max(col_sum) * 0.15
        peaks = np.where(col_sum > thresh_sum)[0]

        if len(peaks) == 0:
            logger.info("Grid geometry detection found 0 vertical rule peaks.")
            return []

        # 4. Cluster peaks within 5px, sort
        clustered_x = []
        current_cluster = [peaks[0]]
        for p in peaks[1:]:
            if p - current_cluster[-1] <= 5:
                current_cluster.append(p)
            else:
                clustered_x.append(int(np.mean(current_cluster)))
                current_cluster = [p]
        if current_cluster:
            clustered_x.append(int(np.mean(current_cluster)))

        # 5. Discard everything left of label_col_right_frac * width
        cutoff_x = int(label_col_right_frac * w)
        entry_rules = [x for x in clustered_x if x >= cutoff_x]

        if len(entry_rules) < 2:
            logger.info(f"Grid geometry detection found {len(entry_rules)} entry rules after cutoff (fewer than 2).")
            return []

        # 6. Return consecutive (x_left, x_right) pairs
        bands = []
        for i in range(len(entry_rules) - 1):
            bands.append((entry_rules[i], entry_rules[i + 1]))

        logger.info(f"Grid geometry detected {len(bands)} entry column bands.")
        if len(bands) < 3:
            return []

        return bands
    except Exception as e:
        logger.warning(f"Grid column detection failed: {e}")
        return []


def detect_grid_rows(img: Image.Image) -> List[Tuple[int, int]]:
    """
    Detects horizontal row bands in a grid image using OpenCV morphological filtering.
    """
    try:
        w, h = img.size
        img_cv = cv2.cvtColor(np.array(img), cv2.COLOR_RGB2BGR)
        gray = cv2.cvtColor(img_cv, cv2.COLOR_BGR2GRAY)

        binary = cv2.adaptiveThreshold(
            gray, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY_INV, 15, 2
        )

        kernel_w = max(10, w // 40)
        horiz_kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (kernel_w, 1))
        horiz_img = cv2.erode(binary, horiz_kernel, iterations=1)
        horiz_img = cv2.dilate(horiz_img, horiz_kernel, iterations=2)

        row_sum = np.sum(horiz_img, axis=1)
        thresh_sum = np.max(row_sum) * 0.15
        peaks = np.where(row_sum > thresh_sum)[0]

        if len(peaks) == 0:
            return []

        clustered_y = []
        current_cluster = [peaks[0]]
        for p in peaks[1:]:
            if p - current_cluster[-1] <= 5:
                current_cluster.append(p)
            else:
                clustered_y.append(int(np.mean(current_cluster)))
                current_cluster = [p]
        if current_cluster:
            clustered_y.append(int(np.mean(current_cluster)))

        bands = []
        for i in range(len(clustered_y) - 1):
            bands.append((clustered_y[i], clustered_y[i + 1]))

        return bands
    except Exception as e:
        logger.warning(f"Grid row detection failed: {e}")
        return []


def cell_has_ink(img: Image.Image, bbox: Tuple[int, int, int, int], min_ink_fraction: float = 0.004) -> bool:
    """
    Determines whether a crop bbox inside img contains handwritten ink.
    Excludes a 3px border from crop to avoid counting grid boundary lines.
    Uses blue-pen chroma mask ((B - R) > 20.0) when chroma signal is present, else luma mask.
    """
    try:
        x1, y1, x2, y2 = bbox
        inner_x1 = max(x1 + 3, x1)
        inner_y1 = max(y1 + 3, y1)
        inner_x2 = min(x2 - 3, x2)
        inner_y2 = min(y2 - 3, y2)

        if inner_x2 <= inner_x1 or inner_y2 <= inner_y1:
            return False

        crop = img.crop((inner_x1, inner_y1, inner_x2, inner_y2))
        arr = np.array(crop).astype(np.float32)

        if arr.ndim < 3 or arr.shape[2] < 3:
            return False

        r, g, b = arr[:, :, 0], arr[:, :, 1], arr[:, :, 2]
        luma = 0.299 * r + 0.587 * g + 0.114 * b

        chroma_diff = b - r
        chroma_mask = chroma_diff > 20.0
        chroma_mean = np.mean(chroma_mask)

        if chroma_mean > 0.02:
            ink_mask = chroma_mask
        else:
            p90 = np.percentile(luma, 90)
            ink_mask = luma < (p90 - 60.0)

        ink_ratio = float(np.mean(ink_mask))
        return ink_ratio >= min_ink_fraction
    except Exception as e:
        logger.warning(f"cell_has_ink check failed: {e}")
        return True

