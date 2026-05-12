"""Shared response schemas used across multiple routers.

- HealthResponse: extended health check with per-series freshness.
- ErrorResponse: structured error detail for exception handlers.
- PaginationMeta: common pagination metadata for list endpoints.
"""

from __future__ import annotations

import datetime

from pydantic import BaseModel, Field


class SeriesFreshness(BaseModel):
    """Freshness record for a single series, returned inside HealthResponse."""

    model_config = {"populate_by_name": True}

    code: str = Field(description="Series code, e.g. 'IPCA'.")
    status: str = Field(description="'fresh' | 'stale' | 'failed'.")
    last_success_at: datetime.datetime | None = Field(
        default=None,
        description="UTC timestamp of last successful extraction. Null if never extracted.",
    )


class HealthResponse(BaseModel):
    """Response schema for GET /health.

    Summarises overall system health and per-series freshness.
    """

    model_config = {"populate_by_name": True}

    status: str = Field(
        description="Aggregate status: 'ok' if all series are fresh, 'degraded' otherwise."
    )
    series: list[SeriesFreshness] = Field(
        default_factory=list,
        description="Per-series freshness list ordered by category then code.",
    )
    checked_at: datetime.datetime = Field(
        description="UTC timestamp when this health check was computed."
    )
    sync_at: datetime.datetime | None = Field(
        default=None,
        description="Oldest 'last_success_at' across series — represents minimum sync freshness. Null if any series never extracted.",
    )


class ErrorResponse(BaseModel):
    """Structured error body for 4xx / 5xx responses.

    Used by custom exception handlers so OpenAPI can document error shapes.
    """

    model_config = {"populate_by_name": True}

    detail: str = Field(description="Human-readable error message.")
    code: str | None = Field(
        default=None,
        description="Optional machine-readable error code (e.g. 'series_not_found').",
    )


class PaginationMeta(BaseModel):
    """Pagination metadata appended to list responses."""

    model_config = {"populate_by_name": True}

    total: int = Field(description="Total number of items matching the query (before limit).")
    returned: int = Field(description="Number of items returned in this response.")
    limit: int = Field(description="Effective limit applied.")
