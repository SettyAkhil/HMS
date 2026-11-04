import os
import io
import uuid
import uuid
import logging
from typing import List, Dict, Union
from PIL import Image

# Setup basic logging
logger = logging.getLogger(__name__)

class DocLayoutDetector:
    _instance = None

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super(DocLayoutDetector, cls).__new__(cls)
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
            from ultralytics import YOLO
            from huggingface_hub import hf_hub_download
        except ImportError:
            logger.error("ultralytics or huggingface_hub is not installed.")
            return

        # Attempt to load a DocLayout-YOLO model.
        # Here we use a generic placeholder or a widely available layout model.
        # Since standard YOLO formats are used, we fallback gracefully if huggingface fails.
        model_path = os.path.join(os.path.dirname(__file__), "..", "models", "doclayout.pt")
        os.makedirs(os.path.dirname(model_path), exist_ok=True)
        
        if not os.path.exists(model_path):
            try:
                logger.info("Downloading DocLayout-YOLO model weights...")
                # You might need to change the repo/filename depending on the exact model version used.
                # Example: foduucom/table-detection-and-extraction or a doclaynet YOLOv8 model.
                # Using a generic public doclaynet yolo model: "foduucom/document-layout-analysis-yolov8"
                downloaded_path = hf_hub_download(
                    repo_id="foduucom/document-layout-analysis-yolov8",
                    filename="best.pt",
                    local_dir=os.path.dirname(model_path)
                )
                os.rename(downloaded_path, model_path)
            except Exception as e:
                logger.error(f"Failed to download model: {e}")
                return

        try:
            self.model = YOLO(model_path)
            logger.info("DocLayout-YOLO model loaded successfully.")
        except Exception as e:
            logger.error(f"Failed to load YOLO model: {e}")

    def detect_regions(self, image: Image.Image) -> List[Dict]:
        """
        Detect layout regions in the provided PIL Image.
        Returns a sorted list of regions with merged overlaps.
        """
        if self.model is None:
            logger.warning("Layout model is not loaded. Returning fallback full-page region.")
            return [self._fallback_region(image)]

        try:
            # YOLO predict expects PIL image or numpy array
            results = self.model.predict(image, verbose=False, conf=0.3)
            
            regions = []
            if len(results) > 0 and len(results[0].boxes) > 0:
                boxes = results[0].boxes
                for box in boxes:
                    x1, y1, x2, y2 = box.xyxy[0].tolist()
                    conf = float(box.conf[0])
                    cls_id = int(box.cls[0])
                    # Get class name safely
                    class_name = self.model.names[cls_id] if hasattr(self.model, 'names') else str(cls_id)
                    
                    # Normalize labels to user-requested types
                    region_type = self._map_class_name(class_name)
                    
                    regions.append({
                        "region_id": str(uuid.uuid4()),
                        "region_type": region_type,
                        "bbox": [x1, y1, x2, y2],
                        "confidence": conf,
                        "area": (x2 - x1) * (y2 - y1)
                    })
            
            if not regions:
                return [self._fallback_region(image)]
                
            # 1. Merge overlapping regions (>30% IoU)
            merged_regions = self._merge_overlaps(regions)

            # 1b. Merge vertical table regions (ISBAR/checklists split into row-bands)
            from modules.table_region_merge import merge_vertical_table_regions
            w, h = image.size
            merged_regions = merge_vertical_table_regions(merged_regions, page_w=w, page_h=h)
            
            # 2. Check if total true area of merged regions is suspiciously small
            w, h = image.size
            total_area = 0
            for r in merged_regions:
                box = r["bbox"]
                total_area += (box[2] - box[0]) * (box[3] - box[1])
                
            # YOLO often shreds handwritten pages into tiny fragments or misses text.
            # If the regions cover less than 40% of the page, bypass layout detection
            # and let the VLM process the full page natively (which it does brilliantly).
            if total_area < (w * h * 0.40):
                logger.info(f"YOLO Layout detected < 40% of page area. Falling back to full page processing.")
                return [self._fallback_region(image)]
            
            # The sorting is now handled by the Reading Order Engine
            # in precision_ocr.py, so we just return the merged regions.
            return merged_regions

        except Exception as e:
            logger.error(f"Layout detection failed: {e}")
            return [self._fallback_region(image)]

    def _fallback_region(self, image: Image.Image) -> Dict:
        """Return a single region covering the entire image as fallback."""
        w, h = image.size
        return {
            "region_id": str(uuid.uuid4()),
            "region_type": "Paragraph",
            "bbox": [0, 0, w, h],
            "confidence": 1.0
        }

    def _map_class_name(self, raw_class: str) -> str:
        """Map YOLO classes to requested generic types."""
        raw = raw_class.lower()
        if "table" in raw: return "Table"
        if "title" in raw or "heading" in raw: return "Title"
        if "header" in raw: return "Header"
        if "footer" in raw: return "Footer"
        if "figure" in raw or "picture" in raw or "image" in raw: return "Figure"
        if "signature" in raw: return "Signature"
        if "form" in raw: return "Form"
        if "checkbox" in raw: return "Checkbox"
        # Everything else (text, paragraph, text_block)
        return "Paragraph"

    def _calculate_iou(self, boxA, boxB):
        xA = max(boxA[0], boxB[0])
        yA = max(boxA[1], boxB[1])
        xB = min(boxA[2], boxB[2])
        yB = min(boxA[3], boxB[3])

        interArea = max(0, xB - xA) * max(0, yB - yA)
        if interArea == 0:
            return 0.0

        boxAArea = (boxA[2] - boxA[0]) * (boxA[3] - boxA[1])
        boxBArea = (boxB[2] - boxB[0]) * (boxB[3] - boxB[1])

        iou = interArea / float(boxAArea + boxBArea - interArea)
        return iou

    def _calculate_overlap_ratio(self, boxA, boxB):
        """Calculate overlap ratio relative to the smaller bounding box."""
        xA = max(boxA[0], boxB[0])
        yA = max(boxA[1], boxB[1])
        xB = min(boxA[2], boxB[2])
        yB = min(boxA[3], boxB[3])

        interArea = max(0, xB - xA) * max(0, yB - yA)
        if interArea == 0:
            return 0.0

        boxAArea = (boxA[2] - boxA[0]) * (boxA[3] - boxA[1])
        boxBArea = (boxB[2] - boxB[0]) * (boxB[3] - boxB[1])

        minArea = min(boxAArea, boxBArea)
        if minArea == 0:
            return 0.0
        return interArea / minArea

    def _merge_overlaps(self, regions: List[Dict], threshold: float = 0.3) -> List[Dict]:
        """Merge regions that have an overlap > 30%."""
        if not regions:
            return []
            
        merged = []
        # Keep track of which regions have been merged
        skip = set()

        for i, r1 in enumerate(regions):
            if i in skip:
                continue
            
            current_merged = r1.copy()
            box1 = current_merged["bbox"]
            
            for j in range(i + 1, len(regions)):
                if j in skip:
                    continue
                    
                r2 = regions[j]
                box2 = r2["bbox"]
                
                # Check overlap ratio
                overlap = self._calculate_overlap_ratio(box1, box2)
                
                if overlap > threshold:
                    # Merge box2 into current_merged
                    box1[0] = min(box1[0], box2[0])
                    box1[1] = min(box1[1], box2[1])
                    box1[2] = max(box1[2], box2[2])
                    box1[3] = max(box1[3], box2[3])
                    skip.add(j)
                    
                    # If combining types, prefer specialized ones over generic Paragraph
                    if current_merged["region_type"] == "Paragraph" and r2["region_type"] != "Paragraph":
                        current_merged["region_type"] = r2["region_type"]
            
            merged.append(current_merged)
            
        return merged

    def _sort_regions(self, regions: List[Dict]) -> List[Dict]:
        """Sort regions Top-to-Bottom, Left-to-Right."""
        def get_sort_key(region):
            x1, y1, x2, y2 = region["bbox"]
            # Bin the y-coordinates to align elements on the same text line
            y_bin = int(y1 / 20) * 20  
            return (y_bin, x1)
            
        return sorted(regions, key=get_sort_key)
