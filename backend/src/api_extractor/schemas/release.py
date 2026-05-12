"""Pydantic v2 schemas for the releases (calendar) resource."""

from __future__ import annotations

import datetime

from pydantic import BaseModel, Field


class ReleaseRead(BaseModel):
    """A scheduled or realized release event for an economic indicator.

    Daily-frequency series are excluded from releases (FR-6.7).
    """

    model_config = {"from_attributes": True, "populate_by_name": True}

    id: int = Field(description="Surrogate primary key.")
    series_code: str = Field(description="Series code this release belongs to.")
    scheduled_for: datetime.date = Field(
        description="Expected publication date (ISO-8601 date)."
    )
    status: str = Field(
        description="'expected' (future/unconfirmed) | 'realized' (past, confirmed published)."
    )
    source_type: str = Field(
        description="How the date was determined: 'scraped' | 'hardcoded' | 'inferred'."
    )


class ReleaseListResponse(BaseModel):
    """Response schema for GET /releases."""

    model_config = {"populate_by_name": True}

    items: list[ReleaseRead] = Field(
        description="Release events ordered by scheduled_for ascending."
    )
    total: int = Field(description="Total number of events returned.")
    month: str | None = Field(
        default=None, description="Month filter applied, if any (YYYY-MM format)."
    )
    category: str | None = Field(
        default=None, description="Category filter applied, if any."
    )
