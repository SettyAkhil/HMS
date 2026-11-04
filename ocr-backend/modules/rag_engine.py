"""
Production RAG — Phase 4. Replaces modules/rag_chatbot.py's per-call LightRAG
instantiation (a fresh on-disk knowledge graph rebuilt from scratch on every
insert/query, no citations, embeddings routed at a model that was never
actually served — see Phase 1 exploration notes) with a persistent Qdrant
collection, real BGE-M3 embeddings and BGE-Reranker-v2-m3 reranking (both via
core/model_router.py), and grounded answers with citations back to the
source document/page.

Design:
  - One Qdrant collection (settings.QDRANT_COLLECTION), 1024-dim (BGE-M3),
    cosine distance. Every point is tagged with user_id so a query only ever
    searches that user's own ingested documents (multi-tenant isolation).
  - Ingestion chunks at the PAGE level (the natural unit the OCR/summarizer
    pipelines already produce — see api/routers/assistant.py), further
    splitting any oversized page on paragraph boundaries.
  - Point IDs are deterministic (hash of doc_id/page/chunk-index) so
    re-ingesting the same document overwrites its old chunks instead of
    duplicating them.
  - Retrieval: embed the question, vector-search top_k candidates, rerank
    down to rerank_top_n with BGE-Reranker, build a numbered context block
    per source, ask the chat model to answer *only* from that context. Every
    source actually placed in the context is returned as a citation — not
    just the ones the model happened to reference — so "grounded" is a
    guarantee about what was available, not a hope about what the model
    chose to cite.
"""
import hashlib
import json
import logging
import re
from typing import List, Optional, TypedDict

from qdrant_client import QdrantClient
from qdrant_client.http import models as qmodels

from core.config import settings
from core.model_router import Role, embed_texts, get_client_for_role, model_name_for_role, rerank

logger = logging.getLogger(__name__)

EMBEDDING_DIM = 1024  # BGE-M3 dense vector size
MAX_CHUNK_CHARS = 2000  # oversized pages get split further, on paragraph boundaries

# Recalibrated (Phase 10) after finding the original 0.1 floor — calibrated
# only against one clean, prose-heavy discharge summary (on-topic 0.26-0.52,
# off-topic <=0.01) — incorrectly rejected genuine on-topic questions against
# a real, much terser/noisier document (a dental Rx slip with clinic
# letterhead and inline OCR entity-correction brackets): "What medications
# were prescribed?" scored only 0.017 there despite the chunk containing the
# exact answer. The reranker's absolute score scale is document-style
# dependent, not just topic-relevance dependent — there is no floor value
# that perfectly separates on/off-topic across every document style found so
# far (weakly-phrased questions against noisy/terse chunks can still score
# under this floor and get a false "not relevant"). 0.015 is the safest
# compromise found: it sits just above every off-topic score observed across
# both a clean document (<=0.0112) and a noisy one (<=0.00003), so it still
# never accepts a genuinely off-topic question, while recovering the messy
# real-world document that motivated this fix.
RERANK_SCORE_FLOOR = 0.015


class Citation(TypedDict):
    doc_id: int
    filename: str
    page_label: str
    snippet: str


_client: Optional[QdrantClient] = None

DENSE_VECTOR_NAME = "dense"  # BGE-M3, semantic search
SPARSE_VECTOR_NAME = "bm25"  # fastembed Qdrant/bm25, exact-term search (drug
                              # codes, dosages, dates — tokens dense embeddings
                              # can dilute away). CPU-only, no GPU cost.


def get_qdrant_client() -> QdrantClient:
    global _client
    if _client is None:
        _client = QdrantClient(url=settings.QDRANT_URL)
    return _client


class _SparseEmbeddingModel:
    """fastembed's statistical BM25 sparse model — CPU-only (onnxruntime, no
    torch/GPU), consistent with the single-shared-GPU constraint documented
    in core/model_router.py. Singleton, same pattern as _EmbeddingModel/
    _RerankerModel there, but kept local to this module since it's only ever
    used by RAG (not a general model_router role)."""
    _instance = None

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
            cls._instance._initialized = False
        return cls._instance

    def __init__(self):
        if self._initialized:
            return
        from fastembed import SparseTextEmbedding
        self.model = SparseTextEmbedding(model_name="Qdrant/bm25")
        self._initialized = True

    def embed_documents(self, texts: List[str]) -> list:
        return list(self.model.embed(texts))

    def embed_query(self, text: str):
        return list(self.model.query_embed([text]))[0]


