"""Extraction orchestration service.

Coordinates fetching observations from a source adapter, upserting them
into the database, and updating series status fields. Used by the admin
extract endpoint (POST /admin/extract/{code}) as the manual trigger path.

The scheduler (Phase 3/W6) will call the same service once it is implemented,
proving that manual extraction and scheduled extraction share the same logic.
"""

from __future__ import annotations

import datetime
from decimal import Decimal
from typing import Any

from loguru import logger
from sqlalchemy.ext.asyncio import AsyncSession

from api_extractor.extractors.base import ExtractionError, SourceAdapter
from api_extractor.extractors.registry import get_adapter
from api_extractor.repos.observation_repo import ObservationRepo
from api_extractor.repos.series_repo import SeriesRepo
from api_extractor.schemas.admin import ExtractionResultResponse


class ExtractionService:
    """Orchestrates the full extraction pipeline for a single series.

    Workflow:
    1. Load series metadata from DB.
    2. Resolve the correct SourceAdapter via the registry.
    3. Fetch observations (incremental since last success, or full backfill).
    4. Bulk upsert via ObservationRepo (idempotent, revision-aware).
    5. Update series.status, last_extraction_at, last_success_at.
    6. Return structured ExtractionResultResponse.
    """

    def __init__(self, session: AsyncSession) -> None:
        """Initialise with an open AsyncSession.

        Args:
            session: Active database session. Caller manages lifecycle.
        """
        self._session = session

    async def run_for(
        self,
        series_code: str,
        adapter: SourceAdapter | None = None,
    ) -> ExtractionResultResponse:
        """Run extraction for the given series.

        Args:
            series_code: Series code to extract (e.g. "IPCA").
            adapter: Optional SourceAdapter override (used in tests to mock
                upstream calls). If None, resolved from the adapter registry.

        Returns:
            ExtractionResultResponse with outcome details.

        Raises:
            ValueError: If the series code does not exist in the database.
            KeyError: If Series.source cannot be mapped to a known adapter.
        """
        now = datetime.datetime.now(tz=datetime.timezone.utc)
        series_repo = SeriesRepo(self._session)
        obs_repo = ObservationRepo(self._session)

        series = await series_repo.get(series_code)
        if series is None:
            raise ValueError(f"Series not found: {series_code!r}")

        if adapter is None:
            adapter = get_adapter(series.source)

        # Incremental: since last stored observation. Falls back to None (full
        # backfill) if nothing in DB yet — covers the case where prior runs
        # marked last_success_at but stored 0 rows (e.g. wrong classification).
        latest = await obs_repo.get_latest_observation_date(series_code)
        since = latest.date() if latest else None

        logger.info(
            "extraction.start series={code} source={src} since={since}",
            code=series_code,
            src=series.source,
            since=since,
        )

        try:
            result = await adapter.fetch(series, since=since)
        except ExtractionError as exc:
            logger.error(
                "extraction.failed series={code} error={err}",
                code=series_code,
                err=str(exc),
            )
            await series_repo.update_status(
                code=series_code,
                status="stale",
                last_extraction_at=now,
            )
            await self._session.commit()
            return ExtractionResultResponse(
                series_code=series_code,
                status="failed",
                observations_upserted=0,
                latest_observed_at=None,
                extraction_at=now,
                error=str(exc),
            )

        # Convert FetchedObservation dataclass to repo-compatible dicts.
        rows: list[dict[str, Any]] = [
            {
                "observed_at": obs.observed_at,
                "value": Decimal(str(obs.value)),
            }
            for obs in result.observations
        ]

        count = await obs_repo.bulk_upsert(series_code, rows)

        # Determine the latest observed_at across this batch.
        latest_obs_at: datetime.datetime | None = None
        if result.observations:
            latest_obs_at = max(obs.observed_at for obs in result.observations)

        await series_repo.update_status(
            code=series_code,
            status="fresh",
            last_extraction_at=now,
            last_success_at=now,
        )
        await self._session.commit()

        logger.info(
            "extraction.success series={code} count={n} latest={latest}",
            code=series_code,
            n=count,
            latest=latest_obs_at,
        )

        return ExtractionResultResponse(
            series_code=series_code,
            status="success",
            observations_upserted=count,
            latest_observed_at=latest_obs_at,
            extraction_at=now,
            error=None,
        )
