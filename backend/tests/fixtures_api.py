"""Shared fixtures for API endpoint tests (Phase 5).

These fixtures override FastAPI dependencies to use per-test DB sessions
and a live Redis client. This avoids event-loop binding issues with the
module-level SQLAlchemy engine in db.py.

Import in each API test file::

    from tests.fixtures_api import api_client, override_deps  # noqa: F401
"""

from __future__ import annotations

import os

import pytest_asyncio
import redis.asyncio as aioredis
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

_DB_URL = os.environ.get(
    "DATABASE_URL",
    "postgresql+asyncpg://postgres:postgres@postgres:5432/api_extractor",
)
_REDIS_URL = os.environ.get("REDIS_URL", "redis://redis:6379/0")


@pytest_asyncio.fixture()
async def api_client():
    """AsyncClient against the FastAPI app with dependency overrides for DB and Redis.

    - get_session overridden with a per-test engine/session.
    - get_redis overridden with a live Redis client.
    Both are created fresh per test to avoid event-loop cross-contamination.
    """
    from api_extractor.deps import get_redis, get_session
    from api_extractor.main import app

    # Create a fresh engine for this test's event loop.
    test_engine = create_async_engine(
        _DB_URL,
        pool_pre_ping=True,
        pool_size=2,
        max_overflow=2,
    )
    factory = async_sessionmaker(
        bind=test_engine,
        class_=AsyncSession,
        expire_on_commit=False,
        autoflush=False,
        autocommit=False,
    )

    async def _get_session():  # type: ignore[return]
        async with factory() as session:
            try:
                yield session
                await session.commit()
            except Exception:
                await session.rollback()
                raise
            finally:
                await session.close()

    # Fresh Redis client per test.
    redis_client = aioredis.from_url(
        _REDIS_URL,
        encoding="utf-8",
        decode_responses=False,
    )

    def _get_redis():
        return redis_client

    app.dependency_overrides[get_session] = _get_session
    app.dependency_overrides[get_redis] = _get_redis

    try:
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as ac:
            yield ac
    finally:
        app.dependency_overrides.pop(get_session, None)
        app.dependency_overrides.pop(get_redis, None)
        await redis_client.aclose()
        await test_engine.dispose()