def _sparse_vector(embedding) -> qmodels.SparseVector:
    return qmodels.SparseVector(indices=embedding.indices.tolist(), values=embedding.values.tolist())


def warm_sparse_model():
    """Forces the sparse (BM25) model to load now instead of on first real
    use — see api/main.py's startup hook for why."""
    _SparseEmbeddingModel().embed_query("warmup")


def ensure_collection():
    client = get_qdrant_client()
    if not client.collection_exists(settings.QDRANT_COLLECTION):
        client.create_collection(
            collection_name=settings.QDRANT_COLLECTION,
            vectors_config={DENSE_VECTOR_NAME: qmodels.VectorParams(size=EMBEDDING_DIM, distance=qmodels.Distance.COSINE)},
            sparse_vectors_config={SPARSE_VECTOR_NAME: qmodels.SparseVectorParams()},
        )
        client.create_payload_index(
            settings.QDRANT_COLLECTION, field_name="user_id", field_schema=qmodels.PayloadSchemaType.INTEGER
        )
        client.create_payload_index(
            settings.QDRANT_COLLECTION, field_name="doc_id", field_schema=qmodels.PayloadSchemaType.INTEGER
        )
        logger.info(f"Created Qdrant collection {settings.QDRANT_COLLECTION}")


_TABLE_SEP_RE = re.compile(r'^\s*\|?[\s:|-]+\|[\s:|-]*\|?\s*$')


def _segment_tables(text: str) -> List[tuple]:
    """Splits text into ('text'|'table', content) segments. A table segment
    starts at a '|'-row immediately followed by a markdown separator row
    (e.g. |---|---|) and extends through all subsequent contiguous
    '|'-containing lines, so a table is always handled as one atomic unit
    downstream rather than fragmented by paragraph-boundary splitting."""
    lines = text.split("\n")
    segments: List[tuple] = []
    buf: List[str] = []
    i, n = 0, len(lines)
    while i < n:
        if "|" in lines[i] and i + 1 < n and _TABLE_SEP_RE.match(lines[i + 1]):
            if buf:
                segments.append(("text", "\n".join(buf)))
                buf = []
            table_lines = [lines[i], lines[i + 1]]
            j = i + 2
            while j < n and "|" in lines[j]:
                table_lines.append(lines[j])
                j += 1
            segments.append(("table", "\n".join(table_lines)))
            i = j
        else:
            buf.append(lines[i])
            i += 1
    if buf:
        segments.append(("text", "\n".join(buf)))
    return segments


def _split_table_rows(table_text: str) -> List[str]:
    """Splits an oversized table only between whole rows — never mid-row —
    repeating the header + separator row in each part so every resulting
    chunk is independently readable (has its own column labels)."""
    lines = table_text.split("\n")
    if len(table_text) <= MAX_CHUNK_CHARS or len(lines) <= 2:
        return [table_text]
    header = "\n".join(lines[:2])
    parts, rows, length = [], [], len(header)
    for row in lines[2:]:
        if length + len(row) + 1 > MAX_CHUNK_CHARS and rows:
            parts.append(header + "\n" + "\n".join(rows))
            rows, length = [], len(header)
        rows.append(row)
        length += len(row) + 1
    if rows:
        parts.append(header + "\n" + "\n".join(rows))
    return parts


def _split_chunk(text: str) -> List[str]:
    """Splits an oversized page into MAX_CHUNK_CHARS-ish pieces. Markdown
    tables are detected (_segment_tables) and kept atomic: splitting only
    happens on paragraph boundaries outside a table, or between whole rows
    if a single table alone exceeds the limit (_split_table_rows) — never
    mid-row. Pages under the limit pass through unchanged."""
    if len(text) <= MAX_CHUNK_CHARS:
        return [text]

    units: List[str] = []
    for kind, content in _segment_tables(text):
        if kind == "table":
            units.extend(_split_table_rows(content))
        else:
            units.extend(p for p in content.split("\n\n") if p.strip())

    parts, current = [], ""
    for unit in units:
        if len(current) + len(unit) + 2 > MAX_CHUNK_CHARS and current:
            parts.append(current)
            current = unit
        else:
            current = f"{current}\n\n{unit}" if current else unit
    if current:
        parts.append(current)
    return parts


