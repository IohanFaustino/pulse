"""API contract tests for scheduler admin endpoints.

GET  /admin/scheduler/jobs
POST /admin/scheduler/trigger/{job_id}

Tests inject a mock AsyncIOScheduler into app.state so no real scheduler,
DB jobstore, or cron execution occurs. SCHEDULER_ENABLED is irrelevant here
because the dependency reads directly from app.state.scheduler set by lifespan,
and we bypass lifespan entirely via the ASGI test client.
"""

from __future__ import annotations

import datetime
from typing import Any
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient


# ── Shared mock scheduler fixture ──────────────────────────────────────────────


def _make_mock_job(
    job_id: str,
    name: str,
    next_run_time: datetime.datetime | None,
    trigger_str: str,
    func: Any = None,
) -> MagicMock:
    """Build a MagicMock that looks like an APScheduler Job."""
    job = MagicMock()
    job.id = job_id
    job.name = name
    job.next_run_time = next_run_time
    job.trigger = MagicMock(__str__=MagicMock(return_value=trigger_str))
    job.func = func or AsyncMock()
    job.args = ()
    job.kwargs = {}
    return job


def _make_mock_scheduler(running: bool = True) -> MagicMock:
    """Build a MagicMock resembling a running AsyncIOScheduler."""
    now = datetime.datetime(2026, 5, 12, 18, 0, tzinfo=datetime.timezone.utc)

    jobs = [
        _make_mock_job(
            "daily_batch",
            "Daily series extraction (mon-fri 18:00 BRT)",
            now + datetime.timedelta(hours=24),
            "cron[day_of_week='mon-fri', hour='18', minute='0']",
        ),
        _make_mock_job(
            "periodic_batch",
            "Monthly/quarterly series polling (09:00 BRT daily)",
            now + datetime.timedelta(hours=15),
            "cron[hour='9', minute='0']",
        ),
        _make_mock_job(
            "calendar_refresh",
            "Release calendar refresh (sunday 03:00 BRT)",
            now + datetime.timedelta(days=5),
            "cron[day_of_week='sun', hour='3', minute='0']",
        ),
    ]

    scheduler = MagicMock()
    scheduler.running = running
    scheduler.get_jobs.return_value = jobs
    scheduler.get_job.side_effect = lambda jid: next(
        (j for j in jobs if j.id == jid), None
    )
    scheduler.add_job = MagicMock()
    return scheduler


# ── Fixtures ───────────────────────────────────────────────────────────────────


@pytest_asyncio.fixture()
async def scheduler_client():
    """AsyncClient with a mock scheduler injected into app.state."""
    from api_extractor.main import app

    mock_scheduler = _make_mock_scheduler(running=True)

    # We need to set app.state.scheduler without running the full lifespan.
    # Use a thin lifespan wrapper that only sets state and skips DB/Redis.
    original_state_scheduler = getattr(app.state, "scheduler", None)
    app.state.scheduler = mock_scheduler

    # Also need Redis on state for routes that touch it (none of the scheduler
    # routes do, but the app itself may check). Set a stub.
    had_redis = hasattr(app.state, "redis")
    if not had_redis:
        app.state.redis = AsyncMock()

    try:
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as ac:
            yield ac, mock_scheduler
    finally:
        app.state.scheduler = original_state_scheduler
        if not had_redis:
            del app.state.redis


@pytest_asyncio.fixture()
async def disabled_scheduler_client():
    """AsyncClient with app.state.scheduler=None (disabled)."""
    from api_extractor.main import app

    original = getattr(app.state, "scheduler", None)
    app.state.scheduler = None

    had_redis = hasattr(app.state, "redis")
    if not had_redis:
        app.state.redis = AsyncMock()

    try:
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as ac:
            yield ac
    finally:
        app.state.scheduler = original
        if not had_redis:
            del app.state.redis


