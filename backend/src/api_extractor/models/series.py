"""SQLAlchemy ORM model for the `series` table.

Each row represents one economic indicator (e.g., IPCA, SELIC, PIB) with its
source metadata and extraction state. The `code` column is the natural PK used
throughout the system (e.g., "IPCA", "SELIC", "Ibovespa").
"""

import datetime
from typing import Any

from sqlalchemy import Boolean, DateTime, Index, String, Text, func, text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from api_extractor.db import Base


class Series(Base):
    """Economic indicator series metadata and extraction state.

    Attributes:
        code: Natural primary key (e.g., "IPCA", "CDI"). Used as FK in all related tables.
        name: Human-readable display name (pt-BR).
        category: Grouping category (e.g., "Inflação", "Juros", "Câmbio").
        source: Data source name ("BCB SGS", "IBGE SIDRA", "Yahoo Finance", "B3", "ANBIMA").
        source_id: Source-system identifier (e.g., BCB series number "433", IBGE table "1846").
        frequency: Extraction/release cadence: "daily" | "monthly" | "quarterly" | "event".
        unit: Unit of measure (e.g., "%", "R$", "pts", "US$ bi", "índice").
        currency: ISO 4217 currency code for the series value (e.g., "BRL", "USD", "EUR").
            Defaults to "BRL" for all domestic series.
        is_proxy: True if the series tracks an index via a proxy instrument (e.g., an ETF).
            Displayed as a "proxy via <ticker>" badge in the frontend.
        first_observation: Date of the earliest known observation for this series.
        last_extraction_at: Timestamp of most recent extraction attempt (success or fail).
        last_success_at: Timestamp of most recent successful extraction.
        status: Current freshness state: "fresh" | "stale" | "failed".
        metadata_: Arbitrary source-specific metadata (e.g., methodology notes, URLs).
        measures: List of measure descriptors for multi-measure support. Each entry is a
            dict with keys: key, name, unit, source_type, source_id, is_default, and
            optional overrides (ibge_variable, ibge_classification, frequency, transform).
            Empty list means the series uses the legacy single-measure path.
    """

    __tablename__ = "series"
    __table_args__ = (
        Index("ix_series_category", "category"),
        Index("ix_series_source", "source"),
        Index("ix_series_status", "status"),
    )

    code: Mapped[str] = mapped_column(String(64), primary_key=True)
    name: Mapped[str] = mapped_column(Text, nullable=False)
    category: Mapped[str] = mapped_column(String(64), nullable=False)
    source: Mapped[str] = mapped_column(String(64), nullable=False)
    source_id: Mapped[str] = mapped_column(String(64), nullable=False)
    frequency: Mapped[str] = mapped_column(String(16), nullable=False)
    unit: Mapped[str] = mapped_column(String(32), nullable=False)
    currency: Mapped[str] = mapped_column(
        Text, nullable=False, server_default=text("'BRL'")
    )
    is_proxy: Mapped[bool] = mapped_column(
        Boolean, nullable=False, server_default=text("FALSE")
    )
    first_observation: Mapped[datetime.date | None] = mapped_column(nullable=True)
    last_extraction_at: Mapped[datetime.datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    last_success_at: Mapped[datetime.datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    status: Mapped[str] = mapped_column(
        String(16), nullable=False, server_default="fresh"
    )
    metadata_: Mapped[dict[str, Any] | None] = mapped_column(
        "metadata", JSONB, nullable=True
    )
    created_at: Mapped[datetime.datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )
    measures: Mapped[list[dict[str, Any]]] = mapped_column(
        JSONB,
        nullable=False,
        server_default=text("'[]'::jsonb"),
        default=list,
    )
