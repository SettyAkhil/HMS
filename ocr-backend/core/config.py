import os
from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    """Core Platform Configuration Settings"""
    
    # Platform Metadata
    APP_NAME: str = "Keppler Medical Document Intelligence Platform"
    APP_VERSION: str = "2.0.0"
    
    # Inference Endpoints
    VLLM_BASE_URL: str = os.getenv("VLLM_BASE_URL", "http://localhost:8000/v1")
    QWEN_OCR_MODEL: str = os.getenv("QWEN_OCR_MODEL", "qwen2.5-vl-7b")

    # Model Router (core/model_router.py) — per-role model config. Vision/OCR,
    # summarization, chat, and entity-extraction all currently resolve to the
    # single available vLLM deployment (one shared GPU has no room for five
    # separate 7B-class models); embedding/reranking get real dedicated small
    # models since those are cheap enough to run alongside it.
    VISION_MODEL: str = os.getenv("VISION_MODEL", "qwen2.5-vl-7b")
    SUMMARY_MODEL: str = os.getenv("SUMMARY_MODEL", "qwen2.5-vl-7b")
    CHAT_MODEL: str = os.getenv("CHAT_MODEL", "qwen2.5-vl-7b")
    ENTITY_MODEL: str = os.getenv("ENTITY_MODEL", "qwen2.5-vl-7b")
    EMBEDDING_MODEL: str = os.getenv("EMBEDDING_MODEL", "BAAI/bge-m3")
    RERANKER_MODEL: str = os.getenv("RERANKER_MODEL", "BAAI/bge-reranker-v2-m3")

    # RAG (Phase 4) — Qdrant vector DB, host port matches docker-compose's published port.
    QDRANT_URL: str = os.getenv("QDRANT_URL", "http://localhost:6333")
    QDRANT_COLLECTION: str = os.getenv("QDRANT_COLLECTION", "keppler_documents")

    # Infrastructure (Redis + Celery)
    REDIS_URL: str = os.getenv("REDIS_URL", "redis://localhost:6379/0")
    CELERY_BROKER_URL: str = os.getenv("CELERY_BROKER_URL", REDIS_URL)
    CELERY_RESULT_BACKEND: str = os.getenv("CELERY_RESULT_BACKEND", REDIS_URL)
    
    # Database — Postgres by default (docker-compose service "postgres"); override
    # DATABASE_URL for a different host, or point at sqlite:///./keppler_platform.db
    # for a dependency-free local run (no resumable/multi-worker guarantees on sqlite).
    # Host-side default targets docker-compose's published port (5433 — the
    # container's internal 5432 is remapped because host 5432 is already in use
    # by another local service). Inside docker-compose, DATABASE_URL is
    # overridden to postgres:5432 (the internal service network).
    DATABASE_URL: str = os.getenv(
        "DATABASE_URL", "postgresql+psycopg://keppler:keppler@localhost:5433/keppler"
    )

    # File Storage
    UPLOAD_DIR: str = os.path.join(os.path.dirname(os.path.dirname(__file__)), "uploads")

    # Auth
    JWT_SECRET_KEY: str = os.getenv("JWT_SECRET_KEY", "dev-only-insecure-secret-change-me")

    # Encryption at rest for uploads/ (Phase 6) — core/encryption.py. A Fernet
    # key (32 url-safe base64 bytes); losing/rotating this makes every
    # previously-encrypted upload unreadable, so back it up like a real secret
    # in production. Dev-only default generated for this repo — override via
    # env/`.env` for any real deployment.
    UPLOAD_ENCRYPTION_KEY: str = os.getenv(
        "UPLOAD_ENCRYPTION_KEY", "Q_wCWKPOyKyIUCPDkuZx4K3M_x4UV6WPi4qjnhCbAvw="
    )

    class Config:
        env_file = ".env"
        extra = "ignore"

# Initialize global singleton
settings = Settings()

# Ensure critical directories exist
os.makedirs(settings.UPLOAD_DIR, exist_ok=True)


# ---------------------------------------------------------------------------
# Served-model resolution
# ---------------------------------------------------------------------------
# Model names are configured (and in places hardcoded) as "qwen2.5-vl-7b", but
# the vLLM deployment on a given machine may serve a different model -- this
# one serves "qwen3-vl-8b". vLLM answers a request for a model it does not
# serve with a 404, and the summarizer swallowed that per chunk, so every
# summary came back as "Not documented" with no visible error. Ask the server
# what it actually serves and fall back to that.
_served_models_cache = {"ids": None, "at": 0.0}


def served_model(preferred: str) -> str:
    """The model name to send to vLLM: `preferred` if the server serves it,
    otherwise the first model it does serve. If the server cannot be asked,
    `preferred` is returned unchanged."""
    import json
    import time
    import urllib.request

    now = time.time()
    ids = _served_models_cache["ids"]
    # Re-ask every minute, or every 10s while the server was unreachable.
    ttl = 60.0 if ids else 10.0
    if ids is None or now - _served_models_cache["at"] > ttl:
        try:
            url = settings.VLLM_BASE_URL.rstrip("/") + "/models"
            with urllib.request.urlopen(url, timeout=3) as resp:
                ids = [m["id"] for m in json.load(resp).get("data", [])]
        except Exception:
            ids = []
        _served_models_cache.update(ids=ids, at=now)

    if not ids or preferred in ids:
        return preferred
    return ids[0]
