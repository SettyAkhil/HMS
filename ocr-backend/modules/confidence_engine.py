class ConfidenceEngine:
    """
    Computes a unified, field-level confidence score by combining structural 
    (Layout/YOLO) confidence and semantic (OCR/Entity Resolver/Corrector) confidence.
    """
    
    @staticmethod
    def calculate_final_confidence(layout_conf: float, semantic_conf: float) -> float:
        """
        Calculates a unified confidence score.
        Weighted average: 40% Layout Structure + 60% Semantic Accuracy
        If semantic_conf is missing, we rely heavily on layout.
        """
        # Clamp inputs
        l_conf = max(0.0, min(1.0, float(layout_conf)))
        s_conf = max(0.0, min(1.0, float(semantic_conf)))
        
        # If semantic confidence is extremely low (<0.3), penalize the overall score 
        # heavily to flag it for review.
        if s_conf < 0.3:
            return (l_conf * 0.2) + (s_conf * 0.8)
            
        # Standard weighted aggregation
        final_score = (l_conf * 0.4) + (s_conf * 0.6)
        
        return max(0.0, min(1.0, final_score))
