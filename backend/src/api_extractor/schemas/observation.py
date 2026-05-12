"""Pydantic v2 schemas for the observations resource.

Decimal values stored in Postgres (Numeric 20,6) are returned as float
at this serialization boundary. This is intentional and documented in
the OpenAPI descriptions — consumers should treat values as float64.
"""

from __future__ import annotations

import datetime

from pydantic import BaseModel, Field


class ObservationRead(BaseModel):
    """A single time-series data point.

    Note: `value` is returned as float (converted from Decimal at the DB
    boundary). Precision is preserved to 6 decimal places by the DB schema.
    """

    model_config = {"from_attributes": True, "populate_by_name": True}

    observed_at: datetime.datetime = Field(
        description="UTC timestamp of the observation (timezone-aware ISO-8601)."
    )
    value: float = Field(
        description="Numeric value as float64. Source precision: Numeric(20, 6)."
    )
    ingested_at: datetime.datetime = Field(
        description="UTC timestamp when this row was first written to the database."
    )


class ObservationListResponse(BaseModel):
    """Response schema for GET /series/{code}/observations."""

    model_config = {"populate_by_name": True}

    series_code: str = Field(description="Series code these observations belong to.")
    items: list[ObservationRead] = Field(
        description="Observations ordered by observed_at ascending."
    )
    total: int = Field(description="Total rows matching the query before limit was applied.")
    returned: int = Field(description="Number of rows in this response.")
    limit: int = Field(description="Effective limit applied (max 5000, default 500).")
    from_dt: datetime.datetime | None = Field(
        default=None, description="Lower bound applied (inclusive), if provided."
    )
    to_dt: datetime.datetime | None = Field(
        default=None, description="Upper bound applied (inclusive), if provided."
    )
