"""Tests for POST /admin/extract/{code} endpoint.

Uses dependency overrides to mock the ExtractionService so no live
network calls are made against BCB/IBGE/Yahoo during unit tests.
"""

from __future__ import annotations

import datetime
from unittest.mock import AsyncMock, MagicMock

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient

from api_extractor.main import app
from api_extractor.schemas.admin import ExtractionResultResponse
from api_extractor.services.extraction_service import ExtractionService

# Admin tests use their own client fixture with mock override —
# don't import api_client since we need the mock injected.


def _make_mock_extraction_svc(result: ExtractionResultResponse) -> MagicMock:
    """Build a mock ExtractionService that returns the given result."""
    svc = MagicMock(spec=ExtractionService)
    svc.run_for = AsyncMock(return_value=result)
    return svc


@pytest_asyncio.fixture()
async def client_with_mock_extractor():
    """Client with ExtractionService overridden to avoid live network calls."""
    from api_extractor.deps import get_extraction_service, get_redis, get_session
    import redis.asyncio as aioredis
    from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

    _DB_URL = "postgresql+asyncpg://postgres:postgres@postgres:5432/api_extractor"
    _REDIS_URL = "redis://redis:6379/0"

    mock_result = ExtractionResultResponse(
        series_code="IPCA",
        status="success",
        observations_upserted=120,
        latest_observed_at=datetime.datetime(2026, 4, 30, tzinfo=datetime.timezone.utc),
        extraction_at=datetime.datetime(2026, 5, 1, tzinfo=datetime.timezone.utc),
        error=None,
    )
    mock_svc = _make_mock_extraction_svc(mock_result)

    test_engine = create_async_engine(_DB_URL, pool_pre_ping=True)
    factory = async_sessionmaker(bind=test_engine, class_=AsyncSession, expire_on_commit=False)
    redis_client = aioredis.from_url(_REDIS_URL, encoding="utf-8", decode_responses=False)

    async def _get_session():  # type: ignore[return]
        async with factory() as session:
            try:
                yield session
                await session.commit()
            except Exception:
                await session.rollback()
                raise

    app.dependency_overrides[get_session] = _get_session
    app.dependency_overrides[get_redis] = lambda: redis_client
    app.dependency_overrides[get_extraction_service] = lambda: mock_svc

    try:
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as ac:
            yield ac, mock_svc
    finally:
        app.dependency_overrides.pop(get_session, None)
        app.dependency_overrides.pop(get_redis, None)
        app.dependency_overrides.pop(get_extraction_service, None)
        await redis_client.aclose()
        await test_engine.dispose()


@pytest.mark.asyncio
async def test_admin_extract_returns_200(client_with_mock_extractor):
    """POST /admin/extract/{code} must return 200 on success."""
    ac, _ = client_with_mock_extractor
    resp = await ac.post("/admin/extract/IPCA")
    assert resp.status_code == 200


@pytest.mark.asyncio
async def test_admin_extract_response_shape(client_with_mock_extractor):
    """Extraction response must have all required fields."""
    ac, _ = client_with_mock_extractor
    resp = await ac.post("/admin/extract/IPCA")
    data = resp.json()
    assert "series_code" in data
    assert "status" in data
    assert "observations_upserted" in data
    assert "latest_observed_at" in data
    assert "extraction_at" in data
    assert "error" in data


@pytest.mark.asyncio
async def test_admin_extract_success_values(client_with_mock_extractor):
    """Successful extraction must return correct mock values."""
    ac, _ = client_with_mock_extractor
    resp = await ac.post("/admin/extract/IPCA")
    data = resp.json()
    assert data["series_code"] == "IPCA"
    assert data["status"] == "success"
    assert data["observations_upserted"] == 120
    assert data["error"] is None


@pytest.mark.asyncio
async def test_admin_extract_calls_service(client_with_mock_extractor):
    """Endpoint must call ExtractionService.run_for with the correct code."""
    ac, mock_svc = client_with_mock_extractor
    await ac.post("/admin/extract/IPCA")
    mock_svc.run_for.assert_called_once_with(series_code="IPCA")


@pytest.mark.asyncio
async def test_admin_extract_404_on_unknown_series():
    """POST /admin/extract/{code} must return 404 for unknown series."""
    from api_extractor.deps import get_extraction_service, get_redis, get_session
    import redis.asyncio as aioredis
    from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

    _DB_URL = "postgresql+asyncpg://postgres:postgres@postgres:5432/api_extractor"
    _REDIS_URL = "redis://redis:6379/0"

    mock_svc = MagicMock(spec=ExtractionService)
    mock_svc.run_for = AsyncMock(side_effect=ValueError("Series not found: 'NONEXISTENT'"))

    test_engine = create_async_engine(_DB_URL, pool_pre_ping=True)
    factory = async_sessionmaker(bind=test_engine, class_=AsyncSession, expire_on_commit=False)
    redis_client = aioredis.from_url(_REDIS_URL, encoding="utf-8", decode_responses=False)

    async def _get_session():  # type: ignore[return]
        async with factory() as session:
            try:
                yield session
                await session.commit()
            except Exception:
                await session.rollback()
                raise

    app.dependency_overrides[get_session] = _get_session
    app.dependency_overrides[get_redis] = lambda: redis_client
    app.dependency_overrides[get_extraction_service] = lambda: mock_svc
    try:
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as ac:
            resp = await ac.post("/admin/extract/NONEXISTENT_XYZ")
        assert resp.status_code == 404
        assert "not found" in resp.json()["detail"].lower()
    finally:
        app.dependency_overrides.pop(get_session, None)
        app.dependency_overrides.pop(get_redis, None)
        app.dependency_overrides.pop(get_extraction_service, None)
        await redis_client.aclose()
        await test_engine.dispose()


@pytest.mark.asyncio
async def test_admin_extract_failed_status():
    """When extraction fails, response status must be 'failed'."""
    from api_extractor.deps import get_extraction_service, get_redis, get_session
    import redis.asyncio as aioredis
    from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

    _DB_URL = "postgresql+asyncpg://postgres:postgres@postgres:5432/api_extractor"
    _REDIS_URL = "redis://redis:6379/0"

    failed_result = ExtractionResultResponse(
        series_code="SELIC",
        status="failed",
        observations_upserted=0,
        latest_observed_at=None,
        extraction_at=datetime.datetime(2026, 5, 1, tzinfo=datetime.timezone.utc),
        error="Connection refused after 3 retries",
    )
    mock_svc = _make_mock_extraction_svc(failed_result)

    test_engine = create_async_engine(_DB_URL, pool_pre_ping=True)
    factory = async_sessionmaker(bind=test_engine, class_=AsyncSession, expire_on_commit=False)
    redis_client = aioredis.from_url(_REDIS_URL, encoding="utf-8", decode_responses=False)

    async def _get_session():  # type: ignore[return]
        async with factory() as session:
            try:
                yield session
                await session.commit()
            except Exception:
                await session.rollback()
                raise

    app.dependency_overrides[get_session] = _get_session
    app.dependency_overrides[get_redis] = lambda: redis_client
    app.dependency_overrides[get_extraction_service] = lambda: mock_svc
    try:
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as ac:
            resp = await ac.post("/admin/extract/SELIC")
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "failed"
        assert data["observations_upserted"] == 0
        assert "retries" in data["error"]
    finally:
        app.dependency_overrides.pop(get_session, None)
        app.dependency_overrides.pop(get_redis, None)
        app.dependency_overrides.pop(get_extraction_service, None)
        await redis_client.aclose()
        await test_engine.dispose()
