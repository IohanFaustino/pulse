"""Repository for the `observations` and `revisions` tables.

Provides bulk upsert with revision detection, range queries, and latest-N
lookups for sparkline endpoints. All inserts use ON CONFLICT DO UPDATE so
the operation is fully idempotent; value changes are recorded in `revisions`.

This is the hot path — performance notes:
- `bulk_upsert` uses a single executemany INSERT ... ON CONFLICT statement.
- Revision detection is done in Python (compare new vs. existing) to avoid
  a trigger or CTE that would complicate the hypertable write path.
- Range queries rely on the `ix_observations_series_measure_date_desc` compound index.

Stage 1 backwards-compat note (Phase 18)
-----------------------------------------
The observations PK is now (series_code, measure_key, observed_at). All
existing callers use the default measure_key='default'. Stage 3 will expand
``bulk_upsert`` and all read methods to accept an explicit measure_key param.
"""

import datetime
from decimal import Decimal

from sqlalchemy import delete, select
from sqlalchemy.dialects.postgresql import insert as pg_insert

from api_extractor.models.observation import Observation
from api_extractor.models.revision import Revision
from api_extractor.repos.base import BaseRepo


class ObservationRepo(BaseRepo):
    """Data access layer for `observations` and `revisions` tables."""

    # asyncpg caps bind parameters per statement at 32767. Upsert uses 3 params
    # per row (series_code, observed_at, value); IN(...) lookup uses 1 per date.
    # 5000 rows × 3 = 15000 binds, well under the cap.
    _UPSERT_BATCH_SIZE = 5000

    async def bulk_upsert(
        self,
        series_code: str,
        rows: list[dict[str, object]],
    ) -> int:
        """Idempotent bulk insert of observations with revision detection.

        Each element of ``rows`` must have:
        - ``observed_at``: ``datetime.datetime`` (timezone-aware UTC)
        - ``value``: ``Decimal`` or compatible numeric

        For each row, if `(series_code, observed_at)` already exists with a
        *different* value, the old value is written to `revisions` before the
        update. If the value is unchanged, no revision is written and no update
        is performed (ON CONFLICT DO NOTHING path avoided: we do update to
        capture ingested_at, but skip revision on equality).

        Large batches are chunked transparently to stay under the asyncpg
        32767 bind-parameter limit.

        Args:
            series_code: The series this batch belongs to.
            rows: List of ``{"observed_at": dt, "value": Decimal}`` dicts.

        Returns:
            Number of rows inserted or updated.
        """
        if not rows:
            return 0

        # Deduplicate within batch up front: keep the last value for each date.
        seen: dict[datetime.datetime, dict[str, object]] = {}
        for r in rows:
            seen[r["observed_at"]] = r  # type: ignore[index]
        deduped = list(seen.values())

        total = 0
        for start in range(0, len(deduped), self._UPSERT_BATCH_SIZE):
            chunk = deduped[start : start + self._UPSERT_BATCH_SIZE]
            total += await self._upsert_chunk(series_code, chunk)
        return total

    async def _upsert_chunk(
        self,
        series_code: str,
        chunk: list[dict[str, object]],
    ) -> int:
        observed_dates = [r["observed_at"] for r in chunk]
        existing_result = await self._session.execute(
            select(Observation.observed_at, Observation.value)
            .where(Observation.series_code == series_code)
            .where(Observation.observed_at.in_(observed_dates))
        )
        existing: dict[datetime.datetime, Decimal] = {
            row.observed_at: row.value for row in existing_result
        }

        revision_rows: list[dict[str, object]] = []
        for row in chunk:
            dt = row["observed_at"]
            new_val = Decimal(str(row["value"]))  # type: ignore[arg-type]
            if dt in existing and existing[dt] != new_val:
                revision_rows.append(
                    {
                        "series_code": series_code,
                        "observed_at": dt,
                        "old_value": existing[dt],
                        "new_value": new_val,
                    }
                )

        if revision_rows:
            await self._session.execute(
                pg_insert(Revision).values(revision_rows)
            )

        upsert_rows = [
            {
                "series_code": series_code,
                # Stage 1: always 'default'; Stage 3 will parameterise this.
                "measure_key": "default",
                "observed_at": r["observed_at"],
                "value": Decimal(str(r["value"])),  # type: ignore[arg-type]
            }
            for r in chunk
        ]
        stmt = (
            pg_insert(Observation)
            .values(upsert_rows)
            .on_conflict_do_update(
                # PK is now (series_code, measure_key, observed_at) since 0003.
                index_elements=["series_code", "measure_key", "observed_at"],
                set_={
                    "value": pg_insert(Observation).excluded.value,
                    "ingested_at": pg_insert(Observation).excluded.ingested_at,
                },
            )
        )
        result = await self._session.execute(stmt)
        await self._session.flush()
        return result.rowcount or len(upsert_rows)

    async def get_range(
        self,
        series_code: str,
        from_dt: datetime.datetime,
        to_dt: datetime.datetime,
    ) -> list[Observation]:
        """Return observations in [from_dt, to_dt] ordered by date ascending.

        Args:
            series_code: Series code filter.
            from_dt: Start of date range (inclusive).
            to_dt: End of date range (inclusive).

        Returns:
            List of Observation objects ordered by observed_at ASC.
        """
        result = await self._session.execute(
            select(Observation)
            .where(Observation.series_code == series_code)
            .where(Observation.observed_at >= from_dt)
            .where(Observation.observed_at <= to_dt)
            .order_by(Observation.observed_at.asc())
        )
        return list(result.scalars().all())

    async def get_latest_n(self, series_code: str, n: int) -> list[Observation]:
        """Return the N most recent observations, ordered oldest-first.

        Useful for sparkline rendering (last 24 data points).

        Args:
            series_code: Series code filter.
            n: Maximum number of observations to return.

        Returns:
            List of Observation objects ordered by observed_at ASC (oldest first).
        """
        # Fetch last N dates by DESC limit, then re-order ASC for caller convenience.
        # Using a scalar subquery to get the cutoff date.
        inner = (
            select(Observation.observed_at)
            .where(Observation.series_code == series_code)
            .order_by(Observation.observed_at.desc())
            .limit(n)
            .subquery()
        )
        result = await self._session.execute(
            select(Observation)
            .where(Observation.series_code == series_code)
            .where(Observation.observed_at.in_(select(inner)))
            .order_by(Observation.observed_at.asc())
        )
        return list(result.scalars().all())

    async def get_latest_observation_date(
        self, series_code: str
    ) -> datetime.datetime | None:
        """Return the timestamp of the most recent observation, or None if empty."""
        from sqlalchemy import func

        result = await self._session.execute(
            select(func.max(Observation.observed_at)).where(
                Observation.series_code == series_code
            )
        )
        return result.scalar_one_or_none()

    async def count(self, series_code: str) -> int:
        """Return total observation count for a series.

        Args:
            series_code: Series code.

        Returns:
            Number of stored observations.
        """
        from sqlalchemy import func

        result = await self._session.execute(
            select(func.count()).select_from(Observation).where(
                Observation.series_code == series_code
            )
        )
        return result.scalar_one()

    async def delete_series_observations(self, series_code: str) -> int:
        """Delete all observations for a series (used in tests).

        Args:
            series_code: Series code.

        Returns:
            Number of deleted rows.
        """
        result = await self._session.execute(
            delete(Observation).where(Observation.series_code == series_code)
        )
        await self._session.flush()
        return result.rowcount or 0
