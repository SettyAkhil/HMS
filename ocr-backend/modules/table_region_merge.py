import uuid
from typing import List, Dict

def merge_vertical_table_regions(
    regions: List[Dict], page_w: int, page_h: int,
    x_overlap_min: float = 0.85, y_gap_max_frac: float = 0.02
) -> List[Dict]:
    """
    Merges vertically adjacent Table regions that share substantial horizontal overlap.
    Preserves all non-Table regions untouched and maintains relative layout order.
    """
    if not regions:
        return []

    def can_merge(r1: Dict, r2: Dict) -> bool:
        if r1.get("region_type") != "Table" or r2.get("region_type") != "Table":
            return False

        b1 = r1["bbox"]  # [x1, y1, x2, y2]
        b2 = r2["bbox"]

        # Horizontal overlap
        x_min1, x_max1 = b1[0], b1[2]
        x_min2, x_max2 = b2[0], b2[2]

        inter_x = max(0, min(x_max1, x_max2) - max(x_min1, x_min2))
        w1 = max(1, x_max1 - x_min1)
        w2 = max(1, x_max2 - x_min2)
        narrower_w = min(w1, w2)

        x_overlap = inter_x / float(narrower_w)
        if x_overlap < x_overlap_min:
            return False

        # Vertical gap
        y_max1 = b1[3]
        y_min2 = b2[1]
        
        # Determine top and bottom
        if b1[1] <= b2[1]:
            top_y2, bot_y1 = b1[3], b2[1]
        else:
            top_y2, bot_y1 = b2[3], b1[1]

        v_gap = max(0, bot_y1 - top_y2)
        max_allowed_gap = y_gap_max_frac * page_h

        return v_gap <= max_allowed_gap

    def merge_two(r1: Dict, r2: Dict) -> Dict:
        b1, b2 = r1["bbox"], r2["bbox"]
        union_bbox = [
            min(b1[0], b2[0]),
            min(b1[1], b2[1]),
            max(b1[2], b2[2]),
            max(b1[3], b2[3]),
        ]
        conf1 = r1.get("confidence", 1.0)
        conf2 = r2.get("confidence", 1.0)

        return {
            "region_id": f"merged_table_{uuid.uuid4().hex[:8]}",
            "region_type": "Table",
            "bbox": union_bbox,
            "confidence": min(conf1, conf2),
        }

    # Iterative transitive merging pass
    merged_list = list(regions)
    changed = True
    while changed:
        changed = False
        new_list = []
        skip_indices = set()

        for i in range(len(merged_list)):
            if i in skip_indices:
                continue
            merged = False
            for j in range(i + 1, len(merged_list)):
                if j in skip_indices:
                    continue
                if can_merge(merged_list[i], merged_list[j]):
                    combined = merge_two(merged_list[i], merged_list[j])
                    new_list.append(combined)
                    skip_indices.add(i)
                    skip_indices.add(j)
                    changed = True
                    merged = True
                    break
            if not merged:
                new_list.append(merged_list[i])

        merged_list = new_list

    return merged_list
