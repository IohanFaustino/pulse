"""Pydantic v2 schemas for the series resource.

SeriesRead maps the Series ORM model to the API response shape.
Decimal DB values are exposed as float in the API (JSON serialization boundary).
"""

from __future__ import annotations

import datetime
from typing import Any

from pydantic import BaseModel, Field


class SeriesRead(BaseModel):
    """Full metadata for a single economic indicator series.

    Numeric values stored as Decimal in Postgres are returned as float here.
    """

    model_config = {"from_attributes": True, "populate_by_name": True}

    code: str = Field(description="Series primary key, e.g. 'IPCA'.")
    name: str = Field(description="Human-readable display name (pt-BR).")
    category: str = Field(description="Grouping category, e.g. 'Inflação', 'Juros'.")
    source: str = Field(description="Data source name, e.g. 'BCB SGS', 'IBGE SIDRA'.")
    source_id: str = Field(description="Source-system identifier, e.g. '433' for BCB SGS.")
    frequency: str = Field(description="Release cadence: 'daily' | 'monthly' | 'quarterly' | 'event'.")
    unit: str = Field(description="Unit of measure, e.g. '%', 'R$', 'pts', 'índice'.")
    currency: str = Field(
        default="BRL",
        description="ISO 4217 currency code for the series value (e.g. 'BRL', 'USD', 'EUR').",
    )
    is_proxy: bool = Field(
        default=False,
        description="True if the series tracks an index via a proxy instrument (e.g. an ETF).",
    )
    first_observation: datetime.date | None = Field(
        default=None,
        description="Date of the earliest known observation for this series.",
    )
    last_extraction_at: datetime.datetime | None = Field(
        default=None,
        description="UTC timestamp of the most recent extraction attempt.",
    )
    last_success_at: datetime.datetime | None = Field(
        default=None,
        description="UTC timestamp of the most recent successful extraction.",
    )
    status: str = Field(description="Freshness status: 'fresh' | 'stale' | 'failed'.")
    next_release_at: datetime.date | None = Field(
        default=None,
        description="Date of the next scheduled release (min scheduled_for >= today). Null if no future release.",
    )
    metadata_: dict[str, Any] | None = Field(
        default=None,
        alias="metadata",
        description="Source-specific metadata (methodology notes, URLs, etc.).",
    )

    @classmethod
    def from_orm_row(cls, row: Any, next_release_at: datetime.date | None = None) -> "SeriesRead":
        """Construct from a Series ORM row, mapping metadata_ alias."""
        data = {
            "code": row.code,
            "name": row.name,
            "category": row.category,
            "source": row.source,
            "source_id": row.source_id,
            "frequency": row.frequency,
            "unit": row.unit,
            "currency": row.currency,
            "is_proxy": row.is_proxy,
            "first_observation": row.first_observation,
            "last_extraction_at": row.last_extraction_at,
            "last_success_at": row.last_success_at,
            "status": row.status,
            "next_release_at": next_release_at,
            "metadata": row.metadata_,
        }
        return cls.model_validate(data)


class SeriesListResponse(BaseModel):
    """Response schema for GET /series."""

    model_config = {"populate_by_name": True}

    items: list[SeriesRead] = Field(description="List of all series ordered by category then code.")
    total: int = Field(description="Total number of series returned.")
