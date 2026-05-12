"""Multi-series backfill orchestrator.

Drives ExtractionService for every series (or a filtered subset) with bounded
concurrency. Each series is fetched independently — one failure does not stop
the run. Per-series outcomes are returned in a structured BackfillResult.

Used by POST /admin/backfill.
"""

from __future__ import annotations

import asyncio
import datetime

from loguru import logger
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from api_extractor.repos.series_repo import SeriesRepo
from api_extractor.schemas.admin import BackfillItemResult, BackfillResult
from api_extractor.services.extraction_service import ExtractionService


# Bounded concurrency — keeps upstream calls polite while parallelising
# independent sources.
_MAX_CONCURRENT = 3
# Brief sleep between adapter calls to spread load (per worker).
_INTER_CALL_SLEEP_SEC = 0.25


class BackfillService:
    """Runs ExtractionService.run_for across many series with bounded concurrency."""

    def __init__(
        self,
        session_factory: async_sessionmaker[AsyncSession],
        max_concurrent: int = _MAX_CONCURRENT,
    ) -> None:
        self._session_factory = session_factory
        self._sem = asyncio.Semaphore(max_concurrent)

    async def run(self, codes: list[str] | None = None) -> BackfillResult:
        """Run backfill for the given codes (or all series if None)."""
        started_at = datetime.datetime.now(tz=datetime.timezone.utc)

        # Resolve codes list using a short-lived session.
        async with self._session_factory() as session:
            repo = SeriesRepo(session)
            if codes is None:
                rows = await repo.list_all()
                codes = [r.code for r in rows]

        logger.info("backfill.start codes={n}", n=len(codes))

        tasks = [asyncio.create_task(self._run_one(code)) for code in codes]
        items: list[BackfillItemResult] = await asyncio.gather(*tasks)

        finished_at = datetime.datetime.now(tz=datetime.timezone.utc)
        success_count = sum(1 for i in items if i.status == "success")
        failed_count = len(items) - success_count

        logger.info(
            "backfill.done total={t} success={s} failed={f}",
            t=len(items),
            s=success_count,
            f=failed_count,
        )

        return BackfillResult(
            total=len(items),
            success=success_count,
            failed=failed_count,
            items=items,
            started_at=started_at,
            finished_at=finished_at,
        )

    async def _run_one(self, code: str) -> BackfillItemResult:
        """Run extraction for one series inside the concurrency limiter."""
        async with self._sem:
            try:
                async with self._session_factory() as session:
                    svc = ExtractionService(session)
                    result = await svc.run_for(series_code=code)
                # polite spacing
                await asyncio.sleep(_INTER_CALL_SLEEP_SEC)
                return BackfillItemResult(
                    code=code,
                    status=result.status,
                    observations_upserted=result.observations_upserted,
                    error=result.error,
                )
            except Exception as exc:  # noqa: BLE001 — defensive: never abort the batch
                logger.exception("backfill.item_error code={c}", c=code)
                return BackfillItemResult(
                    code=code,
                    status="failed",
                    observations_upserted=0,
                    error=str(exc),
                )