def _point_id(doc_id: int, page_label: str, chunk_idx: int) -> str:
    return hashlib.md5(f"{doc_id}:{page_label}:{chunk_idx}".encode()).hexdigest()


def ingest_document(user_id: int, doc_id: int, filename: str, category: str, page_chunks: List[tuple]):
    """page_chunks: list of (page_label, text) — the natural unit the OCR/
    summarizer pipelines already produce. Empty/near-empty pages are skipped."""
    ensure_collection()
    client = get_qdrant_client()

    units = []  # (page_label, chunk_idx, text)
    for page_label, text in page_chunks:
        if not text or len(text.strip()) < 10:
            continue
        for i, sub in enumerate(_split_chunk(text)):
            units.append((page_label, i, sub))

    if not units:
        logger.warning(f"ingest_document: no non-empty chunks for doc {doc_id} ({filename})")
        return 0

    texts = [u[2] for u in units]
    dense_vectors = embed_texts(texts)
    sparse_vectors = _SparseEmbeddingModel().embed_documents(texts)

    points = [
        qmodels.PointStruct(
            id=_point_id(doc_id, page_label, chunk_idx),
            vector={DENSE_VECTOR_NAME: dense_vec, SPARSE_VECTOR_NAME: _sparse_vector(sparse_vec)},
            payload={
                "user_id": user_id,
                "doc_id": doc_id,
                "filename": filename,
                "category": category,
                "page_label": page_label,
                "chunk_index": chunk_idx,
                "text": text,
            },
        )
        for (page_label, chunk_idx, text), dense_vec, sparse_vec in zip(units, dense_vectors, sparse_vectors)
    ]
    client.upsert(collection_name=settings.QDRANT_COLLECTION, points=points)
    logger.info(f"Ingested {len(points)} chunks for doc {doc_id} ({filename})")
    return len(points)


class KBDocument(TypedDict):
    doc_id: int
    filename: str
    category: str
    chunk_count: int


def list_documents(user_id: int) -> List[KBDocument]:
    """Documents currently ingested for this user, aggregated from Qdrant
    payloads by doc_id — there's no separate 'ingested documents' table, the
    Qdrant points themselves are the source of truth."""
    ensure_collection()
    client = get_qdrant_client()

    by_doc: dict = {}
    offset = None
    while True:
        points, offset = client.scroll(
            collection_name=settings.QDRANT_COLLECTION,
            scroll_filter=qmodels.Filter(
                must=[qmodels.FieldCondition(key="user_id", match=qmodels.MatchValue(value=user_id))]
            ),
            limit=256,
            offset=offset,
            with_payload=["doc_id", "filename", "category"],
        )
        for p in points:
            d = p.payload
            entry = by_doc.setdefault(
                d["doc_id"], {"doc_id": d["doc_id"], "filename": d["filename"], "category": d["category"], "chunk_count": 0}
            )
            entry["chunk_count"] += 1
        if offset is None:
            break
    return list(by_doc.values())


def delete_document(user_id: int, doc_id: int) -> int:
    """Removes a document from the RAG index. Filtered by BOTH user_id and
    doc_id (never doc_id alone) so a user can never delete another tenant's
    vectors, even if they guess/enumerate a valid doc_id."""
    ensure_collection()
    client = get_qdrant_client()

    existing = list_documents(user_id)
    if not any(d["doc_id"] == doc_id for d in existing):
        return 0

    client.delete(
        collection_name=settings.QDRANT_COLLECTION,
        points_selector=qmodels.FilterSelector(
            filter=qmodels.Filter(
                must=[
                    qmodels.FieldCondition(key="user_id", match=qmodels.MatchValue(value=user_id)),
                    qmodels.FieldCondition(key="doc_id", match=qmodels.MatchValue(value=doc_id)),
                ]
            )
        ),
    )
    return 1


