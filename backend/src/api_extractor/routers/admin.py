"""Admin router.

POST /admin/extract/{code}          — Manual single-series extraction (Phase 5).
POST /admin/backfill                — Multi-series backfill (Phase 9).
POST /admin/refresh-calendar        — Trigger release calendar refresh (Phase 9).
GET  /admin/scheduler/jobs          — List scheduler jobs + next run (Phase 3/W6).
POST /admin/scheduler/trigger/{id}  — Fire a job immediately (Phase 3/W6).

No authentication in v1 (single-user local deployment).
"""

from __future__ import annotations

import datetime
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from loguru import logger

from api_extractor.calendar_scraper.service import CalendarService
from api_extractor.db import async_session_factory
from api_extractor.deps import ExtractionServiceDep, SessionDep
from api_extractor.schemas.admin import (
    BackfillResult,
    CalendarRefreshResult,
    CalendarRefreshSource,
    ExtractionResultResponse,
    SchedulerJobInfo,
    SchedulerJobsResponse,
    SchedulerTriggerResponse,
)
from api_extractor.services.backfill_service import BackfillService

router = APIRouter(tags=["admin"])


@router.post(
    "/admin/extract/{code}",
    response_model=ExtractionResultResponse,
    summary="Manually trigger extraction for a series",
    description=(
        "Triggers an immediate extraction run for the given series code. "
        "Incremental: fetches since last_success_at if set, else full backfill. "
        "Returns outcome with count of inserted/updated observations. "
        "LIVE NETWORK CALL — runs against real upstream APIs."
    ),
    responses={
        200: {"description": "Extraction completed (check status field for success/failure)."},
        404: {"description": "Series code not found."},
        422: {"description": "Series source cannot be mapped to a known adapter."},
    },
)
async def trigger_extraction(
    code: str,
    extraction_svc: ExtractionServiceDep,
) -> ExtractionResultResponse:
    """Trigger a manual extraction run for the given series."""
    try:
        return await extraction_svc.run_for(series_code=code)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except KeyError as exc:
        raise HTTPException(
            status_code=422,
            detail=f"Unknown adapter for series source: {exc}",
        ) from exc


@router.post(
    "/admin/backfill",
    response_model=BackfillResult,
    summary="Trigger backfill for all (or selected) series",
    description=(
        "Runs ExtractionService for every series (or the filtered subset). "
        "Bounded concurrency = 3 to keep upstream APIs happy. Each series fails "
        "independently — one upstream failure does not abort the batch. "
        "Returns per-series outcome list. LIVE NETWORK CALL."
    ),
)
async def trigger_backfill(
    codes: Annotated[
        list[str] | None,
        Query(description="Optional list of series codes. Omit to backfill all 25 series."),
    ] = None,
) -> BackfillResult:
    """Run a bounded-concurrency backfill across selected (or all) series."""
    svc = BackfillService(async_session_factory)
    return await svc.run(codes=codes)


def _get_calendar_service() -> CalendarService:
    """Dependency hook so tests can override calendar service."""
    return CalendarService()


@router.post(
    "/admin/refresh-calendar",
    response_model=CalendarRefreshResult,
    summary="Refresh the release calendar from IBGE + BCB scrapers",
    description=(
        "Triggers a fresh scrape of IBGE + BCB calendars, merges with hardcoded "
        "fallback, and upserts records into the releases table. "
        "Scraper failures fall back to hardcoded entries for the same series. "
        "LIVE NETWORK CALL — HTML scraping may take ~10-30s."
    ),
)
async def refresh_calendar(
    session: SessionDep,
    calendar_svc: Annotated[CalendarService, Depends(_get_calendar_service)],
) -> CalendarRefreshResult:
    """Refresh the release calendar from all sources."""
    logger.info("admin.refresh-calendar start")
    report = await calendar_svc.refresh_all(session)
    # session commit is handled by the get_session dependency.

    error_map = report.errors
    sources: list[CalendarRefreshSource] = []
    for name in ("ibge", "bcb", "hardcoded"):
        err = error_map.get(name)
        sources.append(
            CalendarRefreshSource(
                source=name,
                status="failed" if err is not None else "ok",
                count=(
                    report.hardcoded_count if name == "hardcoded" else 0
                ),  # scraped_count is aggregate; per-source breakdown not surfaced upstream
                error=err,
            )
        )

    return CalendarRefreshResult(
        upserted=report.upserted,
        scraped_count=report.scraped_count,
        hardcoded_count=report.hardcoded_count,
        skipped_daily=report.skipped_daily,
        sources=sources,
        refreshed_at=datetime.datetime.now(tz=datetime.timezone.utc),
    )


