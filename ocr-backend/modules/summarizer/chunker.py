import os
import json
import hashlib
from typing import List

CACHE_DIR = os.path.join(os.path.dirname(__file__), "..", "..", ".summary_cache")
os.makedirs(CACHE_DIR, exist_ok=True)

class TextChunker:
    """
    Slices raw clinical text into manageable chunks to prevent LLM context collapse,
    and manages local JSON caching for resumable processing.
    """
    def __init__(self, pages: List[str], chunk_size: int = 10, document_id: str = "doc"):
        self.pages = pages
        self.chunk_size = chunk_size
        
        # Create a unique hash for this document to isolate cache
        # Hash the first few pages + doc_id to ensure uniqueness
        doc_content = "".join(pages[:min(5, len(pages))])
        self.doc_hash = hashlib.md5(f"{document_id}_{doc_content}".encode()).hexdigest()
        
    def get_chunks(self) -> List[str]:
        """Groups pages into chunks of size `chunk_size`."""
        chunks = []
        for i in range(0, len(self.pages), self.chunk_size):
            chunk = "\n\n--- PAGE BREAK ---\n\n".join(self.pages[i:i+self.chunk_size])
            chunks.append(chunk)
        return chunks
        
    def get_cache_path(self, chunk_index: int) -> str:
        return os.path.join(CACHE_DIR, f"{self.doc_hash}_chunk_{chunk_index}.json")
        
    def load_cached_chunk(self, chunk_index: int) -> dict:
        """Returns the parsed JSON dictionary if the chunk was already processed, else None."""
        path = self.get_cache_path(chunk_index)
        if os.path.exists(path):
            try:
                with open(path, "r", encoding="utf-8") as f:
                    return json.load(f)
            except Exception:
                return None
        return None
        
    def save_chunk_cache(self, chunk_index: int, data: dict):
        """Saves a successfully processed chunk to local cache."""
        path = self.get_cache_path(chunk_index)
        with open(path, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2)
            
    def clear_cache(self):
        """Deletes all cached chunks for this specific document."""
        if not os.path.exists(CACHE_DIR):
            return
        for f in os.listdir(CACHE_DIR):
            if f.startswith(self.doc_hash):
                try:
                    os.remove(os.path.join(CACHE_DIR, f))
                except:
                    pass
