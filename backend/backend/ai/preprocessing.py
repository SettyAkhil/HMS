"""CPU-only image preparation for the OCR pipeline.

The OCR engine is a vision-language model (ai/vllm_provider.py), not a classic
character recogniser, and that changes what helps. A VLM reads a slightly skewed,
slightly noisy photo perfectly well; what it cannot recover from is a sideways
page or ink that preprocessing erased. This module used to denoise
(fastNlMeansDenoising at h=10 -- smears thin ballpoint strokes), deskew (via
minAreaRect, whose angle convention changed in OpenCV 4.5, so it could rotate
the page the wrong way) and re-encode as a full-resolution PNG (a 12 MP phone
photo became a ~20 MB base64 payload and thousands of image tokens). All three
cost legibility on handwritten sheets. It now does only what a VLM benefits from:

1. honour the EXIF orientation tag -- phone photos are routinely stored sideways
   with a "rotate 90" flag that cv2.imdecode ignores;
2. flatten transparency onto white (a whiteboard export is a transparent PNG,
   and a model sees transparent ink-on-nothing as black-on-black);
3. bound the size, so the image fits comfortably in the model's context;
4. a gentle local-contrast lift (CLAHE) for faint ink and uneven lighting.

Any failure falls back to the original bytes -- preprocessing must never break
an upload.
"""

import io

import cv2
import numpy as np
from PIL import Image, ImageOps

# Long side, in pixels. Handwriting stays legible at this size, and a page this
# big costs the model roughly 4k image tokens -- well inside its context with
# room left for a long transcription.
MAX_LONG_SIDE = 2048
# Small scans/crops are upscaled to this short side: below it, small handwriting
# falls under the model's patch size and individual letters blur together.
MIN_SHORT_SIDE = 900
JPEG_QUALITY = 92


def _load_upright_rgb(file_bytes: bytes) -> Image.Image:
    image = Image.open(io.BytesIO(file_bytes))
    image = ImageOps.exif_transpose(image)
    if image.mode in ("RGBA", "LA", "P"):
        rgba = image.convert("RGBA")
        canvas = Image.new("RGB", rgba.size, (255, 255, 255))
        canvas.paste(rgba, mask=rgba.split()[-1])
        return canvas
    return image.convert("RGB")


def _bound_size(image: Image.Image) -> Image.Image:
    width, height = image.size
    long_side, short_side = max(width, height), min(width, height)
    if long_side > MAX_LONG_SIDE:
        scale = MAX_LONG_SIDE / long_side
    elif short_side < MIN_SHORT_SIDE:
        scale = min(MIN_SHORT_SIDE / short_side, MAX_LONG_SIDE / long_side)
    else:
        return image
    size = (max(1, round(width * scale)), max(1, round(height * scale)))
    return image.resize(size, Image.LANCZOS)


def _lift_contrast(image: Image.Image) -> Image.Image:
    bgr = cv2.cvtColor(np.asarray(image), cv2.COLOR_RGB2BGR)
    lab = cv2.cvtColor(bgr, cv2.COLOR_BGR2LAB)
    l_channel, a_channel, b_channel = cv2.split(lab)
    l_channel = cv2.createCLAHE(clipLimit=1.5, tileGridSize=(8, 8)).apply(l_channel)
    merged = cv2.cvtColor(cv2.merge((l_channel, a_channel, b_channel)), cv2.COLOR_LAB2RGB)
    return Image.fromarray(merged)


def prepare_image(file_bytes: bytes) -> bytes:
    """Upright, bounded, contrast-lifted JPEG for the vision model. Raises on undecodable input."""
    image = _lift_contrast(_bound_size(_load_upright_rgb(file_bytes)))
    out = io.BytesIO()
    image.save(out, format="JPEG", quality=JPEG_QUALITY)
    return out.getvalue()


def preprocess_image_bytes(file_bytes: bytes, mime_type: str = None) -> bytes:
    """prepare_image() for raster images; PDFs and undecodable content pass through unchanged.

    Always returns valid bytes; never raises.
    """
    if not file_bytes or mime_type == "application/pdf":
        return file_bytes
    try:
        return prepare_image(file_bytes)
    except Exception:
        return file_bytes
