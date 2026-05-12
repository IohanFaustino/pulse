"""Tests for SeriesRepo — CRUD round-trip.

Maps to:
- PLAN §6 Phase 1 (repository layer)
- NFR-4 referential integrity
"""

import datetime

import pytest
import pytest_asyncio
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from api_extractor.repos.series_repo import SeriesRepo

_TEST_CODE = "TEST_SERIES_REPO"
_TEST_DATA = {
    "code": _TEST_CODE,
    "name": "Test Series for Repo Tests",
    "category": "Test",
    "source": "BCB SGS",
    "source_id": "99999",
    "frequency": "monthly",
    "unit": "%",
    "first_observation": datetime.date(2020, 1, 1),
}

import os
_DB_URL = os.environ.get(
    "DATABASE_URL",
    "postgresql+asyncpg://postgres:postgres@postgres:5432/api_extractor",
)


async def _cleanup(code: str) -> None:
    """Delete a test series using a fresh engine connection."""
    from sqlalchemy import delete
    from api_extractor.models.series import Series

    engine = create_async_engine(_DB_URL, echo=False)
    factory = async_sessionmaker(bind=engine, class_=AsyncSession, expire_on_commit=False)
    async with factory() as s:
        await s.execute(delete(Series).where(Series.code == code))
        await s.commit()
    await engine.dispose()


@pytest.fixture(autouse=True)
async def cleanup_test_series():
    """Delete test series before and after each test."""
    await _cleanup(_TEST_CODE)
    yield
    await _cleanup(_TEST_CODE)


class TestSeriesRepoGet:
    async def test_get_existing_series(self, series_repo: SeriesRepo, session: AsyncSession):
        """get() returns the correct Series object for an existing code."""
        await series_repo.upsert(_TEST_DATA)
        await session.commit()

        result = await series_repo.get(_TEST_CODE)
        assert result is not None
        assert result.code == _TEST_CODE
        assert result.name == _TEST_DATA["name"]

    async def test_get_nonexistent_returns_none(self, series_repo: SeriesRepo):
        """get() returns None for a code that does not exist."""
        result = await series_repo.get("DOES_NOT_EXIST_XYZ")
        assert result is None


class TestSeriesRepoUpsert:
    async def test_upsert_inserts_new_row(self, series_repo: SeriesRepo, session: AsyncSession):
        """upsert() inserts a new row when the code is absent."""
        result = await series_repo.upsert(_TEST_DATA)
        await session.commit()

        assert result.code == _TEST_CODE
        assert result.category == "Test"
        assert result.source_id == "99999"

    async def test_upsert_updates_existing_row(self, series_repo: SeriesRepo, session: AsyncSession):
        """upsert() updates fields on conflict with the same code."""
        await series_repo.upsert(_TEST_DATA)
        await session.commit()

        updated = dict(_TEST_DATA, name="Updated Name", unit="pts")
        result = await series_repo.upsert(updated)
        await session.commit()

        assert result.name == "Updated Name"
        assert result.unit == "pts"

    async def test_upsert_idempotent(self, series_repo: SeriesRepo, session: AsyncSession):
        """Calling upsert twice with the same data produces one row."""
        await series_repo.upsert(_TEST_DATA)
        await session.commit()
        await series_repo.upsert(_TEST_DATA)
        await session.commit()

        from sqlalchemy import func, select
        from api_extractor.models.series import Series

        count_result = await session.execute(
            select(func.count()).select_from(Series).where(Series.code == _TEST_CODE)
        )
        assert count_result.scalar_one() == 1


class TestSeriesRepoListAll:
    async def test_list_all_contains_inserted_series(
        self, series_repo: SeriesRepo, session: AsyncSession
    ):
        """list_all() includes the inserted test series."""
        await series_repo.upsert(_TEST_DATA)
        await session.commit()

        all_series = await series_repo.list_all()
        codes = [s.code for s in all_series]
        assert _TEST_CODE in codes

    async def test_list_by_category_filters_correctly(
        self, series_repo: SeriesRepo, session: AsyncSession
    ):
        """list_by_category() returns only series in the given category."""
        await series_repo.upsert(_TEST_DATA)
        await session.commit()

        results = await series_repo.list_by_category("Test")
        assert all(s.category == "Test" for s in results)
        codes = [s.code for s in results]
        assert _TEST_CODE in codes

    async def test_list_by_category_excludes_other_categories(
        self, series_repo: SeriesRepo, session: AsyncSession
    ):
        """list_by_category() excludes series in other categories."""
        await series_repo.upsert(_TEST_DATA)
        await session.commit()

        results = await series_repo.list_by_category("Inflação")
        codes = [s.code for s in results]
        assert _TEST_CODE not in codes


class TestSeriesRepoUpdateStatus:
    async def test_update_status_to_stale(self, series_repo: SeriesRepo, session: AsyncSession):
        """update_status() changes status field correctly."""
        await series_repo.upsert(_TEST_DATA)
        await session.commit()

        now = datetime.datetime.now(datetime.timezone.utc)
        await series_repo.update_status(
            _TEST_CODE,
            status="stale",
            last_extraction_at=now,
        )
        await session.commit()

        # Use a fresh session to verify the committed state.
        engine2 = create_async_engine(_DB_URL, echo=False)
        factory2 = async_sessionmaker(
            bind=engine2, class_=AsyncSession, expire_on_commit=False
        )
        async with factory2() as s2:
            repo2 = SeriesRepo(s2)
            series = await repo2.get(_TEST_CODE)
            assert series is not None
            assert series.status == "stale"
            assert series.last_extraction_at is not None
        await engine2.dispose()

    async def test_update_status_sets_success_timestamp(
        self, series_repo: SeriesRepo, session: AsyncSession
    ):
        """update_status() sets both extraction and success timestamps."""
        await series_repo.upsert(_TEST_DATA)
        await session.commit()

        now = datetime.datetime.now(datetime.timezone.utc)
        await series_repo.update_status(
            _TEST_CODE,
            status="fresh",
            last_extraction_at=now,
            last_success_at=now,
        )
        await session.commit()

        engine2 = create_async_engine(_DB_URL, echo=False)
        factory2 = async_sessionmaker(
            bind=engine2, class_=AsyncSession, expire_on_commit=False
        )
        async with factory2() as s2:
            repo2 = SeriesRepo(s2)
            series = await repo2.get(_TEST_CODE)
            assert series is not None
            assert series.status == "fresh"
            assert series.last_success_at is not None
        await engine2.dispose()
