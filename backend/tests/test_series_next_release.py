"""Tests that SeriesRead.next_release_at is populated from the releases table."""

from __future__ import annotations

import datetime

import pytest
from sqlalchemy import delete
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from tests.fixtures_api import api_client  # noqa: F401
from api_extractor.models.release import Release
from api_extractor.repos.release_repo import ReleaseRepo


_DB_URL = "postgresql+asyncpg://postgres:postgres@postgres:5432/api_extractor"


async def _wipe_and_seed(code: str, scheduled_for: datetime.date | None) -> None:
    """Helper: wipe future releases for a code; optionally seed one."""
    engine = create_async_engine(_DB_URL)
    factory = async_sessionmaker(bind=engine, class_=AsyncSession, expire_on_commit=False)
    try:
        async with factory() as s:
            await s.execute(delete(Release).where(Release.series_code == code))
            if scheduled_for is not None:
                await ReleaseRepo(s).upsert(
                    {
                        "series_code": code,
                        "scheduled_for": scheduled_for,
                        "status": "expected",
                        "source_type": "hardcoded",
                    }
                )
            await s.commit()
    finally:
        await engine.dispose()


@pytest.mark.asyncio
async def test_series_one_returns_next_release_at(api_client) -> None:
    """Seed a future release and verify GET /series/{code} returns next_release_at."""
    future = datetime.date.today() + datetime.timedelta(days=14)
    await _wipe_and_seed("IPCA", future)
    try:
        resp = await api_client.get("/series/IPCA")
        assert resp.status_code == 200
        body = resp.json()
        assert body["code"] == "IPCA"
        assert body["next_release_at"] == future.isoformat()
    finally:
        await _wipe_and_seed("IPCA", None)


@pytest.mark.asyncio
async def test_series_list_includes_next_release_at_when_present(api_client) -> None:
    """GET /series populates next_release_at when a future release exists."""
    future = datetime.date.today() + datetime.timedelta(days=7)
    await _wipe_and_seed("SELIC", future)
    try:
        resp = await api_client.get("/series")
        assert resp.status_code == 200
        items = resp.json()["items"]
        selic = next(i for i in items if i["code"] == "SELIC")
        assert selic["next_release_at"] == future.isoformat()
    finally:
        await _wipe_and_seed("SELIC", None)
