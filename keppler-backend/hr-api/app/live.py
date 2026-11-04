"""Live attendance fan-out over Redis pub/sub, one channel per tenant.

The SSE endpoint subscribes to its caller's tenant channel only; there is no
way to name another tenant's channel from the request."""

import json
import uuid

import redis
import redis.asyncio as aioredis

from app.config import settings

_sync_client: redis.Redis | None = None


def channel(tenant_id: uuid.UUID) -> str:
    return f"hr:live:{tenant_id}"


def publish(tenant_id: uuid.UUID, message: dict) -> None:
    global _sync_client
    if _sync_client is None:
        _sync_client = redis.Redis.from_url(settings.redis_url, socket_timeout=2)
    _sync_client.publish(channel(tenant_id), json.dumps(message))


def async_client() -> aioredis.Redis:
    return aioredis.Redis.from_url(settings.redis_url)
