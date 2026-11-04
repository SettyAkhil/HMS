from modules.summarizer.timeline import TimelineBuilder

class MasterAggregator:
    """
    Stage 4 of Map-Reduce Pipeline.
    Takes the deeply consolidated clinical JSON schema and deterministically formats it 
    into the Master Clinical Summary Markdown report. This bypasses LLM context limits entirely
    during the final generation phase, ensuring zero data truncation.
    """
    
    @staticmethod
    def build_markdown_report(master_data: dict) -> str:
        from .blueprint_summary import load_blueprint, render_case_summary_markdown
        md, stats = render_case_summary_markdown(master_data, load_blueprint())
        overall = master_data.get("overall_summary", "")
        if overall and not overall.startswith("Error") and "No clinical narrative" not in overall:
            md = f"## Executive Clinical Summary\n{overall}\n\n" + md
        return md.strip()