# Absolute last resort only — used when the LLM call itself fails (e.g. vLLM
# unreachable), never as a substitute for actually asking the model. Every
# normal call, with or without an attached document, goes through Role.CHAT.
_FALLBACK_SUGGESTIONS = [
    "Summarize this document",
    "What is the primary diagnosis?",
    "List any medications mentioned",
    "What lab values are out of reference range?",
]


def _sample_text(user_id: int, doc_ids: List[int], limit: int = 6) -> str:
    """Real content sample from the given docs' Qdrant-stored chunks, or ""
    if nothing is ingested/found for them."""
    ensure_collection()
    client = get_qdrant_client()
    try:
        points, _ = client.scroll(
            collection_name=settings.QDRANT_COLLECTION,
            scroll_filter=qmodels.Filter(
                must=[
                    qmodels.FieldCondition(key="user_id", match=qmodels.MatchValue(value=user_id)),
                    qmodels.FieldCondition(key="doc_id", match=qmodels.MatchAny(any=doc_ids)),
                ]
            ),
            limit=limit,
            with_payload=True,
        )
    except Exception:
        return ""
    if not points:
        return ""
    return "\n\n---\n\n".join(p.payload["text"] for p in points)[:4000]


async def suggest_questions(user_id: int, doc_ids: List[int], n: int = 4) -> List[str]:
    """Always asks the real chat model (Role.CHAT) for suggestions — grounded
    in a real content sample when a document is attached, or general
    medical-assistant starter questions when nothing is attached yet. Only
    falls back to a static list if the model call itself errors out."""
    sample = _sample_text(user_id, doc_ids) if doc_ids else ""

    if sample:
        prompt = (
            f"Here is a sample of a document's content:\n\n{sample}\n\n"
            f"Suggest exactly {n} short, specific questions a user might realistically ask about THIS "
            f"document's actual content — not generic questions. Return ONLY a JSON array of {n} strings, "
            f"no other text, no markdown fences."
        )
    else:
        prompt = (
            f"You are the suggestion generator for a healthcare document AI assistant (OCR + RAG chat "
            f"over medical records). No document is attached to this conversation yet. Suggest exactly "
            f"{n} short, useful example questions that show what this assistant can do once a document is "
            f"loaded (e.g. about diagnoses, medications, lab values, summaries). Return ONLY a JSON array "
            f"of {n} strings, no other text, no markdown fences."
        )

    try:
        client_llm = get_client_for_role(Role.CHAT)
        resp = await client_llm.chat.completions.create(
            model=model_name_for_role(Role.CHAT),
            messages=[{"role": "user", "content": prompt}],
            temperature=0.5,
            max_tokens=300,
        )
        raw = resp.choices[0].message.content.strip()
        if raw.startswith("```"):
            raw = raw.strip("`").removeprefix("json").strip()
        suggestions = json.loads(raw)
        if isinstance(suggestions, list) and all(isinstance(s, str) for s in suggestions) and suggestions:
            return suggestions[:n]
    except Exception as e:
        logger.warning(f"suggest_questions: model call failed, using static fallback: {e}")

    return _FALLBACK_SUGGESTIONS


# Whole-document questions ("what is this?", "summarize it") have almost no
# semantic content of their own to match against, so similarity-based
# retrieval for them is unreliable — it can rank an essentially-blank chunk
# above the genuinely informative ones purely by chance (confirmed live: for
# a real user's document containing some blank/checkbox-only pages, "what is
# this?" retrieved a blank page as its top hit). These get a different path:
# a broad, page-diverse sample of the document instead of a similarity match.
_BROAD_QUERY_RE = re.compile(
    r"^\s*(what\s+is\s+(this|it)\b|what('?s| is)\s+(this|it)\s+(file|document|about)\b|"
    r"summar(y|i[sz]e)|overview|what does (this|it) (file|document)?\s*(say|contain|cover)|"
    r"tell me about (this|it))",
    re.IGNORECASE,
)


