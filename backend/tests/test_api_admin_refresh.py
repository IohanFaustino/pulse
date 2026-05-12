"""Tests for POST /admin/refresh-calendar.

Uses dependency overrides so the live IBGE/BCB scrapers are never invoked.
"""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient

from api_extractor.calendar_scraper.service import (
    CalendarRefreshReport,
    CalendarService,
)
from api_extractor.main import app
from api_extractor.routers.admin import _get_calendar_service


@pytest_asyncio.fixture()
async def client_with_mock_calendar():
    """Client with calendar service overridden + DB session override."""
    from api_extractor.deps import get_redis, get_session
    import redis.asyncio as aioredis
    from sqlalchemy.ext.asyncio import (
        AsyncSession,
        async_sessionmaker,
        create_async_engine,
    )

    db_url = "postgresql+asyncpg://postgres:postgres@postgres:5432/api_extractor"
    redis_url = "redis://redis:6379/0"

    mock_report = CalendarRefreshReport(
        scraped_count=12,
        hardcoded_count=4,
        upserted=14,
        skipped_daily=2,
        errors={},
    )
    mock_svc = MagicMock(spec=CalendarService)
    mock_svc.refresh_all = AsyncMock(return_value=mock_report)

    test_engine = create_async_engine(db_url, pool_pre_ping=True)
    factory = async_sessionmaker(bind=test_engine, class_=AsyncSession, expire_on_commit=False)
    redis_client = aioredis.from_url(redis_url, encoding="utf-8", decode_responses=False)

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
    app.dependency_overrides[_get_calendar_service] = lambda: mock_svc

    try:
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as ac:
            yield ac, mock_svc
    finally:
        app.dependency_overrides.pop(get_session, None)
        app.dependency_overrides.pop(get_redis, None)
        app.dependency_overrides.pop(_get_calendar_service, None)
        await redis_client.aclose()
        await test_engine.dispose()


@pytest.mark.asyncio
async def test_refresh_calendar_returns_aggregated_counts(client_with_mock_calendar):
    """Endpoint returns the structured CalendarRefreshResult."""
    ac, mock_svc = client_with_mock_calendar
    resp = await ac.post("/admin/refresh-calendar")
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["upserted"] == 14
    assert body["scraped_count"] == 12
    assert body["hardcoded_count"] == 4
    assert body["skipped_daily"] == 2
    assert {s["source"] for s in body["sources"]} == {"ibge", "bcb", "hardcoded"}
    assert all(s["status"] == "ok" for s in body["sources"])
    assert "refreshed_at" in body
    mock_svc.refresh_all.assert_awaited_once()


@pytest.mark.asyncio
async def test_refresh_calendar_reports_source_failure(client_with_mock_calendar):
    """When CalendarService reports an error for a source, surface 'failed' status."""
    ac, mock_svc = client_with_mock_calendar
    mock_svc.refresh_all.return_value = CalendarRefreshReport(
        scraped_count=4,
        hardcoded_count=4,
        upserted=8,
        skipped_daily=0,
        errors={"ibge": "timeout"},
    )
    resp = await ac.post("/admin/refresh-calendar")
    assert resp.status_code == 200
    body = resp.json()
    by_source = {s["source"]: s for s in body["sources"]}
    assert by_source["ibge"]["status"] == "failed"
    assert by_source["ibge"]["error"] == "timeout"
    assert by_source["bcb"]["status"] == "ok"
