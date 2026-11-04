from datetime import datetime
import logging

logger = logging.getLogger(__name__)

class TimelineBuilder:
    """
    Constructs a mathematically sorted chronological timeline from ISO-8601 normalized
    events extracted during the Map-Reduce summarization phase.
    """
    
    @staticmethod
    def build_chronological_timeline(master_data: dict) -> str:
        events = master_data.get("timeline_events", [])
        if not events:
            return "- No chronologically distinct events extracted.\n"
            
        parsed_events = []
        
        # Deduplicate identical events first to prevent clutter
        seen = set()
        unique_events = []
        for e in events:
            # Safely handle potential malformed dicts
            if not isinstance(e, dict):
                continue
            date_str = str(e.get("date", "")).strip()
            event_desc = str(e.get("event", "")).strip()
            
            if not date_str or not event_desc:
                continue
                
            hash_key = f"{date_str}_{event_desc}"
            if hash_key not in seen:
                seen.add(hash_key)
                unique_events.append(e)

        # Parse and sort
        for e in unique_events:
            date_str = e.get("date").strip()
            event_desc = e.get("event").strip()
            
            dt = datetime.max  # Default to end if parsing completely fails
            
            try:
                # Strict ISO-8601 standard
                dt = datetime.strptime(date_str, "%Y-%m-%d")
            except ValueError:
                try:
                    # Month-level precision
                    dt = datetime.strptime(date_str, "%Y-%m")
                except ValueError:
                    try:
                        # Year-level precision
                        dt = datetime.strptime(date_str, "%Y")
                    except ValueError:
                        logger.warning(f"Failed to parse timeline date natively: {date_str}")
                        
            parsed_events.append((dt, event_desc, date_str))
            
        # Sort chronologically (oldest to newest)
        parsed_events.sort(key=lambda x: x[0])
        
        # Build strict markdown
        md = ""
        for dt, desc, raw_date in parsed_events:
            # If the date is datetime.max, it means it's an unparsed/unknown date
            display_date = raw_date if dt != datetime.max else f"{raw_date} (Unknown Date Format)"
            md += f"- **{display_date}**: {desc}\n"
            
        return md
