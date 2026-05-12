"""Health router — GET /health.

Returns overall system health and per-series freshness summary.
The frontend sidebar sync indicator polls this endpoint.
"""

from __future__ import annotations

import datetime
from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from api_extractor.deps import get_session
from api_extractor.repos.series_repo import SeriesRepo
from api_extractor.schemas.common import HealthResponse, SeriesFreshness

router = APIRouter(tags=["health"])


@router.get(
    "/health",
    response_model=HealthResponse,
    summary="System health + per-series freshness",
    description=(
        "Returns the overall health status and a list of all 25 series with "
        "their current freshness state (fresh | stale | failed) and the "
        "timestamp of the last successful extraction. "
        "The frontend sidebar uses this to display the sync indicator."
    ),
)
async def get_health(
    session: Annotated[AsyncSession, Depends(get_session)],
) -> HealthResponse:
    """Aggregate health check with per-series freshness list."""
    repo = SeriesRepo(session)
    all_series = await repo.list_all()

    freshness_items = [
        SeriesFreshness(
            code=s.code,
            status=s.status,
            last_success_at=s.last_success_at,
        )
        for s in all_series
    ]

    # Degraded if any series is stale or failed.
    any_degraded = any(s.status != "fresh" for s in all_series)
    # All series have never been extracted yet → treat as degraded but not failed.
    all_never_extracted = all(s.last_success_at is None for s in all_series)

    if not all_series:
        aggregate = "ok"
    elif all_never_extracted:
        aggregate = "pending"
    elif any_degraded:
        aggregate = "degraded"
    else:
        aggregate = "ok"

    # sync_at: min last_success_at if any series has one; else None
    successes = [s.last_success_at for s in all_series if s.last_success_at is not None]
    sync_at = min(successes) if successes else None

    return HealthResponse(
        status=aggregate,
        series=freshness_items,
        checked_at=datetime.datetime.now(tz=datetime.timezone.utc),
        sync_at=sync_at,
    )