def _broad_sample(user_id: int, doc_ids: Optional[List[int]], max_pages: int = 8) -> tuple:
    """One chunk per distinct page (up to max_pages), for whole-document
    questions where a similarity match against a single chunk doesn't make
    sense. Not a similarity search — no score, no floor; if anything is
    ingested for this filter, this always returns something."""
    ensure_collection()
    client = get_qdrant_client()
    filter_conditions = [qmodels.FieldCondition(key="user_id", match=qmodels.MatchValue(value=user_id))]
    if doc_ids:
        filter_conditions.append(qmodels.FieldCondition(key="doc_id", match=qmodels.MatchAny(any=doc_ids)))

    points, _ = client.scroll(
        collection_name=settings.QDRANT_COLLECTION,
        scroll_filter=qmodels.Filter(must=filter_conditions),
        limit=200,
        with_payload=True,
    )
    if not points:
        return None, []

    seen_pages = set()
    sample = []
    for p in points:
        key = (p.payload["doc_id"], p.payload["page_label"])
        if key in seen_pages:
            continue
        seen_pages.add(key)
        sample.append(p)
        if len(sample) >= max_pages:
            break

    context_blocks = []
    citations: List[Citation] = []
    for i, hit in enumerate(sample, start=1):
        p = hit.payload
        context_blocks.append(f"[{i}] (Source: {p['filename']}, {p['page_label']}):\n{p['text']}")
        citations.append({
            "doc_id": p["doc_id"], "filename": p["filename"],
            "page_label": p["page_label"], "snippet": p["text"][:200],
        })
    return "\n\n".join(context_blocks), citations


async def _retrieve(user_id: int, question: str, top_k: int, rerank_top_n: int, doc_ids: Optional[List[int]] = None):
    """Shared by query() and stream_query(): embed -> vector search (user-
    scoped) -> rerank -> numbered context blocks + matching citations.

    Returns (context, citations) where context is:
      - None            -> nothing ingested at all for this user
      - ""               -> documents are ingested, but nothing cleared
                             RERANK_SCORE_FLOOR for this question
      - non-empty string -> real grounded context
    Callers (query/stream_query) map these to distinct user-facing messages."""
    if _BROAD_QUERY_RE.match(question.strip()):
        context, citations = _broad_sample(user_id, doc_ids)
        if context is not None:
            return context, citations
        # Nothing ingested at all — fall through to the normal path below,
        # which returns the correct None/[] "nothing loaded" result too.

    ensure_collection()
    client = get_qdrant_client()

    filter_conditions = [qmodels.FieldCondition(key="user_id", match=qmodels.MatchValue(value=user_id))]
    if doc_ids:
        filter_conditions.append(qmodels.FieldCondition(key="doc_id", match=qmodels.MatchAny(any=doc_ids)))
    query_filter = qmodels.Filter(must=filter_conditions)

    dense_query = embed_texts([question])[0]
    sparse_query = _sparse_vector(_SparseEmbeddingModel().embed_query(question))

    # Hybrid: dense (semantic) + sparse (exact-term, e.g. drug codes/dosages
    # that dense embeddings can dilute away) candidates, fused server-side
    # with Reciprocal Rank Fusion, then reranked below same as before.
    hits = client.query_points(
        collection_name=settings.QDRANT_COLLECTION,
        prefetch=[
            qmodels.Prefetch(query=dense_query, using=DENSE_VECTOR_NAME, filter=query_filter, limit=top_k),
            qmodels.Prefetch(query=sparse_query, using=SPARSE_VECTOR_NAME, filter=query_filter, limit=top_k),
        ],
        query=qmodels.FusionQuery(fusion=qmodels.Fusion.RRF),
        query_filter=query_filter,
        limit=top_k,
    ).points

    if not hits:
        return None, []

    rerank_scores = rerank(question, [h.payload["text"] for h in hits])
    ranked = sorted(zip(hits, rerank_scores), key=lambda pair: pair[1], reverse=True)[:rerank_top_n]

    if not ranked or ranked[0][1] < RERANK_SCORE_FLOOR:
        return "", []

    context_blocks = []
    citations: List[Citation] = []
    for i, (hit, score) in enumerate(ranked, start=1):
        p = hit.payload
        context_blocks.append(f"[{i}] (Source: {p['filename']}, {p['page_label']}):\n{p['text']}")
        citations.append({
            "doc_id": p["doc_id"],
            "filename": p["filename"],
            "page_label": p["page_label"],
            "snippet": p["text"][:200],
        })

    return "\n\n".join(context_blocks), citations


