"""
TrOCR fallback engine — the second OCR engine in the Phase 2 hybrid pipeline.

The primary engine (modules/region_ocr.py's AsyncRegionOCR, calling vLLM) already
retries a region against 6 preprocessing strategies, but it's always the *same*
model. When its own confidence is still low after that, this module runs
TrOCR on the same crop and the caller keeps whichever result has the higher
confidence — a genuinely different engine, not another retry of the first one.

Confidence for both engines is computed the same way (mean per-token log-prob,
exponentiated to a [0,1] probability) so the comparison in region_ocr.py is
apples-to-apples: see AsyncRegionOCR._call_model_with_retry_async for the vLLM
side of this.
"""
import logging

import numpy as np
import torch
from PIL import Image

logger = logging.getLogger(__name__)

TROCR_MODEL_NAME = "microsoft/trocr-base-handwritten"


class TrOCREngine:
    """Singleton — loads once per worker process (mirrors DocLayoutDetector's
    pattern in modules/layout_detector.py)."""

    _instance = None

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
            cls._instance._initialized = False
        return cls._instance

    def __init__(self):
        if self._initialized:
            return
        self.processor = None
        self.model = None
        self.device = "cuda" if torch.cuda.is_available() else "cpu"
        self._load_model()
        self._initialized = True

    def _load_model(self):
        try:
            from transformers import TrOCRProcessor, VisionEncoderDecoderModel

            self.processor = TrOCRProcessor.from_pretrained(TROCR_MODEL_NAME)
            self.model = VisionEncoderDecoderModel.from_pretrained(TROCR_MODEL_NAME).to(self.device)
            self.model.eval()
            logger.info(f"TrOCR ({TROCR_MODEL_NAME}) loaded on {self.device}.")
        except Exception as e:
            logger.error(f"Failed to load TrOCR: {e}")

    def recognize(self, image: Image.Image) -> tuple[str, float]:
        """Blocking (torch) — call via asyncio.to_thread from async code.
        Returns (text, confidence in [0, 1])."""
        if self.model is None or self.processor is None:
            return "", 0.0
        try:
            pixel_values = self.processor(
                images=image.convert("RGB"), return_tensors="pt"
            ).pixel_values.to(self.device)

            with torch.no_grad():
                out = self.model.generate(
                    pixel_values,
                    output_scores=True,
                    return_dict_in_generate=True,
                    max_new_tokens=256,
                )

            text = self.processor.batch_decode(out.sequences, skip_special_tokens=True)[0].strip()

            # Mean per-generated-token log-prob of the chosen token, exponentiated.
            # (Same "mean logprob -> probability" method used for the vLLM side,
            # so the two engines' confidences are directly comparable.)
            token_logprobs = []
            generated_ids = out.sequences[0][1:]  # skip the decoder start token
            for step_logits, token_id in zip(out.scores, generated_ids):
                logprob = torch.log_softmax(step_logits[0], dim=-1)[token_id]
                token_logprobs.append(logprob.item())

            confidence = float(np.exp(np.mean(token_logprobs))) if token_logprobs else 0.0
            return text, confidence
        except Exception as e:
            logger.warning(f"TrOCR recognition failed: {e}")
            return "", 0.0
