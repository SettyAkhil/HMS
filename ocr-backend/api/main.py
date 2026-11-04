import asyncio
import logging
import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware

from core.config import settings
from core.rate_limit import limiter
from database.db_utils import initialize_extended_schema
from api.routers import admin, assistant, auth, dashboard, ocr, summarizer, vault

logger = logging.getLogger(__name__)

app = FastAPI(title=settings.APP_NAME, version=settings.APP_VERSION)

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
app.add_middleware(SlowAPIMiddleware)


def _warm_rag_models():
    """Only the CPU-only sparse (BM25) model is warmed here — it costs zero
    GPU memory, so there's no downside. BGE-M3/BGE-Reranker are deliberately
    NOT pre-loaded anymore: this GPU is already tight (vLLM's vision model +
    the Celery worker's own copy of these same models leave very little
    headroom), and permanently reserving another ~6GB for the API process
    was found to starve the OCR pipeline's TrOCR handwriting fallback of GPU
    memory — confirmed live via a real "CUDA error: out of memory" failure
    loading TrOCR for a real user's document immediately after this warmup
    was added. Chat's first-message latency cost (a few seconds, lazy-loaded
    on first real use) is the correct trade against silently degrading OCR
    accuracy on hard/handwritten documents — never trade correctness for
    speed on a shared, memory-constrained GPU."""
    try:
        from modules.rag_engine import warm_sparse_model
        warm_sparse_model()
        logger.info("Sparse (BM25) model warmed at startup (CPU-only, no GPU cost).")
    except Exception as e:
        logger.warning(f"Sparse model warmup failed, will lazy-load on first use instead: {e}")


@app.on_event("startup")
async def on_startup():
    # Ensures the users/chat_history/universal_docs tables exist.
    initialize_extended_schema()
    await asyncio.to_thread(_warm_rag_models)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173",
                   "http://localhost:7620", "http://127.0.0.1:7620",
                   "http://localhost:3000", "http://127.0.0.1:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(ocr.router)
app.include_router(summarizer.router)
app.include_router(vault.router)
app.include_router(assistant.router)
app.include_router(dashboard.router)
app.include_router(admin.router)


@app.get("/api/v1/health")
async def health():
    return {"status": "ok", "app": settings.APP_NAME, "version": settings.APP_VERSION}

from fastapi.responses import FileResponse
@app.get("/favicon.ico", include_in_schema=False)
async def favicon():
    return FileResponse("Keppler.jpeg", media_type="image/jpeg")


# Serve the built React frontend (Frontend OCR/dist) if present — e.g. in the
# Docker image, where it's built in a separate stage. In local dev, run the
# Vite dev server separately instead (npm run dev); this mount is skipped.
_FRONTEND_DIST = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "Frontend OCR", "dist"
)

@app.get("/api/v1/debug")
async def debug():
    from database.models import ExtractionJob, SessionLocal
    db = SessionLocal()
    try:
        jobs = db.query(ExtractionJob).order_by(ExtractionJob.created_at.desc()).limit(5).all()
        return [{"id": j.job_id, "status": j.status, "err": j.error_message, "progress": j.progress} for j in jobs]
    finally:
        db.close()

if os.path.isdir(_FRONTEND_DIST):
    app.mount("/", StaticFiles(directory=_FRONTEND_DIST, html=True), name="frontend")