# ── GET /admin/scheduler/jobs ──────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_list_jobs_returns_200(scheduler_client) -> None:
    """GET /admin/scheduler/jobs must return 200."""
    client, _ = scheduler_client
    resp = await client.get("/admin/scheduler/jobs")
    assert resp.status_code == 200


@pytest.mark.asyncio
async def test_list_jobs_returns_3_jobs(scheduler_client) -> None:
    """Response must contain exactly 3 registered jobs."""
    client, _ = scheduler_client
    resp = await client.get("/admin/scheduler/jobs")
    data = resp.json()
    assert len(data["jobs"]) == 3


@pytest.mark.asyncio
async def test_list_jobs_scheduler_running_true(scheduler_client) -> None:
    """scheduler_running field must be True when scheduler is up."""
    client, _ = scheduler_client
    resp = await client.get("/admin/scheduler/jobs")
    assert resp.json()["scheduler_running"] is True


@pytest.mark.asyncio
async def test_list_jobs_response_shape(scheduler_client) -> None:
    """Each job in the response must have job_id, name, next_run_at, trigger."""
    client, _ = scheduler_client
    resp = await client.get("/admin/scheduler/jobs")
    for job in resp.json()["jobs"]:
        assert "job_id" in job
        assert "name" in job
        assert "next_run_at" in job
        assert "trigger" in job


@pytest.mark.asyncio
async def test_list_jobs_contains_expected_ids(scheduler_client) -> None:
    """Response jobs must include daily_batch, periodic_batch, calendar_refresh."""
    client, _ = scheduler_client
    resp = await client.get("/admin/scheduler/jobs")
    ids = {j["job_id"] for j in resp.json()["jobs"]}
    assert ids == {"daily_batch", "periodic_batch", "calendar_refresh"}


@pytest.mark.asyncio
async def test_list_jobs_disabled_scheduler_returns_empty(disabled_scheduler_client) -> None:
    """When scheduler=None, jobs list must be empty and scheduler_running=False."""
    client = disabled_scheduler_client
    resp = await client.get("/admin/scheduler/jobs")
    assert resp.status_code == 200
    data = resp.json()
    assert data["jobs"] == []
    assert data["scheduler_running"] is False


# ── POST /admin/scheduler/trigger/{job_id} ─────────────────────────────────────


@pytest.mark.asyncio
async def test_trigger_known_job_returns_202(scheduler_client) -> None:
    """Triggering a known job must return 202."""
    client, _ = scheduler_client
    resp = await client.post("/admin/scheduler/trigger/calendar_refresh")
    assert resp.status_code == 202


@pytest.mark.asyncio
async def test_trigger_known_job_response_shape(scheduler_client) -> None:
    """Response must include job_id, status='queued', and queued_at."""
    client, _ = scheduler_client
    resp = await client.post("/admin/scheduler/trigger/daily_batch")
    data = resp.json()
    assert data["job_id"] == "daily_batch"
    assert data["status"] == "queued"
    assert "queued_at" in data


@pytest.mark.asyncio
async def test_trigger_known_job_calls_add_job(scheduler_client) -> None:
    """Triggering a job must call scheduler.add_job with run_date trigger."""
    client, mock_scheduler = scheduler_client
    await client.post("/admin/scheduler/trigger/periodic_batch")
    mock_scheduler.add_job.assert_called_once()
    call_kwargs = mock_scheduler.add_job.call_args
    # Second positional arg is the trigger type string.
    assert call_kwargs.args[1] == "date"


@pytest.mark.asyncio
async def test_trigger_unknown_job_returns_404(scheduler_client) -> None:
    """Triggering a non-existent job_id must return 404."""
    client, _ = scheduler_client
    resp = await client.post("/admin/scheduler/trigger/nonexistent_job")
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_trigger_job_when_scheduler_disabled_returns_503(
    disabled_scheduler_client,
) -> None:
    """Triggering when scheduler is None must return 503."""
    client = disabled_scheduler_client
    resp = await client.post("/admin/scheduler/trigger/daily_batch")
    assert resp.status_code == 503
