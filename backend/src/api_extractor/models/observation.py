"""SQLAlchemy ORM model for the `observations` table.

This table is configured as a TimescaleDB hypertable partitioned by `observed_at`.
The hypertable creation is performed via raw SQL in the Alembic migration (not here).

Primary key is `(series_code, measure_key, observed_at)` — TimescaleDB requires the
partition column to be part of the PK or have a unique constraint including it.
`measure_key` defaults to 'default' for all legacy single-measure series, preserving
full backwards compatibility.
"""

import datetime
from decimal import Decimal

from sqlalchemy import DateTime, ForeignKey, Index, Numeric, String, Text, func, text
from sqlalchemy.orm import Mapped, mapped_column

from api_extractor.db import Base


class Observation(Base):
    """A single time-series data point for an economic indicator.

    Attributes:
        series_code: FK to `series.code`. Part of composite PK.
        measure_key: Identifies which measure this observation belongs to (e.g., 'default',
            'pct_qoq', 'pct_yoy', 'close'). Defaults to 'default' for legacy series.
            Part of composite PK.
        observed_at: Timestamp of the observation (partition key). Part of composite PK.
        value: Numeric value. Using Decimal for precision-sensitive financial data.
        ingested_at: When this row was first written to the database.
    """

    __tablename__ = "observations"
    __table_args__ = (
        # TimescaleDB drops standalone UNIQUE constraints when converting to hypertable.
        # The PK (series_code, measure_key, observed_at) serves as the uniqueness guarantee.
        # Compound index for sparkline and range queries.
        Index(
            "ix_observations_series_measure_date_desc",
            "series_code",
            "measure_key",
            "observed_at",
        ),
    )

    # Composite primary key — all three columns required.
    series_code: Mapped[str] = mapped_column(
        String(64),
        ForeignKey("series.code", ondelete="CASCADE"),
        primary_key=True,
    )
    measure_key: Mapped[str] = mapped_column(
        Text,
        primary_key=True,
        nullable=False,
        server_default=text("'default'"),
        default="default",
    )
    observed_at: Mapped[datetime.datetime] = mapped_column(
        DateTime(timezone=True),
        primary_key=True,
        nullable=False,
    )
    value: Mapped[Decimal] = mapped_column(
        Numeric(precision=20, scale=6),
        nullable=False,
    )
    ingested_at: Mapped[datetime.datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )
