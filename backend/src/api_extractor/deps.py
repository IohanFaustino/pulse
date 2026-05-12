"""FastAPI dependency functions for the Phase 5 API layer.

All dependencies are async-first and use FastAPI's Depends() system.
Redis client is accessed via app.state (set in lifespan in main.py).
Database sessions are yielded from async_session_factory.

Usage in router::

    @router.get("/series")
    async def list_series(
        session: Annotated[AsyncSession, Depends(get_session)],
        transform_svc: Annotated[TransformService, Depends(get_transform_service)],
    ) -> ...:
        ...
"""

from __future__ import annotations

from typing import Annotated

import redis.asyncio as aioredis
from fastapi import Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession

from api_extractor.db import async_session_factory
from api_extractor.services.extraction_service import ExtractionService
from api_extractor.transforms.cache import RedisCache
from api_extractor.transforms.service import TransformService


# ── Database session ──────────────────────────────────────────────────────────

async def get_session() -> AsyncSession:  # type: ignore[return]
    """Yield an async database session for the duration of a request.

    Commits on clean exit, rolls back on exception, always closes.
    """
    async with async_session_factory() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()


# ── Redis client ──────────────────────────────────────────────────────────────

def get_redis(request: Request) -> aioredis.Redis:  # type: ignore[type-arg]
    """Return the Redis client stored on app.state (opened during lifespan).

    Accessing app.state.redis before lifespan has run will raise AttributeError.
    In tests, override this dependency to inject a mock/real test client.
    """
    return request.app.state.redis


# ── Transform service ─────────────────────────────────────────────────────────

def get_transform_service(
    redis_client: Annotated[aioredis.Redis, Depends(get_redis)],  # type: ignore[type-arg]
) -> TransformService:
    """Build a TransformService bound to the request-scoped Redis client."""
    cache = RedisCache(redis_client)
    return TransformService(cache)


# ── Extraction service ────────────────────────────────────────────────────────

def get_extraction_service(
    session: Annotated[AsyncSession, Depends(get_session)],
) -> ExtractionService:
    """Build an ExtractionService bound to the request-scoped DB session."""
    return ExtractionService(session)


# ── Typed dependency aliases (for cleaner router signatures) ──────────────────

SessionDep = Annotated[AsyncSession, Depends(get_session)]
RedisDep = Annotated[aioredis.Redis, Depends(get_redis)]  # type: ignore[type-arg]
TransformServiceDep = Annotated[TransformService, Depends(get_transform_service)]
ExtractionServiceDep = Annotated[ExtractionService, Depends(get_extraction_service)]
