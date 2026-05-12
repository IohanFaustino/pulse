"""Series router.

GET /series                                — list all series (optional ?category= filter)
GET /series/{code}                         — single series metadata
GET /series/{code}/observations            — raw observations with ?from=&to=&limit=
"""

from __future__ import annotations

import datetime
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from api_extractor.deps import get_session
from api_extractor.repos.observation_repo import ObservationRepo
from api_extractor.repos.release_repo import ReleaseRepo
from api_extractor.repos.series_repo import SeriesRepo
from api_extractor.schemas.observation import ObservationListResponse, ObservationRead
from api_extractor.schemas.series import SeriesListResponse, SeriesRead

router = APIRouter(tags=["series"])

_MAX_LIMIT = 5000
_DEFAULT_LIMIT = 500


def _parse_date_param(value: str | None, param_name: str) -> datetime.datetime | None:
    """Parse an ISO-8601 date or datetime string to a UTC-aware datetime.

    Accepts:
    - ``YYYY-MM-DD`` (date only, anchored to 00:00 UTC)
    - ``YYYY-MM-DDTHH:MM:SS`` (naive, treated as UTC)
    - ``YYYY-MM-DDTHH:MM:SS+HH:MM`` (tz-aware, converted to UTC)

    Raises:
        HTTPException 422: On parse failure.
    """
    if value is None:
        return None
    for fmt in ("%Y-%m-%d", "%Y-%m-%dT%H:%M:%S", "%Y-%m-%dT%H:%M:%SZ"):
        try:
            dt = datetime.datetime.strptime(value, fmt)
            return dt.replace(tzinfo=datetime.timezone.utc)
        except ValueError:
            continue
    # Try standard ISO with offset (Python 3.11+ fromisoformat handles offsets).
    try:
        dt = datetime.datetime.fromisoformat(value)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=datetime.timezone.utc)
        return dt.astimezone(datetime.timezone.utc)
    except ValueError:
        raise HTTPException(
            status_code=422,
            detail=f"Invalid date format for '{param_name}': {value!r}. "
            f"Use ISO-8601: YYYY-MM-DD or YYYY-MM-DDTHH:MM:SS.",
        )


@router.get(
    "/series",
    response_model=SeriesListResponse,
    summary="List all economic indicator series",
    description=(
        "Returns all 25 configured series with their metadata and current "
        "extraction status. Optionally filter by category (e.g. 'Inflação', "
        "'Juros', 'Câmbio', 'Mercado', 'Atividade', 'Trabalho', 'Fiscal', 'Externo')."
    ),
    responses={200: {"description": "Series list returned successfully."}},
)
async def list_series(
    session: Annotated[AsyncSession, Depends(get_session)],
    category: str | None = Query(
        default=None,
        description="Filter by category name (case-sensitive, pt-BR). Omit to return all.",
    ),
) -> SeriesListResponse:
    """List all series, optionally filtered by category."""
    repo = SeriesRepo(session)
    if category:
        rows = await repo.list_by_category(category)
    else:
        rows = await repo.list_all()

    release_repo = ReleaseRepo(session)
    next_release_map = await release_repo.next_for_all()

    items = [SeriesRead.from_orm_row(r, next_release_map.get(r.code)) for r in rows]
    return SeriesListResponse(items=items, total=len(items))


@router.get(
    "/series/{code}",
    response_model=SeriesRead,
    summary="Get single series metadata",
    description=(
        "Returns full metadata for one economic indicator series, including "
        "source information, frequency, unit, and current extraction status. "
        "Used by the Metadados dossier page."
    ),
    responses={
        200: {"description": "Series metadata returned."},
        404: {"description": "Series code not found."},
    },
)
async def get_series(
    code: str,
    session: Annotated[AsyncSession, Depends(get_session)],
) -> SeriesRead:
    """Fetch metadata for a single series by code."""
    repo = SeriesRepo(session)
    row = await repo.get(code)
    if row is None:
        raise HTTPException(status_code=404, detail=f"Series not found: {code!r}")
    next_release_at = await ReleaseRepo(session).next_for(code)
    return SeriesRead.from_orm_row(row, next_release_at)


@router.get(
    "/series/{code}/observations",
    response_model=ObservationListResponse,
    summary="Get raw observations for a series",
    description=(
        "Returns stored time-series observations for the given series. "
        "Supports optional date range filtering via `from` and `to` (ISO-8601). "
        "Results are ordered by observed_at ascending. "
        "Maximum 5000 rows returned per request (default 500). "
        "Decimal values stored in Postgres are returned as float64."
    ),
    responses={
        200: {"description": "Observations returned."},
        404: {"description": "Series code not found."},
        422: {"description": "Invalid date format or limit out of range."},
    },
)
async def get_observations(
    code: str,
    session: Annotated[AsyncSession, Depends(get_session)],
    from_: str | None = Query(
        default=None,
        alias="from",
        description="Start date (inclusive). ISO-8601: YYYY-MM-DD or YYYY-MM-DDTHH:MM:SS.",
    ),
    to: str | None = Query(
        default=None,
        description="End date (inclusive). ISO-8601: YYYY-MM-DD or YYYY-MM-DDTHH:MM:SS.",
    ),
    limit: int = Query(
        default=_DEFAULT_LIMIT,
        ge=1,
        le=_MAX_LIMIT,
        description=f"Maximum rows to return. Default {_DEFAULT_LIMIT}, max {_MAX_LIMIT}.",
    ),
) -> ObservationListResponse:
    """Return raw observations for a series with optional date range and limit."""
    series_repo = SeriesRepo(session)
    series = await series_repo.get(code)
    if series is None:
        raise HTTPException(status_code=404, detail=f"Series not found: {code!r}")

    from_dt = _parse_date_param(from_, "from")
    to_dt = _parse_date_param(to, "to")

    obs_repo = ObservationRepo(session)

    if from_dt is not None or to_dt is not None:
        # Date-range query — fetch all matching rows, then slice.
        effective_from = from_dt or datetime.datetime(1900, 1, 1, tzinfo=datetime.timezone.utc)
        effective_to = to_dt or datetime.datetime(2100, 12, 31, tzinfo=datetime.timezone.utc)
        all_rows = await obs_repo.get_range(code, effective_from, effective_to)
        total = len(all_rows)
        sliced = all_rows[:limit]
    else:
        # No range — use total count + latest N rows.
        total = await obs_repo.count(code)
        sliced = await obs_repo.get_latest_n(code, limit)

    items = [
        ObservationRead(
            observed_at=o.observed_at,
            value=float(o.value),
            ingested_at=o.ingested_at,
        )
        for o in sliced
    ]


    return ObservationListResponse(
        series_code=code,
        items=items,
        total=total,
        returned=len(items),
        limit=limit,
        from_dt=from_dt,
        to_dt=to_dt,
    )
