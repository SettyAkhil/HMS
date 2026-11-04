"""LightRAG-backed knowledge-graph chat for the Symptom AI "Ask About Your Documents" tab.

Wires LightRAG directly to the existing ai/service.py llm_provider and
utils/embeddings.py via asyncio.to_thread -- deliberately skips litellm, which would
otherwise be pulled in purely to re-route calls to a provider this codebase already
calls directly. One LightRAG instance per (hospital, user), each with its own
persistent on-disk workspace, so knowledge graphs never cross tenant or user boundaries.
"""

from __future__ import annotations

import asyncio
import os
import re
import threading

import numpy as np
from lightrag import LightRAG, QueryParam
from lightrag.utils import EmbeddingFunc

from utils.embeddings import generate_embedding
from .service import llm_provider

EMBEDDING_DIM = int(os.getenv("RAG_EMBEDDING_DIM", "768"))
WORKSPACE_ROOT = os.path.join(
    os.path.dirname(os.path.dirname(__file__)), "rag_workspaces"
)

_llm_provider = llm_provider


def _safe_workspace_segment(value: str) -> str:
    return re.sub(r"[^a-zA-Z0-9_-]", "_", str(value or "unknown"))


def workspace_key(hospital_id, username: str) -> str:
    return f"hospital_{_safe_workspace_segment(hospital_id)}_user_{_safe_workspace_segment(username)}"


async def _rag_llm_func(prompt, system_prompt=None, history_messages=None, **_kwargs):
    """Async LLM callable LightRAG uses for entity extraction, summarization, and querying."""
    parts = []
    if system_prompt:
        parts.append(system_prompt)
    for message in history_messages or []:
        role = message.get("role", "user")
        content = message.get("content", "")
        parts.append(f"{role}: {content}")
    context = "\n\n".join(parts)

    def _call():
        return _llm_provider.generate(prompt, context=context)

    result = await asyncio.to_thread(_call)
    if not result:
        raise RuntimeError("RAG LLM call returned no content.")
    return result


async def _rag_embedding_func(texts):
    """Async embedding callable LightRAG uses for chunk/entity/relation vectors."""

    def _call():
        vectors = []
        for text in texts:
            vector = generate_embedding(text)
            vectors.append(vector or [0.0] * EMBEDDING_DIM)
        return vectors

    vectors = await asyncio.to_thread(_call)
    return np.array(vectors, dtype=float)


_RAG_INSTANCES: dict[str, LightRAG] = {}

# LightRAG's internal worker pools (priority queues, async workers) are bound to whichever
# event loop was running when initialize_storages() created them -- a fresh asyncio.run()
# per Flask request would create a new loop each time and break on the second call with
# "bound to a different event loop". So instead, run every LightRAG operation for the
# process's lifetime on one persistent background loop, matching the pattern LightRAG's own
# examples use for non-async-native hosts (originally Streamlit; equally true under
# Flask/WSGI, which doesn't run its own event loop).
_bg_loop: asyncio.AbstractEventLoop | None = None
_bg_loop_lock = threading.Lock()


def _run_bg_loop(loop: asyncio.AbstractEventLoop):
    asyncio.set_event_loop(loop)
    loop.run_forever()


def _get_bg_loop() -> asyncio.AbstractEventLoop:
    global _bg_loop
    if _bg_loop is None:
        with _bg_loop_lock:
            if _bg_loop is None:
                loop = asyncio.new_event_loop()
                thread = threading.Thread(
                    target=_run_bg_loop, args=(loop,), daemon=True
                )
                thread.start()
                _bg_loop = loop
    return _bg_loop


def _run_on_bg_loop(coroutine):
    """Submit a coroutine to the persistent background loop and block for its result."""
    loop = _get_bg_loop()
    future = asyncio.run_coroutine_threadsafe(coroutine, loop)
    return future.result()


async def get_rag_instance(key: str) -> LightRAG:
    if key not in _RAG_INSTANCES:
        working_dir = os.path.join(WORKSPACE_ROOT, key)
        os.makedirs(working_dir, exist_ok=True)
        rag = LightRAG(
            working_dir=working_dir,
            llm_model_func=_rag_llm_func,
            embedding_func=EmbeddingFunc(
                embedding_dim=EMBEDDING_DIM,
                max_token_size=8192,
                func=_rag_embedding_func,
            ),
        )
        await rag.initialize_storages()
        _RAG_INSTANCES[key] = rag
    return _RAG_INSTANCES[key]


async def _ainsert_text(key: str, text: str):
    rag = await get_rag_instance(key)
    await rag.ainsert(text)


async def _aquery_graph(key: str, query: str, mode: str = "hybrid") -> str:
    rag = await get_rag_instance(key)
    response = await rag.aquery(query, param=QueryParam(mode=mode))
    return response


def insert_text_into_graph(key: str, text: str):
    """Synchronous entry point for Flask route handlers."""
    _run_on_bg_loop(_ainsert_text(key, text))


def query_graph(key: str, query: str, mode: str = "hybrid") -> str:
    return _run_on_bg_loop(_aquery_graph(key, query, mode=mode))


def is_configured() -> bool:
    return _llm_provider.is_configured()
