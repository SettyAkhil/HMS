import asyncio
from modules.summarizer.blueprint_summary import load_blueprint, build_extraction_prompt
from modules.summarizer.hierarchical import HierarchicalSummarizer

BP = load_blueprint()
prompt = build_extraction_prompt(BP, "Patient John Doe, 45 yrs, admitted for fever.")
print("PROMPT LENGTH:", len(prompt))

hs = HierarchicalSummarizer()
data = hs._extract_chunk_data("Patient John Doe, 45 yrs, admitted for fever.")
print("EXTRACTED DATA KEYS:", data.keys() if isinstance(data, dict) else "Not a dict")
