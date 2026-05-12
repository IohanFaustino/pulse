"""Repository for the `series` table.

Provides async CRUD and upsert operations for Series records. Consumed by
Phase 2 extractors (upsert, update_status) and Phase 5 routers (get, list).
"""

import datetime
from typing import Any

from sqlalchemy import select, update
from sqlalchemy.dialects.postgresql import insert as pg_insert

from api_extractor.models.series import Series
from api_extractor.repos.base import BaseRepo


class SeriesRepo(BaseRepo):
    """Data access layer for `series` table."""

    async def get(self, code: str) -> Series | None:
        """Fetch a single series by its primary key code.

        Args:
            code: Series code (e.g., "IPCA", "SELIC").

        Returns:
            The Series ORM object, or ``None`` if not found.
        """
        result = await self._session.execute(
            select(Series).where(Series.code == code)
        )
        return result.scalar_one_or_none()

    async def list_all(self) -> list[Series]:
        """Return all series ordered by category then code.

        Returns:
            List of Series objects.
        """
        result = await self._session.execute(
            select(Series).order_by(Series.category, Series.code)
        )
        return list(result.scalars().all())

    async def list_by_category(self, category: str) -> list[Series]:
        """Return all series in a given category.

        Args:
            category: Category name (e.g., "Inflação", "Juros").

        Returns:
            List of Series objects matching the category.
        """
        result = await self._session.execute(
            select(Series)
            .where(Series.category == category)
            .order_by(Series.code)
        )
        return list(result.scalars().all())

    async def upsert(self, data: dict[str, Any]) -> Series:
        """Insert or update a series record (ON CONFLICT DO UPDATE).

        ``code`` must be present in ``data`` as the natural PK. All other
        fields are updated if the row already exists.

        Args:
            data: Dict of column name → value. Must include ``code``.

        Returns:
            The inserted or updated Series object.
        """
        stmt = (
            pg_insert(Series)
            .values(**data)
            .on_conflict_do_update(
                index_elements=["code"],
                set_={
                    k: v
                    for k, v in data.items()
                    if k not in ("code", "created_at")
                },
            )
            .returning(Series)
        )
        result = await self._session.execute(stmt)
        await self._session.flush()
        row = result.scalar_one()
        return row

    async def update_status(
        self,
        code: str,
        status: str,
        last_extraction_at: datetime.datetime | None = None,
        last_success_at: datetime.datetime | None = None,
    ) -> None:
        """Update extraction state fields for a series.

        Args:
            code: Series code to update.
            status: New status value: "fresh" | "stale" | "failed".
            last_extraction_at: Timestamp of this extraction attempt.
            last_success_at: Timestamp of last successful extraction (only set on success).
        """
        values: dict[str, Any] = {"status": status}
        if last_extraction_at is not None:
            values["last_extraction_at"] = last_extraction_at
        if last_success_at is not None:
            values["last_success_at"] = last_success_at

        await self._session.execute(
            update(Series).where(Series.code == code).values(**values)
        )
        await self._session.flush()
