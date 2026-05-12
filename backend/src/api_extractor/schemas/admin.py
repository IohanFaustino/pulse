"""Pydantic v2 schemas for the admin resource."""

from __future__ import annotations

import datetime

from pydantic import BaseModel, Field


# ── Scheduler schemas ──────────────────────────────────────────────────────────


class SchedulerJobInfo(BaseModel):
    """Metadata for a single registered scheduler job."""

    model_config = {"populate_by_name": True}

    job_id: str = Field(description="Unique APScheduler job identifier.")
    name: str = Field(description="Human-readable job description.")
    next_run_at: datetime.datetime | None = Field(
        default=None,
        description="UTC timestamp of the next scheduled execution. Null if paused or not yet scheduled.",
    )
    trigger: str = Field(description="Trigger description (e.g. cron expression).")


class SchedulerJobsResponse(BaseModel):
    """Response schema for GET /admin/scheduler/jobs."""

    model_config = {"populate_by_name": True}

    jobs: list[SchedulerJobInfo] = Field(
        default_factory=list,
        description="All currently registered scheduler jobs.",
    )
    scheduler_running: bool = Field(
        description="Whether the APScheduler is currently running."
    )


class SchedulerTriggerResponse(BaseModel):
    """Response schema for POST /admin/scheduler/trigger/{job_id}."""

    model_config = {"populate_by_name": True}

    job_id: str = Field(description="Job that was triggered.")
    status: str = Field(description="'queued' — job scheduled for immediate execution.")
    queued_at: datetime.datetime = Field(
        description="UTC timestamp when the immediate trigger was queued."
    )


class CalendarRefreshSource(BaseModel):
    """Per-source result inside CalendarRefreshResult."""

    model_config = {"populate_by_name": True}

    source: str = Field(description="Source name: 'ibge' | 'bcb' | 'hardcoded'.")
    status: str = Field(description="'ok' | 'failed'.")
    count: int = Field(description="Records produced by this source.")
    error: str | None = Field(default=None, description="Error message on failure.")


class CalendarRefreshResult(BaseModel):
    """Response schema for POST /admin/refresh-calendar."""

    model_config = {"populate_by_name": True}

    upserted: int = Field(description="Number of release rows inserted/updated.")
    scraped_count: int = Field(description="Records returned by scrapers.")
    hardcoded_count: int = Field(description="Records returned by hardcoded fallback.")
    skipped_daily: int = Field(description="Daily-series records filtered out.")
    sources: list[CalendarRefreshSource] = Field(
        default_factory=list,
        description="Per-source breakdown.",
    )
    refreshed_at: datetime.datetime = Field(
        description="UTC timestamp when this refresh ran.",
    )


class BackfillItemResult(BaseModel):
    """Per-series result inside BackfillResult."""

    model_config = {"populate_by_name": True}

    code: str = Field(description="Series code.")
    status: str = Field(description="'success' | 'failed'.")
    observations_upserted: int = Field(description="Rows inserted/updated.")
    error: str | None = Field(default=None, description="Failure detail.")


class BackfillResult(BaseModel):
    """Response schema for POST /admin/backfill."""

    model_config = {"populate_by_name": True}

    total: int = Field(description="Total series attempted.")
    success: int = Field(description="Number of series that completed successfully.")
    failed: int = Field(description="Number of series that failed.")
    items: list[BackfillItemResult] = Field(
        default_factory=list,
        description="Per-series outcome list.",
    )
    started_at: datetime.datetime = Field(description="UTC timestamp when backfill began.")
    finished_at: datetime.datetime = Field(description="UTC timestamp when backfill ended.")


class ExtractionResultResponse(BaseModel):
    """Response schema for POST /admin/extract/{code}.

    Reports the outcome of a manual extraction trigger.
    """

    model_config = {"populate_by_name": True}

    series_code: str = Field(description="Series code that was extracted.")
    status: str = Field(
        description="Outcome: 'success' | 'failed'. Mirrors series.status after the run."
    )
    observations_upserted: int = Field(
        description="Number of observation rows inserted or updated."
    )
    latest_observed_at: datetime.datetime | None = Field(
        default=None,
        description="Timestamp of the most recent observation after this extraction. Null on failure.",
    )
    extraction_at: datetime.datetime = Field(
        description="UTC timestamp when the extraction was triggered."
    )
    error: str | None = Field(
        default=None,
        description="Error message if the extraction failed. Null on success.",
    )
