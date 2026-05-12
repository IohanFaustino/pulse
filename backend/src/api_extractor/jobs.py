"""APScheduler job functions.

Each function is an async callable invoked by the ``AsyncIOScheduler``.  Jobs
construct their own ``AsyncSession`` (they run outside the HTTP request scope)
and are fully idempotent — safe to retry on misfire.

Job design:
- All I/O via ``httpx.AsyncClient`` through the adapters (non-blocking).
- Bounded concurrency inside batch jobs (semaphore = 3, mirroring BackfillService).
- Exceptions are caught at the top level so APScheduler does not mark the job
  as permanently failed — the series is marked ``stale`` by ExtractionService
  when upstream calls fail.
- Structured logging with ``job_id``, ``duration_ms``, and ``status`` fields.
"""

from __future__ import annotations

import time

from loguru import logger

from api_extractor.db import async_session_factory


# ── Daily / event series batch ─────────────────────────────────────────────────

async def extract_daily_batch_job() -> None:
    """Extract all daily and event-cadence series.

    Called by the ``daily_batch`` cron job (mon-fri 18:00 BRT).

    Uses BackfillService with concurrency=3 to stay polite to upstream APIs.
    Daily and event series share this job because SELIC_meta (event cadence)
    is idempotent on days without new announcements.
    """
    from api_extractor.models.series import Series
    from api_extractor.services.backfill_service import BackfillService
    from sqlalchemy import select

    job_id = "daily_batch"
    t0 = time.monotonic()
    logger.info("job.start job_id={}", job_id)

    try:
        # Resolve codes for daily + event series. Skip series flagged 'failed'
        # so the scheduler does not keep retrying upstreams that are down
        # (e.g. ANBIMA outage — set status='failed' manually to disable).
        async with async_session_factory() as session:
            result = await session.execute(
                select(Series.code).where(
                    Series.frequency.in_(["daily", "event"]),
                    Series.status != "failed",
                )
            )
            codes: list[str] = [row[0] for row in result.all()]

        if not codes:
            logger.warning("job.no_codes job_id={}", job_id)
            return

        svc = BackfillService(async_session_factory)
        report = await svc.run(codes=codes)

        duration_ms = int((time.monotonic() - t0) * 1000)
        logger.info(
            "job.done job_id={} duration_ms={} total={} success={} failed={}",
            job_id,
            duration_ms,
            report.total,
            report.success,
            report.failed,
        )
    except Exception:  # noqa: BLE001
        duration_ms = int((time.monotonic() - t0) * 1000)
        logger.exception("job.error job_id={} duration_ms={}", job_id, duration_ms)


# ── Monthly / quarterly series batch ──────────────────────────────────────────

async def extract_periodic_batch_job() -> None:
    """Extract all monthly and quarterly series.

    Called by the ``periodic_batch`` cron job (daily 09:00 BRT).

    BCB SGS and IBGE SIDRA release monthly/quarterly data on irregular
    schedules — daily polling ensures we pick up data the day it appears.
    Idempotent: ExtractionService does an upsert so re-fetching existing
    observations is a no-op at the DB level.
    """
    from api_extractor.models.series import Series
    from api_extractor.services.backfill_service import BackfillService
    from sqlalchemy import select

    job_id = "periodic_batch"
    t0 = time.monotonic()
    logger.info("job.start job_id={}", job_id)

    try:
        async with async_session_factory() as session:
            result = await session.execute(
                select(Series.code).where(
                    Series.frequency.in_(["monthly", "quarterly"])
                )
            )
            codes: list[str] = [row[0] for row in result.all()]

        if not codes:
            logger.warning("job.no_codes job_id={}", job_id)
            return

        svc = BackfillService(async_session_factory)
        report = await svc.run(codes=codes)

        duration_ms = int((time.monotonic() - t0) * 1000)
        logger.info(
            "job.done job_id={} duration_ms={} total={} success={} failed={}",
            job_id,
            duration_ms,
            report.total,
            report.success,
            report.failed,
        )
    except Exception:  # noqa: BLE001
        duration_ms = int((time.monotonic() - t0) * 1000)
        logger.exception("job.error job_id={} duration_ms={}", job_id, duration_ms)


# ── Calendar refresh ───────────────────────────────────────────────────────────

async def refresh_calendar_job() -> None:
    """Refresh the release calendar from IBGE + BCB scrapers.

    Called by the ``calendar_refresh`` cron job (sunday 03:00 BRT).

    CalendarService gracefully falls back to hardcoded entries per source when
    a scraper fails — this job never raises even on full scraper failure.
    """
    from api_extractor.calendar_scraper.service import CalendarService

    job_id = "calendar_refresh"
    t0 = time.monotonic()
    logger.info("job.start job_id={}", job_id)

    try:
        async with async_session_factory() as session:
            svc = CalendarService()
            report = await svc.refresh_all(session)
            await session.commit()

        duration_ms = int((time.monotonic() - t0) * 1000)
        logger.info(
            "job.done job_id={} duration_ms={} upserted={} scraped={} hardcoded={} errors={}",
            job_id,
            duration_ms,
            report.upserted,
            report.scraped_count,
            report.hardcoded_count,
            list(report.errors.keys()),
        )
    except Exception:  # noqa: BLE001
        duration_ms = int((time.monotonic() - t0) * 1000)
        logger.exception("job.error job_id={} duration_ms={}", job_id, duration_ms)