NO_DOCS_MESSAGE = (
    "I don't have any documents loaded to answer from yet — load a document into the "
    "AI Assistant from the Document Vault first."
)

NOT_RELEVANT_MESSAGE = (
    "I couldn't find anything relevant to that question in your loaded documents."
)

# How many prior chat_history rows to fold into the answer prompt as
# conversation context (3 exchanges = 6 rows: user+assistant per turn).
# Query embedding/retrieval itself is NOT reformulated using history — only
# the final answer prompt sees it (see Phase 9 plan: query-rewrite was
# deliberately deferred as a cheaper-first step).
HISTORY_TURNS = 6


def _build_prompt(context: str, question: str, target_language: str) -> str:
    return (
        f"Context (numbered sources):\n{context}\n\n"
        f"User question: {question}\n\n"
        f"Instructions: Answer using ONLY the information in the numbered sources above. "
        f"Cite sources inline using [N] matching the source numbers. If the answer isn't in the "
        f"provided sources, say so explicitly rather than guessing. Respond in {target_language}."
    )


def _build_messages(context: str, question: str, target_language: str, history: Optional[List[dict]]) -> list:
    """Prior turns (if any) come first so the model can resolve references
    like "it"/"that one" in the current question, then the grounded prompt
    for the current turn. History is trusted app-generated content (saved by
    save_chat_message), not fed in from raw user input at this point."""
    messages = list(history) if history else []
    messages.append({"role": "user", "content": _build_prompt(context, question, target_language)})
    return messages


async def stream_query(user_id: int, question: str, target_language: str = "English",
                        top_k: int = 20, rerank_top_n: int = 5, history: Optional[List[dict]] = None,
                        doc_ids: Optional[List[int]] = None):
    """Async generator: yields {"type": "citations", "citations": [...]} once,
    then {"type": "token", "text": "..."} per generated token, then
    {"type": "done"}. Used by the SSE endpoint (api/routers/assistant.py)."""
    context, citations = await _retrieve(user_id, question, top_k, rerank_top_n, doc_ids)
    yield {"type": "citations", "citations": citations}

    if context is None:
        yield {"type": "token", "text": NO_DOCS_MESSAGE}
        yield {"type": "done"}
        return
    if context == "":
        yield {"type": "token", "text": NOT_RELEVANT_MESSAGE}
        yield {"type": "done"}
        return

    messages = _build_messages(context, question, target_language, history)
    client_llm = get_client_for_role(Role.CHAT)
    stream = await client_llm.chat.completions.create(
        model=model_name_for_role(Role.CHAT),
        messages=messages,
        temperature=0,
        max_tokens=1024,
        stream=True,
    )
    async for chunk in stream:
        delta = chunk.choices[0].delta.content if chunk.choices else None
        if delta:
            yield {"type": "token", "text": delta}
    yield {"type": "done"}


async def query(user_id: int, question: str, target_language: str = "English",
                 top_k: int = 20, rerank_top_n: int = 5, history: Optional[List[dict]] = None,
                 doc_ids: Optional[List[int]] = None) -> dict:
    """Non-streaming variant. Returns {"answer": str, "citations": List[Citation]}."""
    context, citations = await _retrieve(user_id, question, top_k, rerank_top_n, doc_ids)
    if context is None:
        return {"answer": NO_DOCS_MESSAGE, "citations": []}
    if context == "":
        return {"answer": NOT_RELEVANT_MESSAGE, "citations": []}

    messages = _build_messages(context, question, target_language, history)

    client_llm = get_client_for_role(Role.CHAT)
    resp = await client_llm.chat.completions.create(
        model=model_name_for_role(Role.CHAT),
        messages=messages,
        temperature=0,
        max_tokens=1024,
    )
    answer = resp.choices[0].message.content

    return {"answer": answer, "citations": citations}
