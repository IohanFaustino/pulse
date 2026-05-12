"""Tests for ObservationRepo — upsert, range query, latest N, revision detection.

Maps to:
- FR-2.1 TimescaleDB hypertable
- FR-2.2 Update value only if upstream value differs
- FR-2.3 Revision history recorded on value change
- NFR-4 UNIQUE(series_code, observed_at) constraint
"""

import datetime
import os
from decimal import Decimal

import pytest
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from api_extractor.repos.observation_repo import ObservationRepo
from api_extractor.repos.series_repo import SeriesRepo

_TEST_CODE = "TEST_OBS_REPO"
_DB_URL = os.environ.get(
    "DATABASE_URL",
    "postgresql+asyncpg://postgres:postgres@postgres:5432/api_extractor",
)
_SERIES_DATA = {
    "code": _TEST_CODE,
    "name": "Test Observation Series",
    "category": "Test",
    "source": "BCB SGS",
    "source_id": "88888",
    "frequency": "monthly",
    "unit": "%",
    "first_observation": datetime.date(2020, 1, 1),
}


def _utc(year: int, month: int, day: int) -> datetime.datetime:
    return datetime.datetime(year, month, day, tzinfo=datetime.timezone.utc)


async def _full_cleanup() -> None:
    """Delete all test data using a fresh connection."""
    from sqlalchemy import delete
    from api_extractor.models.observation import Observation
    from api_extractor.models.revision import Revision
    from api_extractor.models.series import Series

    engine = create_async_engine(_DB_URL, echo=False)
    factory = async_sessionmaker(bind=engine, class_=AsyncSession, expire_on_commit=False)
    async with factory() as s:
        await s.execute(delete(Observation).where(Observation.series_code == _TEST_CODE))
        await s.execute(delete(Revision).where(Revision.series_code == _TEST_CODE))
        await s.execute(delete(Series).where(Series.code == _TEST_CODE))
        await s.commit()
    await engine.dispose()


@pytest.fixture(autouse=True)
async def setup_and_cleanup(session: AsyncSession):
    """Insert test series before; delete all test data after."""
    await _full_cleanup()
    repo = SeriesRepo(session)
    await repo.upsert(_SERIES_DATA)
    await session.commit()
    yield
    await _full_cleanup()


class TestBulkUpsert:
    async def test_bulk_upsert_inserts_rows(
        self, observation_repo: ObservationRepo, session: AsyncSession
    ):
        """bulk_upsert() stores new observation rows."""
        rows = [
            {"observed_at": _utc(2024, 1, 1), "value": Decimal("4.83")},
            {"observed_at": _utc(2024, 2, 1), "value": Decimal("4.50")},
            {"observed_at": _utc(2024, 3, 1), "value": Decimal("3.93")},
        ]
        count = await observation_repo.bulk_upsert(_TEST_CODE, rows)
        await session.commit()

        assert count == 3
        total = await observation_repo.count(_TEST_CODE)
        assert total == 3

    async def test_bulk_upsert_idempotent_same_value(
        self, observation_repo: ObservationRepo, session: AsyncSession
    ):
        """bulk_upsert() with the same value does not create a revision row."""
        rows = [{"observed_at": _utc(2024, 1, 1), "value": Decimal("4.83")}]
        await observation_repo.bulk_upsert(_TEST_CODE, rows)
        await session.commit()

        # Upsert same value again.
        await observation_repo.bulk_upsert(_TEST_CODE, rows)
        await session.commit()

        from sqlalchemy import func, select
        from api_extractor.models.revision import Revision

        obs_count = await observation_repo.count(_TEST_CODE)
        assert obs_count == 1

        rev_count_result = await session.execute(
            select(func.count())
            .select_from(Revision)
            .where(Revision.series_code == _TEST_CODE)
        )
        assert rev_count_result.scalar_one() == 0

    async def test_bulk_upsert_creates_revision_on_value_change(
        self, observation_repo: ObservationRepo, session: AsyncSession
    ):
        """bulk_upsert() writes a revision row when the value changes (FR-2.2, FR-2.3)."""
        dt = _utc(2024, 1, 1)
        await observation_repo.bulk_upsert(_TEST_CODE, [{"observed_at": dt, "value": Decimal("4.83")}])
        await session.commit()

        await observation_repo.bulk_upsert(_TEST_CODE, [{"observed_at": dt, "value": Decimal("4.90")}])
        await session.commit()

        obs = await observation_repo.get_range(_TEST_CODE, dt, dt)
        assert len(obs) == 1
        assert obs[0].value == Decimal("4.90")

        from sqlalchemy import select
        from api_extractor.models.revision import Revision

        rev_result = await session.execute(
            select(Revision).where(Revision.series_code == _TEST_CODE)
        )
        revisions = list(rev_result.scalars().all())
        assert len(revisions) == 1
        assert revisions[0].old_value == Decimal("4.83")
        assert revisions[0].new_value == Decimal("4.90")

    async def test_bulk_upsert_empty_list_returns_zero(
        self, observation_repo: ObservationRepo
    ):
        """bulk_upsert() with empty list returns 0 without error."""
        count = await observation_repo.bulk_upsert(_TEST_CODE, [])
        assert count == 0

    async def test_bulk_upsert_deduplicates_within_batch(
        self, observation_repo: ObservationRepo, session: AsyncSession
    ):
        """Duplicate observed_at in same batch is deduped (last value wins) without error.

        Postgres ON CONFLICT DO UPDATE raises CardinalityViolationError if the
        same key appears twice in one statement. bulk_upsert deduplicates the
        batch before submitting, keeping the last occurrence.
        """
        dt = _utc(2024, 6, 1)
        rows = [
            {"observed_at": dt, "value": Decimal("1.00")},
            {"observed_at": dt, "value": Decimal("2.00")},
        ]
        # Should not raise — batch is deduped internally.
        await observation_repo.bulk_upsert(_TEST_CODE, rows)
        await session.commit()

        obs = await observation_repo.get_range(_TEST_CODE, dt, dt)
        assert len(obs) == 1
        # Last value in the batch wins (Decimal("2.00")).
        assert obs[0].value == Decimal("2.00")


