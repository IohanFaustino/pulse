"""Repository for the `releases` table.

Provides list and upsert operations for release calendar events.
Consumed by Phase 6 calendar scrapers and Phase 5 release endpoint.
"""

import datetime
from typing import Any

from sqlalchemy import extract, select

from api_extractor.models.release import Release
from api_extractor.repos.base import BaseRepo


class ReleaseRepo(BaseRepo):
    """Data access layer for `releases` table."""

    async def get(self, release_id: int) -> Release | None:
        """Fetch a single release by surrogate PK.

        Args:
            release_id: Surrogate integer PK.

        Returns:
            Release object or ``None``.
        """
        result = await self._session.execute(
            select(Release).where(Release.id == release_id)
        )
        return result.scalar_one_or_none()

    async def list_by_month(self, year: int, month: int) -> list[Release]:
        """Return all releases scheduled in a given calendar month.

        Args:
            year: Four-digit year (e.g., 2026).
            month: Month number 1-12.

        Returns:
            List of Release objects ordered by scheduled_for ASC.
        """
        result = await self._session.execute(
            select(Release)
            .where(extract("year", Release.scheduled_for) == year)
            .where(extract("month", Release.scheduled_for) == month)
            .order_by(Release.scheduled_for.asc())
        )
        return list(result.scalars().all())

    async def list_by_series(self, series_code: str) -> list[Release]:
        """Return all releases for a given series ordered by date ascending.

        Args:
            series_code: Series code filter.

        Returns:
            List of Release objects.
        """
        result = await self._session.execute(
            select(Release)
            .where(Release.series_code == series_code)
            .order_by(Release.scheduled_for.asc())
        )
        return list(result.scalars().all())

    async def next_for(self, series_code: str) -> datetime.date | None:
        """Return the next scheduled release date (>= today) for a series.

        Args:
            series_code: Series code filter.

        Returns:
            The earliest future ``scheduled_for`` date, or ``None`` if no future
            release is registered.
        """
        today = datetime.date.today()
        result = await self._session.execute(
            select(Release.scheduled_for)
            .where(Release.series_code == series_code)
            .where(Release.scheduled_for >= today)
            .order_by(Release.scheduled_for.asc())
            .limit(1)
        )
        return result.scalar_one_or_none()

    async def next_for_all(self) -> dict[str, datetime.date]:
        """Return next scheduled release date for every series (>= today).

        Returns:
            Mapping of ``series_code`` → earliest future ``scheduled_for``.
        """
        today = datetime.date.today()
        result = await self._session.execute(
            select(Release.series_code, Release.scheduled_for)
            .where(Release.scheduled_for >= today)
            .order_by(Release.series_code, Release.scheduled_for.asc())
        )
        out: dict[str, datetime.date] = {}
        for code, dt in result.all():
            if code not in out:
                out[code] = dt
        return out

    async def upsert(self, data: dict[str, Any]) -> Release:
        """Insert or update a release record.

        Uses ``(series_code, scheduled_for)`` as the natural unique key for
        conflict detection (select-then-insert/update pattern, since no
        unique constraint is defined on the pair in the migration).

        Args:
            data: Dict with at minimum ``series_code`` and ``scheduled_for``.

        Returns:
            The inserted or updated Release object.
        """
        existing_result = await self._session.execute(
            select(Release)
            .where(Release.series_code == data["series_code"])
            .where(Release.scheduled_for == data["scheduled_for"])
        )
        existing_row = existing_result.scalar_one_or_none()

        if existing_row is not None:
            if "status" in data:
                existing_row.status = data["status"]
            if "source_type" in data:
                existing_row.source_type = data["source_type"]
            await self._session.flush()
            return existing_row

        release = Release(**data)
        self._session.add(release)
        await self._session.flush()
        return release
