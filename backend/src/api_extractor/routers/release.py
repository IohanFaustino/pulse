"""Release router — GET /releases.

Returns calendar events (release dates) filtered by month and/or category.
Daily-frequency series are excluded per FR-6.7.
The category filter requires joining with the series table since releases
have no direct category column.
"""

from __future__ import annotations

import re
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import extract, select
from sqlalchemy.ext.asyncio import AsyncSession

from api_extractor.deps import get_session
from api_extractor.models.release import Release
from api_extractor.models.series import Series
from api_extractor.schemas.release import ReleaseListResponse, ReleaseRead

router = APIRouter(tags=["releases"])

_MONTH_PATTERN = re.compile(r"^\d{4}-(?:0[1-9]|1[0-2])$")


@router.get(
    "/releases",
    response_model=ReleaseListResponse,
    summary="List release calendar events",
    description=(
        "Returns scheduled and realized release events for economic indicators. "
        "Filter by `month` (YYYY-MM format) and/or `category` (pt-BR category name). "
        "Daily-frequency series are excluded from the calendar per FR-6.7. "
        "Events with scheduled_for in the past will have status='realized'; "
        "future events will have status='expected'."
    ),
    responses={
        200: {"description": "Release events returned."},
        422: {"description": "Invalid month format. Use YYYY-MM."},
    },
)
async def list_releases(
    session: Annotated[AsyncSession, Depends(get_session)],
    month: str | None = Query(
        default=None,
        description="Filter by calendar month in YYYY-MM format (e.g. '2026-05').",
        examples=["2026-05"],
    ),
    category: str | None = Query(
        default=None,
        description=(
            "Filter by series category (pt-BR). "
            "E.g. 'Inflação', 'Juros', 'Câmbio', 'Mercado', 'Atividade', "
            "'Trabalho', 'Fiscal', 'Externo'."
        ),
    ),
) -> ReleaseListResponse:
    """Return release events filtered by month and/or category."""
    if month is not None and not _MONTH_PATTERN.match(month):
        raise HTTPException(
            status_code=422,
            detail=f"Invalid month format: {month!r}. Expected YYYY-MM (e.g. '2026-05').",
        )

    # Build query joining releases → series to support category filter + daily exclusion.
    stmt = (
        select(Release)
        .join(Series, Series.code == Release.series_code)
        .where(Series.frequency != "daily")  # FR-6.7: exclude daily series from calendar
        .order_by(Release.scheduled_for.asc())
    )

    if month is not None:
        year_int, month_int = int(month[:4]), int(month[5:])
        stmt = stmt.where(extract("year", Release.scheduled_for) == year_int)
        stmt = stmt.where(extract("month", Release.scheduled_for) == month_int)

    if category is not None:
        stmt = stmt.where(Series.category == category)

    result = await session.execute(stmt)
    rows = list(result.scalars().all())

    items = [
        ReleaseRead(
            id=r.id,
            series_code=r.series_code,
            scheduled_for=r.scheduled_for,
            status=r.status,
            source_type=r.source_type,
        )
        for r in rows
    ]

    return ReleaseListResponse(
        items=items,
        total=len(items),
        month=month,
        category=category,
    )
