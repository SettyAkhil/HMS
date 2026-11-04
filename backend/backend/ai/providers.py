"""Provider interfaces for the AI service layer.

Business routes depend only on these interfaces (via ai/service.py), never on a specific
vendor SDK -- swapping the current vLLM-backed implementation for a different provider
later means writing a new class here, not touching any caller.
"""

from typing import Optional, Protocol


class OCRProvider(Protocol):
    def extract_text(
        self,
        file_bytes: bytes,
        language: str = "en",
        doc_type: str = "document",
        filename: Optional[str] = None,
    ) -> str: ...


class LLMProvider(Protocol):
    def generate(self, prompt: str, context: str = "") -> Optional[str]: ...

    def is_configured(self) -> bool: ...
