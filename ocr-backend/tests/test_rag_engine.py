"""RAG engine checks (Phase 9). Two parts, matching this repo's existing
test-script convention (see test_summarizer.py — plain scripts, not pytest):

1. Pure-unit checks for _split_chunk's table-aware logic — deterministic,
   no infra needed.
2. A live-infra smoke test exercising ingest_document/_retrieve against the
   real Qdrant + embedding/reranker stack, with its own cleanup.
"""
import asyncio

from modules.rag_engine import (
    MAX_CHUNK_CHARS,
    NOT_RELEVANT_MESSAGE,
    _split_chunk,
    delete_document,
    ingest_document,
    list_documents,
    query,
)

# ─── Part 1: table-aware chunking (pure unit, no infra) ────────────────────

def _make_table(n_rows: int) -> str:
    header = "| Drug | Dose | Frequency | Notes |"
    sep = "|---|---|---|---|"
    rows = [f"| Drug{i} | {i*10}mg | {i}x daily | padding padding padding text {i} |" for i in range(n_rows)]
    return "\n".join([header, sep] + rows)


def _assert_no_row_split(chunks):
    for c in chunks:
        for line in c.split("\n"):
            if line.startswith("|") and "---" not in line:
                # Every '|'-row must have the same pipe count as a real row (4 cols -> 5 pipes).
                assert line.count("|") == 5, f"row looks truncated: {line!r}"


print("=== Part 1: table-aware chunking (unit) ===")

small = "Just a short note."
assert _split_chunk(small) == [small]
print("PASS: small text passes through unchanged")

table_text = _make_table(40)
assert len(table_text) > MAX_CHUNK_CHARS
full_text = "Patient medication list follows.\n\n" + table_text + "\n\nEnd of report."
chunks = _split_chunk(full_text)
assert len(chunks) > 1, "expected the oversized table to force multiple chunks"
_assert_no_row_split(chunks)
table_chunks = [c for c in chunks if "Drug0" in c or "| Drug" in c]
assert any("| Drug |" in c for c in table_chunks), "header should repeat in the first table chunk"
print(f"PASS: oversized table split into {len(chunks)} chunks, no row truncated, header preserved")

plain_paras = [f"Paragraph {i} with filler content padding padding padding." for i in range(40)]
plain_text = "\n\n".join(plain_paras)
plain_chunks = _split_chunk(plain_text)
assert all(len(c) <= MAX_CHUNK_CHARS for c in plain_chunks)
assert "\n\n".join(plain_chunks) == plain_text, "paragraph order/content must be preserved for non-table text"
print(f"PASS: plain oversized text (no tables) splits into {len(plain_chunks)} chunks, order preserved")


# ─── Part 2: live smoke test (real Qdrant + embedding/reranker stack) ──────

print("\n=== Part 2: live smoke test ===")

TEST_USER_ID = -999001  # negative, out-of-range for real users — never collides with a real account
TEST_DOC_ID = -999001


async def _live_smoke():
    n = ingest_document(
        TEST_USER_ID, TEST_DOC_ID, "test_rag_engine.py fixture", "manual",
        [("Text", "The test patient was prescribed Amoxicillin 250mg three times daily for a throat infection.")],
    )
    assert n == 1, f"expected 1 chunk ingested, got {n}"
    print(f"PASS: ingested {n} chunk(s)")

    docs = list_documents(TEST_USER_ID)
    assert any(d["doc_id"] == TEST_DOC_ID for d in docs), "ingested doc should appear in list_documents"
    print("PASS: list_documents shows the ingested doc")

    result = await query(TEST_USER_ID, "What medication was prescribed?")
    assert "Amoxicillin" in result["answer"], f"expected grounded answer, got: {result['answer']!r}"
    assert result["citations"], "expected at least one citation"
    print(f"PASS: on-topic query grounded correctly: {result['answer']!r}")

    off_topic = await query(TEST_USER_ID, "What is the weather forecast for tomorrow?")
    assert off_topic["answer"] == NOT_RELEVANT_MESSAGE, f"expected relevance-floor message, got: {off_topic['answer']!r}"
    assert off_topic["citations"] == []
    print("PASS: off-topic query correctly returns the not-relevant message, not a hallucinated answer")

    removed = delete_document(TEST_USER_ID, TEST_DOC_ID)
    assert removed == 1
    docs_after = list_documents(TEST_USER_ID)
    assert not any(d["doc_id"] == TEST_DOC_ID for d in docs_after)
    print("PASS: delete_document removes it from the knowledge base")


try:
    asyncio.run(_live_smoke())
finally:
    # Best-effort cleanup even if an assertion failed mid-way.
    delete_document(TEST_USER_ID, TEST_DOC_ID)

print("\nAll RAG engine checks passed.")
