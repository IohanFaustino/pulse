"""APScheduler in-process scheduler.

Builds and configures an ``AsyncIOScheduler`` that lives for the lifetime of
the FastAPI process. Jobs are persisted via ``SQLAlchemyJobStore`` (sync URL
derived from the async DATABASE_URL) so missed runs survive restarts.

If psycopg2 is not installed the jobstore silently degrades to
``MemoryJobStore`` — jobs still run but missed runs are lost on restart.

Usage (from lifespan)::

    scheduler = build_scheduler()
    register_jobs(scheduler)
    scheduler.start()
    ...
    scheduler.shutdown(wait=False)
"""

from __future__ import annotations

from loguru import logger

from api_extractor.config import settings


def _make_sync_url(async_url: str) -> str:
    """Derive a synchronous SQLAlchemy URL from the async asyncpg URL.

    Replaces ``+asyncpg`` dialect suffix with ``+psycopg2``.

    Args:
        async_url: Async SQLAlchemy DSN (e.g. ``postgresql+asyncpg://...``).

    Returns:
        Sync DSN suitable for SQLAlchemyJobStore.
    """
    return async_url.replace("+asyncpg", "+psycopg2")


def _build_jobstore() -> object:
    """Return the best available jobstore.

    Tries ``SQLAlchemyJobStore`` first (requires psycopg2). Falls back to
    ``MemoryJobStore`` with a warning when psycopg2 is absent.

    Returns:
        An APScheduler jobstore instance.
    """
    sync_url = _make_sync_url(settings.database_url)
    try:
        import psycopg2  # noqa: F401 — presence check only

        from apscheduler.jobstores.sqlalchemy import SQLAlchemyJobStore

        store = SQLAlchemyJobStore(url=sync_url)
        logger.info("scheduler: using SQLAlchemyJobStore url={}", sync_url)
        return store
    except ImportError:
        from apscheduler.jobstores.memory import MemoryJobStore

        logger.warning(
            "scheduler: psycopg2 not installed — falling back to MemoryJobStore. "
            "Missed runs will NOT survive API restart."
        )
        return MemoryJobStore()


def build_scheduler() -> "AsyncIOScheduler":  # noqa: F821
    """Build and return a configured ``AsyncIOScheduler``.

    The scheduler is NOT started here; call ``.start()`` after
    ``register_jobs()`` in the lifespan.

    Returns:
        Configured but not yet started ``AsyncIOScheduler``.
    """
    from apscheduler.executors.asyncio import AsyncIOExecutor
    from apscheduler.schedulers.asyncio import AsyncIOScheduler

    jobstore = _build_jobstore()

    scheduler = AsyncIOScheduler(
        jobstores={"default": jobstore},
        executors={"default": AsyncIOExecutor()},
        job_defaults={
            "coalesce": True,
            "max_instances": 1,
        },
        timezone=settings.scheduler_tz,
    )
    logger.info("scheduler: built AsyncIOScheduler tz={}", settings.scheduler_tz)
    return scheduler


def register_jobs(scheduler: "AsyncIOScheduler") -> None:  # noqa: F821
    """Register the three production cron jobs on the scheduler.

    Jobs are replaced on each call (``replace_existing=True``) so re-registering
    after a restart is idempotent.

    Jobs registered:

    - ``daily_batch``: mon-fri 18:00 BRT — extracts daily/event-cadence series
    - ``periodic_batch``: daily 09:00 BRT — extracts monthly/quarterly series
    - ``calendar_refresh``: sunday 03:00 BRT — refreshes release calendar

    Args:
        scheduler: Running or stopped ``AsyncIOScheduler`` to register jobs on.
    """
    from apscheduler.triggers.cron import CronTrigger

    from api_extractor.jobs import (
        extract_daily_batch_job,
        extract_periodic_batch_job,
        refresh_calendar_job,
    )

    tz = settings.scheduler_tz

    scheduler.add_job(
        extract_daily_batch_job,
        trigger=CronTrigger(day_of_week="mon-fri", hour=18, minute=0, timezone=tz),
        id="daily_batch",
        name="Daily series extraction (mon-fri 18:00 BRT)",
        misfire_grace_time=3600,
        replace_existing=True,
    )
    logger.info("scheduler: registered job daily_batch (mon-fri 18:00 {})", tz)

    scheduler.add_job(
        extract_periodic_batch_job,
        trigger=CronTrigger(hour=9, minute=0, timezone=tz),
        id="periodic_batch",
        name="Monthly/quarterly series polling (09:00 BRT daily)",
        misfire_grace_time=3600,
        replace_existing=True,
    )
    logger.info("scheduler: registered job periodic_batch (daily 09:00 {})", tz)

    scheduler.add_job(
        refresh_calendar_job,
        trigger=CronTrigger(day_of_week="sun", hour=3, minute=0, timezone=tz),
        id="calendar_refresh",
        name="Release calendar refresh (sunday 03:00 BRT)",
        misfire_grace_time=3600,
        replace_existing=True,
    )
    logger.info("scheduler: registered job calendar_refresh (sunday 03:00 {})", tz)