class TestGetRange:
    async def test_get_range_returns_obs_in_range(
        self, observation_repo: ObservationRepo, session: AsyncSession
    ):
        """get_range() returns observations between from_dt and to_dt inclusive."""
        rows = [
            {"observed_at": _utc(2024, m, 1), "value": Decimal(str(m))}
            for m in range(1, 5)
        ]
        await observation_repo.bulk_upsert(_TEST_CODE, rows)
        await session.commit()

        result = await observation_repo.get_range(
            _TEST_CODE, _utc(2024, 2, 1), _utc(2024, 3, 1)
        )
        assert len(result) == 2
        assert result[0].value == Decimal("2")
        assert result[1].value == Decimal("3")

    async def test_get_range_empty_when_no_data(self, observation_repo: ObservationRepo):
        """get_range() returns empty list when no obs exist in range."""
        result = await observation_repo.get_range(
            _TEST_CODE, _utc(2020, 1, 1), _utc(2020, 12, 31)
        )
        assert result == []

    async def test_get_range_ordered_asc(
        self, observation_repo: ObservationRepo, session: AsyncSession
    ):
        """get_range() returns results ordered by observed_at ascending."""
        rows = [
            {"observed_at": _utc(2024, 3, 1), "value": Decimal("3")},
            {"observed_at": _utc(2024, 1, 1), "value": Decimal("1")},
            {"observed_at": _utc(2024, 2, 1), "value": Decimal("2")},
        ]
        await observation_repo.bulk_upsert(_TEST_CODE, rows)
        await session.commit()

        result = await observation_repo.get_range(
            _TEST_CODE, _utc(2024, 1, 1), _utc(2024, 12, 31)
        )
        # Verify ascending order.
        for i in range(len(result) - 1):
            assert result[i].observed_at <= result[i + 1].observed_at


class TestGetLatestN:
    async def test_get_latest_n_returns_n_most_recent(
        self, observation_repo: ObservationRepo, session: AsyncSession
    ):
        """get_latest_n(n=3) returns the 3 most recent observations."""
        rows = [
            {"observed_at": _utc(2024, m, 1), "value": Decimal(str(m))}
            for m in range(1, 7)  # 6 months
        ]
        await observation_repo.bulk_upsert(_TEST_CODE, rows)
        await session.commit()

        result = await observation_repo.get_latest_n(_TEST_CODE, 3)
        assert len(result) == 3
        values = [r.value for r in result]
        assert Decimal("6") in values
        assert Decimal("5") in values
        assert Decimal("4") in values

    async def test_get_latest_n_fewer_than_n_available(
        self, observation_repo: ObservationRepo, session: AsyncSession
    ):
        """get_latest_n(n=24) returns all rows if fewer than 24 exist."""
        rows = [
            {"observed_at": _utc(2024, 1, 1), "value": Decimal("1")},
            {"observed_at": _utc(2024, 2, 1), "value": Decimal("2")},
        ]
        await observation_repo.bulk_upsert(_TEST_CODE, rows)
        await session.commit()

        result = await observation_repo.get_latest_n(_TEST_CODE, 24)
        assert len(result) == 2

    async def test_get_latest_n_ordered_asc(
        self, observation_repo: ObservationRepo, session: AsyncSession
    ):
        """get_latest_n() returns results in ascending date order."""
        rows = [
            {"observed_at": _utc(2024, m, 1), "value": Decimal(str(m))}
            for m in range(1, 5)
        ]
        await observation_repo.bulk_upsert(_TEST_CODE, rows)
        await session.commit()

        result = await observation_repo.get_latest_n(_TEST_CODE, 3)
        for i in range(len(result) - 1):
            assert result[i].observed_at <= result[i + 1].observed_at
