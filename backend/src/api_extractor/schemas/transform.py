"""Pydantic v2 schemas for the transform resource.

TransformRequest wraps TransformSpec for the POST body.
TransformResponse mirrors the TransformService result dict shape.
"""

from __future__ import annotations

from typing import Any

from pydantic import BaseModel, Field

from api_extractor.transforms.spec import TransformSpec


class TransformRequest(BaseModel):
    """Request body for POST /series/{code}/transform."""

    model_config = {"populate_by_name": True}

    op: str = Field(
        description=(
            "Transform operation identifier. One of: level, sa, calendar_adj, "
            "mom, qoq, yoy, annualized, diff, log_diff, pp, ma, ewma, "
            "accum12, stddev12, rebase, zscore, percentile."
        )
    )
    params: dict[str, Any] = Field(
        default_factory=dict,
        description=(
            "Operation parameters. op-specific keys: "
            "ma → {window: int (default 12)}, "
            "ewma → {span: int (default 12)}, "
            "rebase → {base: float (default 100.0)}. "
            "All other ops ignore params."
        ),
    )

    def to_spec(self) -> TransformSpec:
        """Convert to the internal TransformSpec model."""
        return TransformSpec(op=self.op, params=self.params)  # type: ignore[arg-type]


class GapRecord(BaseModel):
    """A single NaN gap detected in a transformed series."""

    model_config = {"populate_by_name": True}

    date: str = Field(description="ISO-8601 date string (YYYY-MM-DD) of the gap.")
    reason: str = Field(
        default="missing_upstream",
        description="Reason for the gap. Currently always 'missing_upstream'.",
    )


class TransformMetadata(BaseModel):
    """Metadata about a transform computation result."""

    model_config = {"populate_by_name": True}

    gaps: list[GapRecord] = Field(
        default_factory=list,
        description="List of NaN positions detected after transform. Empty when no gaps.",
    )
    stub: bool = Field(
        default=False,
        description="True when the op is a stub (sa, calendar_adj) — values are level passthrough.",
    )
    op: str = Field(description="Transform operation applied.")
    params: dict[str, Any] = Field(
        default_factory=dict, description="Effective parameters used."
    )
    cached: bool = Field(
        description="True if the result was served from Redis cache."
    )
    latest_observed_at: str | None = Field(
        default=None,
        description="ISO-8601 timestamp of the most recent observation used for cache keying.",
    )


class TransformValuePoint(BaseModel):
    """A single (date, value) point in a transform result."""

    model_config = {"populate_by_name": True}

    date: str = Field(description="ISO-8601 date string (YYYY-MM-DD).")
    value: float | None = Field(
        description="Transformed float value. null where the transform produced NaN."
    )


class TransformResponse(BaseModel):
    """Response schema for POST /series/{code}/transform."""

    model_config = {"populate_by_name": True}

    series_code: str = Field(description="Series code the transform was applied to.")
    values: list[TransformValuePoint] = Field(
        description="Transformed time series ordered by date ascending."
    )
    metadata: TransformMetadata = Field(description="Computation metadata including gap list.")
