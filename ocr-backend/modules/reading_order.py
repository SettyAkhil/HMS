import logging
from typing import List, Dict

logger = logging.getLogger(__name__)

class ReadingOrderEngine:
    """
    Reconstructs the semantic reading order of layout regions for multi-column documents.
    Operates in O(n log n) time by slicing the page into bands based on spanning elements,
    and then clustering the regions within each band into vertical columns.
    """
    
    def __init__(self, spanning_threshold: float = 0.6, column_gap_threshold: float = 0.03):
        """
        :param spanning_threshold: Region width > (spanning_threshold * page_width) is considered spanning.
        :param column_gap_threshold: Horizontal gap > (column_gap_threshold * page_width) defines a new column.
        """
        self.spanning_threshold = spanning_threshold
        self.column_gap_threshold = column_gap_threshold

    def reconstruct(self, regions: List[Dict], page_width: float, page_height: float) -> List[Dict]:
        """
        Returns a mapping of region_id to reading_order index (1-based).
        """
        if not regions:
            return []
            
        # 1. Separate spanning elements and non-spanning elements
        spanning_elements = []
        regular_elements = []
        
        for r in regions:
            x1, y1, x2, y2 = r["bbox"]
            width = x2 - x1
            
            # Identify spanning elements (e.g., Headers, Footers, wide Tables, wide Titles)
            if width >= (page_width * self.spanning_threshold):
                spanning_elements.append(r)
            else:
                regular_elements.append(r)
                
        # Sort spanning elements purely top-to-bottom
        spanning_elements.sort(key=lambda r: r["bbox"][1])
        
        # 2. Divide the page into vertical bands defined by spanning elements
        # Band limits are defined by the Y-coordinates of spanning elements
        band_y_limits = [0.0]
        for s in spanning_elements:
            band_y_limits.append(s["bbox"][1])  # Top edge
            band_y_limits.append(s["bbox"][3])  # Bottom edge
        band_y_limits.append(page_height)
        
        # Sort limits to guarantee top-down order
        band_y_limits.sort()
        
        # Create a list of tuples representing bands (y_start, y_end)
        bands = []
        for i in range(len(band_y_limits) - 1):
            y_start = band_y_limits[i]
            y_end = band_y_limits[i+1]
            if y_end > y_start:
                bands.append({"y_start": y_start, "y_end": y_end, "regions": [], "spanning": None})
                
        # Inject spanning elements as their own discrete bands
        for s in spanning_elements:
            y1, y3 = s["bbox"][1], s["bbox"][3]
            # Find the band that closely matches this and mark it as spanning
            for b in bands:
                if abs(b["y_start"] - y1) < 1.0 and abs(b["y_end"] - y3) < 1.0:
                    b["spanning"] = s
                    break

        # 3. Assign regular regions to bands based on their center Y coordinate
        for r in regular_elements:
            x1, y1, x2, y2 = r["bbox"]
            cy = (y1 + y2) / 2.0
            
            # Find which band it falls into
            placed = False
            for b in bands:
                if b["y_start"] <= cy <= b["y_end"]:
                    b["regions"].append(r)
                    placed = True
                    break
            
            # Fallback if center is out of bounds (shouldn't happen)
            if not placed:
                bands[0]["regions"].append(r)
                
        # 4. Sort regions inside each band (Multi-column clustering)
        ordered_regions = []
        
        for b in bands:
            if b["spanning"] is not None:
                ordered_regions.append(b["spanning"])
            
            if not b["regions"]:
                continue
                
            # Cluster boxes into columns based on X coordinates
            band_regions = b["regions"]
            # Sort by X1 first
            band_regions.sort(key=lambda r: r["bbox"][0])
            
            columns = []
            current_col = [band_regions[0]]
            
            for i in range(1, len(band_regions)):
                r_prev = current_col[-1]
                r_curr = band_regions[i]
                
                prev_x2 = r_prev["bbox"][2]
                curr_x1 = r_curr["bbox"][0]
                
                gap = curr_x1 - prev_x2
                
                if gap > (page_width * self.column_gap_threshold):
                    # New column detected
                    columns.append(current_col)
                    current_col = [r_curr]
                else:
                    # Same column, keep extending
                    current_col.append(r_curr)
                    # We might want to sort current_col so the right-most edge is accurate, 
                    # but simple contiguous adding works if they overlap.
                    
            if current_col:
                columns.append(current_col)
                
            # Within each column, sort top-to-bottom
            for col in columns:
                col.sort(key=lambda r: r["bbox"][1])
                ordered_regions.extend(col)
                
        # 5. Build Final Output Format
        result = []
        for index, r in enumerate(ordered_regions):
            result.append({
                "region_id": r["region_id"],
                "reading_order": index + 1
            })
            
        return result
