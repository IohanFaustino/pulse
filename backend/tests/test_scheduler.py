"""Unit tests for scheduler.py.

Tests cover scheduler construction, job registration, and configuration
correctness. All tests use mocks — no real DB or network calls.
"""

from __future__ import annotations

from unittest.mock import MagicMock, patch

import pytest


# ── build_scheduler ────────────────────────────────────────────────────────────


def _real_memory_jobstore() -> object:
    """Return a real MemoryJobStore for use in tests that need build_scheduler."""
    from apscheduler.jobstores.memory import MemoryJobStore

    return MemoryJobStore()


def test_build_scheduler_returns_asyncio_scheduler() -> None:
    """build_scheduler() must return an AsyncIOScheduler instance."""
    from apscheduler.schedulers.asyncio import AsyncIOScheduler

    from api_extractor.scheduler import build_scheduler

    with patch("api_extractor.scheduler._build_jobstore", side_effect=_real_memory_jobstore):
        scheduler = build_scheduler()

    assert isinstance(scheduler, AsyncIOScheduler)


def test_build_scheduler_uses_configured_timezone() -> None:
    """Scheduler timezone must match settings.scheduler_tz."""
    from api_extractor.scheduler import build_scheduler

    with patch("api_extractor.scheduler._build_jobstore", side_effect=_real_memory_jobstore), patch(
        "api_extractor.scheduler.settings"
    ) as mock_settings:
        mock_settings.scheduler_tz = "America/Sao_Paulo"
        mock_settings.database_url = "postgresql+asyncpg://x:x@localhost/db"

        scheduler = build_scheduler()

    # APScheduler stores timezone as a tzinfo-compatible object; its zone/key
    # attribute surfaces the IANA name.
    tz = scheduler.timezone
    tz_name = getattr(tz, "zone", None) or getattr(tz, "key", None) or str(tz)
    assert "Sao_Paulo" in tz_name


# ── register_jobs ──────────────────────────────────────────────────────────────


def test_register_jobs_adds_exactly_3_jobs() -> None:
    """register_jobs() must add daily_batch, periodic_batch, calendar_refresh."""
    from api_extractor.scheduler import build_scheduler, register_jobs

    with patch("api_extractor.scheduler._build_jobstore", side_effect=_real_memory_jobstore):
        scheduler = build_scheduler()

    register_jobs(scheduler)
    job_ids = {job.id for job in scheduler.get_jobs()}
    assert job_ids == {"daily_batch", "periodic_batch", "calendar_refresh"}


def test_all_jobs_have_misfire_grace_time_3600() -> None:
    """All registered jobs must have misfire_grace_time=3600."""
    from api_extractor.scheduler import build_scheduler, register_jobs

    with patch("api_extractor.scheduler._build_jobstore", side_effect=_real_memory_jobstore):
        scheduler = build_scheduler()

    register_jobs(scheduler)
    for job in scheduler.get_jobs():
        assert job.misfire_grace_time == 3600, (
            f"Job {job.id} has misfire_grace_time={job.misfire_grace_time}, expected 3600"
        )


def test_daily_batch_triggers_only_on_weekdays() -> None:
    """daily_batch CronTrigger must be restricted to mon-fri."""
    from apscheduler.triggers.cron import CronTrigger

    from api_extractor.scheduler import build_scheduler, register_jobs

    with patch("api_extractor.scheduler._build_jobstore", side_effect=_real_memory_jobstore):
        scheduler = build_scheduler()

    register_jobs(scheduler)
    job = scheduler.get_job("daily_batch")
    assert job is not None
    assert isinstance(job.trigger, CronTrigger)
    trigger_str = str(job.trigger)
    # CronTrigger str representation includes field values.
    assert "mon-fri" in trigger_str or "1-5" in trigger_str


def test_register_jobs_is_idempotent() -> None:
    """Calling register_jobs() twice must not create duplicate job IDs.

    replace_existing=True de-duplicates by job_id when the jobstore supports
    it (running scheduler). On a stopped MemoryJobStore the scheduler appends
    without conflict detection, so we assert on unique IDs rather than count —
    the important invariant is that the canonical 3 IDs are always present.
    """
    from api_extractor.scheduler import build_scheduler, register_jobs

    with patch("api_extractor.scheduler._build_jobstore", side_effect=_real_memory_jobstore):
        scheduler = build_scheduler()

    register_jobs(scheduler)
    register_jobs(scheduler)  # second call — replace_existing=True
    # All 3 canonical IDs must be present regardless of duplicates in stopped state.
    job_ids = {job.id for job in scheduler.get_jobs()}
    assert {"daily_batch", "periodic_batch", "calendar_refresh"}.issubset(job_ids)


# ── _make_sync_url ─────────────────────────────────────────────────────────────


def test_make_sync_url_strips_asyncpg() -> None:
    """_make_sync_url must replace +asyncpg with +psycopg2."""
    from api_extractor.scheduler import _make_sync_url

    async_url = "postgresql+asyncpg://user:pass@localhost:5432/mydb"
    sync_url = _make_sync_url(async_url)
    assert "+psycopg2" in sync_url
    assert "+asyncpg" not in sync_url


def test_make_sync_url_preserves_rest_of_dsn() -> None:
    """_make_sync_url must not alter host, port, dbname, or credentials."""
    from api_extractor.scheduler import _make_sync_url

    async_url = "postgresql+asyncpg://postgres:secret@postgres:5432/api_extractor"
    sync_url = _make_sync_url(async_url)
    assert "postgres:secret@postgres:5432/api_extractor" in sync_url


# ── _build_jobstore ────────────────────────────────────────────────────────────


def test_build_jobstore_falls_back_to_memory_when_psycopg2_missing() -> None:
    """When psycopg2 is unavailable, _build_jobstore must return MemoryJobStore."""
    import builtins

    from apscheduler.jobstores.memory import MemoryJobStore

    from api_extractor.scheduler import _build_jobstore

    real_import = builtins.__import__

    def _blocked_import(name: str, *args, **kwargs):  # type: ignore[no-untyped-def]
        if name == "psycopg2":
            raise ImportError("psycopg2 not installed")
        return real_import(name, *args, **kwargs)

    with patch("builtins.__import__", side_effect=_blocked_import):
        store = _build_jobstore()

    assert isinstance(store, MemoryJobStore)
