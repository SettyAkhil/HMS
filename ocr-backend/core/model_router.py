"""
Model Router — Phase 3. Routes each inference *role* (vision/OCR,
summarization, chat, entity extraction, embedding, reranking) to a specific
backend, instead of every module hardcoding "qwen2.5-vl-7b at
localhost:8700" directly (as modules/precision_ocr.py, region_ocr.py,
pdf_summarizer.py, medical_corrector.py, rag_chatbot.py all did before this).

Hardware reality (one shared GPU, ~8-12GB free after the main 7B vision-
language model): there isn't room for five separate large models, so the
text/vision roles below all resolve to the one available vLLM deployment.
Embedding and reranking roles get real, dedicated, small local models
(BGE-M3 / BGE-Reranker-v2-m3) — genuinely different backends, not just a
relabeled pass-through — because those are needed for Phase 4's RAG anyway
and are cheap enough to run alongside the main model. This also fixes a
real bug: modules/rag_chatbot.py was previously configured to call
"nomic-embed-text" through the vLLM endpoint, which never actually served
that model (see Phase 1 exploration notes) — embed_texts() below is a real,
working replacement.

Usage:
    from core.model_router import get_client_for_role, Role, embed_texts, rerank

    client = get_client_for_role(Role.VISION_OCR)   # AsyncOpenAI, vLLM-backed
    vectors = embed_texts(["some clinical note text"])   # BGE-M3, local
    scores = rerank("query", ["doc a", "doc b"])          # BGE-Reranker, local
"""
import logging
from enum import Enum
from typing import List

from openai import AsyncOpenAI, OpenAI

from core.config import settings, served_model

logger = logging.getLogger(__name__)


class Role(str, Enum):
    VISION_OCR = "vision_ocr"
    SUMMARIZATION = "summarization"
    CHAT = "chat"
    ENTITY_EXTRACTION = "entity_extraction"


_ROLE_MODEL = {
    Role.VISION_OCR: settings.VISION_MODEL,
    Role.SUMMARIZATION: settings.SUMMARY_MODEL,
    Role.CHAT: settings.CHAT_MODEL,
    Role.ENTITY_EXTRACTION: settings.ENTITY_MODEL,
}

# Bounded timeout for every router-issued client (see modules/region_ocr.py
# for why: the OpenAI SDK's 600s default lets one hung call block a Celery
# worker for up to 10 minutes).
_DEFAULT_TIMEOUT = 90.0


def model_name_for_role(role: Role) -> str:
    return served_model(_ROLE_MODEL[role])


def get_client_for_role(role: Role) -> AsyncOpenAI:
    """All text/vision roles currently share the one vLLM deployment — this
    still routes through a single seam so a role can be pointed at a
    different endpoint later (e.g. a dedicated summarization model) without
    touching every call site again."""
    return AsyncOpenAI(base_url=settings.VLLM_BASE_URL, api_key="EMPTY", timeout=_DEFAULT_TIMEOUT)


def get_sync_client_for_role(role: Role) -> OpenAI:
    return OpenAI(base_url=settings.VLLM_BASE_URL, api_key="EMPTY", timeout=_DEFAULT_TIMEOUT)


# ---------------------------------------------------------------------------
# Embedding (BGE-M3) — real local model, singleton (loaded once per process)
# ---------------------------------------------------------------------------
class _EmbeddingModel:
    _instance = None

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
            cls._instance._initialized = False
        return cls._instance

    def __init__(self):
        if self._initialized:
            return
        self.model = None
        try:
            from FlagEmbedding import BGEM3FlagModel
            self.model = BGEM3FlagModel(settings.EMBEDDING_MODEL, use_fp16=True)
            logger.info(f"Embedding model loaded: {settings.EMBEDDING_MODEL}")
        except Exception as e:
            logger.error(f"Failed to load embedding model {settings.EMBEDDING_MODEL}: {e}")
        self._initialized = True

    def encode(self, texts: List[str]) -> List[List[float]]:
        if self.model is None:
            raise RuntimeError(f"Embedding model {settings.EMBEDDING_MODEL} failed to load")
        result = self.model.encode(texts, return_dense=True, return_sparse=False, return_colbert_vecs=False)
        return [vec.tolist() for vec in result["dense_vecs"]]


def embed_texts(texts: List[str]) -> List[List[float]]:
    """Dense embeddings via BGE-M3 (1024-dim). Used by the RAG pipeline
    (Phase 4) to embed document chunks and queries into Qdrant."""
    return _EmbeddingModel().encode(texts)


# ---------------------------------------------------------------------------
# Reranking (BGE-Reranker-v2-m3) — real local model, singleton
# ---------------------------------------------------------------------------
class _RerankerModel:
    _instance = None

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
            cls._instance._initialized = False
        return cls._instance

    def __init__(self):
        if self._initialized:
            return
        self.model = None
        try:
            # Deliberately sentence_transformers.CrossEncoder, not
            # FlagEmbedding.FlagReranker: at the transformers version that
            # works for BGE-M3 (see _EmbeddingModel), FlagReranker's
            # compute_score() hits `self.tokenizer.prepare_for_model()`,
            # which the slow XLMRobertaTokenizer no longer has —
            # CrossEncoder loads the fast tokenizer correctly and produces
            # the same scores (verified against the same query/doc set).
            from sentence_transformers import CrossEncoder
            self.model = CrossEncoder(settings.RERANKER_MODEL)
            logger.info(f"Reranker model loaded: {settings.RERANKER_MODEL}")
        except Exception as e:
            logger.error(f"Failed to load reranker model {settings.RERANKER_MODEL}: {e}")
        self._initialized = True

    def score(self, query: str, documents: List[str]) -> List[float]:
        if self.model is None:
            raise RuntimeError(f"Reranker model {settings.RERANKER_MODEL} failed to load")
        pairs = [(query, doc) for doc in documents]
        return [float(s) for s in self.model.predict(pairs)]


def rerank(query: str, documents: List[str]) -> List[float]:
    """Relevance scores (0-1, higher = more relevant) for `documents` against
    `query`, via BGE-Reranker-v2-m3. Used by the RAG pipeline (Phase 4) to
    re-order Qdrant's initial hybrid-search results before answering."""
    if not documents:
        return []
    return _RerankerModel().score(query, documents)