# ── Scheduler visibility endpoints ─────────────────────────────────────────────


def _get_scheduler(request: Request) -> "AsyncIOScheduler | None":  # noqa: F821
    """Return the scheduler from app.state (None if not running)."""
    return getattr(request.app.state, "scheduler", None)


@router.get(
    "/admin/scheduler/jobs",
    response_model=SchedulerJobsResponse,
    summary="List all registered scheduler jobs",
    description=(
        "Returns the list of registered APScheduler jobs with their next scheduled "
        "run time (UTC). Returns an empty list with scheduler_running=false when "
        "SCHEDULER_ENABLED=false."
    ),
)
async def list_scheduler_jobs(request: Request) -> SchedulerJobsResponse:
    """List all registered APScheduler jobs."""
    scheduler = _get_scheduler(request)

    if scheduler is None:
        return SchedulerJobsResponse(jobs=[], scheduler_running=False)

    running = scheduler.running
    jobs: list[SchedulerJobInfo] = []
    for job in scheduler.get_jobs():
        # next_run_time is a timezone-aware datetime or None (paused jobs).
        next_run = job.next_run_time
        if next_run is not None:
            # Normalise to UTC.
            next_run = next_run.astimezone(datetime.timezone.utc)
        jobs.append(
            SchedulerJobInfo(
                job_id=job.id,
                name=job.name,
                next_run_at=next_run,
                trigger=str(job.trigger),
            )
        )

    return SchedulerJobsResponse(jobs=jobs, scheduler_running=running)


@router.post(
    "/admin/scheduler/trigger/{job_id}",
    response_model=SchedulerTriggerResponse,
    status_code=202,
    summary="Fire a scheduler job immediately",
    description=(
        "Schedules an immediate one-off run of the given job using run_date=now. "
        "Returns 202 Accepted — the job runs asynchronously; check logs for outcome. "
        "Does NOT block waiting for job completion."
    ),
    responses={
        202: {"description": "Job queued for immediate execution."},
        404: {"description": "Job ID not found in the scheduler."},
        503: {"description": "Scheduler is not running (SCHEDULER_ENABLED=false)."},
    },
)
async def trigger_scheduler_job(
    job_id: str,
    request: Request,
) -> SchedulerTriggerResponse:
    """Fire a registered job immediately (non-blocking)."""
    scheduler = _get_scheduler(request)

    if scheduler is None or not scheduler.running:
        raise HTTPException(
            status_code=503,
            detail="Scheduler is not running. Set SCHEDULER_ENABLED=true to enable.",
        )

    job = scheduler.get_job(job_id)
    if job is None:
        raise HTTPException(
            status_code=404,
            detail=f"Scheduler job not found: {job_id!r}",
        )

    now = datetime.datetime.now(tz=datetime.timezone.utc)
    # add_job with run_date=now queues a one-off execution immediately.
    scheduler.add_job(
        job.func,
        "date",
        run_date=now,
        args=job.args,
        kwargs=job.kwargs,
        id=f"{job_id}_manual_{int(now.timestamp())}",
        misfire_grace_time=60,
    )
    logger.info("scheduler.manual_trigger job_id={} queued_at={}", job_id, now.isoformat())

    return SchedulerTriggerResponse(
        job_id=job_id,
        status="queued",
        queued_at=now,
    )
