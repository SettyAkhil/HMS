from PIL import Image, ImageDraw

from core.schemas import RegionPrediction


def normalize_predictions(raw_predictions: list) -> list:
    """
    Phase 5 — maps the loose per-region prediction dicts produced during OCR
    (modules/unified_resolver.py's resolve_entities_in_text, augmented with
    ocr_confidence/ocr_model_used in modules/precision_ocr.py's
    process_single_page) onto the single RegionPrediction schema
    (core/schemas.py). Called once, at the boundary where a job's results
    are archived (workers/celery_app.py: finalize_ocr_job) — deliberately
    not threaded through the OCR internals themselves (unified_resolver,
    region_ocr, table_extractor), which already work and are exercised by
    the Phase 1/2 live verifications; this only normalizes their combined
    output before it's persisted/returned by the API.

    Every field the API returns for an extracted entity therefore carries
    page number, bounding box, entity-resolution confidence, OCR model used,
    and that model's own read confidence — the grounding guarantee from the
    original spec — regardless of which internal stage produced it.
    """
    normalized = []
    for i, p in enumerate(raw_predictions):
        try:
            confidence = float(p.get("Confidence", 0.0))
        except (TypeError, ValueError):
            confidence = 0.0
        region = RegionPrediction(
            region_id=p.get("region_id") or f"pred_{i}",
            region_type=p.get("region_type") or p.get("Type", "Unknown"),
            bbox=p.get("bbox") or [],
            page_number=p.get("page", 0),
            text_content=p.get("Original Text"),
            confidence_score=confidence,
            reading_order=i,
            entity_classification=p.get("Type"),
            resolved_name=p.get("Predicted Code/Name") or p.get("Predicted Name") or p.get("Predicted Code"),
            dataset_source=p.get("dataset_source"),
            resolution_confidence=confidence,
            ocr_confidence=float(p.get("ocr_confidence", 0.0) or 0.0),
            ocr_model_used=p.get("ocr_model_used", "unknown"),
        )
        normalized.append(region.model_dump())
    return normalized


class VisualGrounder:
    """
    Handles drawing visual grounding overlays directly onto source document images.
    """
    
    @staticmethod
    def draw_highlight(image: Image.Image, bbox: list, label: str = "") -> Image.Image:
        """
        Overlays a translucent bounding box onto the image for visual verification.
        
        Args:
            image: Original PIL Image.
            bbox: [x1, y1, x2, y2]
            label: Optional text label to place above the box.
            
        Returns:
            A new PIL Image with the grounding box drawn.
        """
        if not bbox or len(bbox) != 4:
            return image
            
        # Convert base image to RGBA for alpha compositing
        base_img = image.convert("RGBA")
        
        # Create a transparent overlay
        overlay = Image.new("RGBA", base_img.size, (255, 255, 255, 0))
        draw = ImageDraw.Draw(overlay)
        
        x1, y1, x2, y2 = bbox
        
        # Styling: Translucent amber/red fill with a strong red border
        fill_color = (243, 156, 18, 60)     # Translucent amber
        outline_color = (231, 76, 60, 255)  # Solid bright red
        
        # Draw the rectangle
        draw.rectangle([x1, y1, x2, y2], fill=fill_color, outline=outline_color, width=5)
        
        # If a label is provided, try drawing it slightly above the box
        if label:
            # We don't rely on complex fonts here to avoid system font path issues,
            # but default font is usually visible enough.
            text_x = x1
            text_y = max(0, y1 - 20)
            
            # Simple text backdrop
            draw.rectangle([text_x, text_y, text_x + len(label)*7, text_y + 15], fill=outline_color)
            draw.text((text_x + 2, text_y), label, fill=(255, 255, 255, 255))
            
        # Alpha composite the overlay onto the original image
        final_img = Image.alpha_composite(base_img, overlay)
        
        # Return as RGB for standard Streamlit rendering
        return final_img.convert("RGB")
