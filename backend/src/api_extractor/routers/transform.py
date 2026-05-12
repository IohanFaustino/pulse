"""Transform router — POST /series/{code}/transform.

Applies a pandas transform to stored observations for a series.
Results are cached in Redis per ADR-0006 (key includes spec hash + latest_observed_at).
"""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from pydantic import ValidationError
from sqlalchemy.ext.asyncio import AsyncSession

from api_extractor.deps import TransformServiceDep, get_session
from api_extractor.repos.observation_repo import ObservationRepo
from api_extractor.repos.series_repo import SeriesRepo
from api_extractor.schemas.transform import (
    GapRecord,
    TransformMetadata,
    TransformRequest,
    TransformResponse,
    TransformValuePoint,
)
from api_extractor.transforms.service import TransformService

router = APIRouter(tags=["transform"])


@router.post(
    "/series/{code}/transform",
    response_model=TransformResponse,
    summary="Apply a transform to a series",
    description=(
        "Applies the requested statistical transform to all stored observations "
        "for the series. Results are cached in Redis (TTL: daily=1h, monthly=24h, "
        "quarterly=7d). Cache key includes the transform spec hash and the latest "
        "observed_at timestamp, so new observations automatically invalidate the cache. "
        "NaN positions produced by the transform are reported in `metadata.gaps`. "
        "Decimal DB values are returned as float64."
    ),
    responses={
        200: {"description": "Transform applied and result returned."},
        404: {"description": "Series code not found."},
        422: {
            "description": (
                "Invalid TransformSpec: unknown op or invalid params. "
                "See spec for valid op values."
            )
        },
        503: {"description": "Transform computation failed (e.g. numeric overflow)."},
    },
)
async def apply_transform(
    code: str,
    body: TransformRequest,
    session: Annotated[AsyncSession, Depends(get_session)],
    transform_svc: TransformServiceDep,
) -> TransformResponse:
    """Apply a transform to all observations for the given series."""
    series_repo = SeriesRepo(session)
    series = await series_repo.get(code)
    if series is None:
        raise HTTPException(status_code=404, detail=f"Series not found: {code!r}")

    # Validate the TransformSpec (validates the op Literal).
    try:
        spec = body.to_spec()
    except ValidationError as exc:
        raise HTTPException(
            status_code=422,
            detail=f"Invalid transform spec: {exc.errors()}",
        ) from exc

    # Load all observations (transform needs full history for window ops like yoy, accum12).
    obs_repo = ObservationRepo(session)
    import datetime
    all_obs = await obs_repo.get_range(
        series_code=code,
        from_dt=datetime.datetime(1900, 1, 1, tzinfo=datetime.timezone.utc),
        to_dt=datetime.datetime(2100, 12, 31, tzinfo=datetime.timezone.utc),
    )

    # Map ORM objects to the dict shape TransformService expects.
    obs_dicts = [
        {"observed_at": o.observed_at, "value": o.value}
        for o in all_obs
    ]

    try:
        result = await transform_svc.run(
            series_code=code,
            spec=spec,
            frequency=series.frequency,
            observations=obs_dicts,
        )
    except Exception as exc:
        raise HTTPException(
            status_code=503,
            detail=f"Transform computation failed: {exc!r}",
        ) from exc

    # Unpack result dict into typed response schema.
    raw_values = result.get("values", [])
    raw_meta = result.get("metadata", {})

    values = [
        TransformValuePoint(date=v["date"], value=v["value"])
        for v in raw_values
    ]

    gap_dicts = raw_meta.get("gaps", [])
    gaps = [
        GapRecord(
            date=g["date"] if isinstance(g, dict) else str(g),
            reason=g.get("reason", "missing_upstream") if isinstance(g, dict) else "missing_upstream",
        )
        for g in gap_dicts
    ]

    # Determine latest_observed_at for metadata transparency.
    latest_obs_at: str | None = None
    if all_obs:
        latest_obs_at = max(o.observed_at for o in all_obs).isoformat()

    metadata = TransformMetadata(
        gaps=gaps,
        stub=raw_meta.get("stub", False),
        op=raw_meta.get("op", spec.op),
        params=raw_meta.get("params", spec.params),
        cached=raw_meta.get("cached", False),
        latest_observed_at=latest_obs_at,
    )

    return TransformResponse(
        series_code=code,
        values=values,
        metadata=metadata,
    )
