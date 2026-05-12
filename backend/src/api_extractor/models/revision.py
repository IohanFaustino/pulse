"""SQLAlchemy ORM model for the `revisions` table.

Records whenever an observation's value is revised upstream — i.e., when an
`ObservationRepo.bulk_upsert` detects a value change for an existing
`(series_code, measure_key, observed_at)` triplet. Phase 2 extractors write to
this table via `ObservationRepo`.
"""

import datetime
from decimal import Decimal

from sqlalchemy import BigInteger, DateTime, ForeignKey, Index, Numeric, String, Text, func, text
from sqlalchemy.orm import Mapped, mapped_column

from api_extractor.db import Base


class Revision(Base):
    """Audit record of a revised observation value.

    Attributes:
        id: Surrogate PK (bigserial).
        series_code: FK to `series.code`.
        measure_key: Identifies which measure was revised. Defaults to 'default'.
        observed_at: The observation date that was revised.
        old_value: Value before the revision.
        new_value: Value after the revision (now stored in `observations`).
        revised_at: When the revision was detected and recorded.
    """

    __tablename__ = "revisions"
    __table_args__ = (
        Index("ix_revisions_series_measure_date", "series_code", "measure_key", "observed_at"),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    series_code: Mapped[str] = mapped_column(
        String(64),
        ForeignKey("series.code", ondelete="CASCADE"),
        nullable=False,
    )
    measure_key: Mapped[str] = mapped_column(
        Text,
        nullable=False,
        server_default=text("'default'"),
        default="default",
    )
    observed_at: Mapped[datetime.datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
    )
    old_value: Mapped[Decimal] = mapped_column(
        Numeric(precision=20, scale=6),
        nullable=False,
    )
    new_value: Mapped[Decimal] = mapped_column(
        Numeric(precision=20, scale=6),
        nullable=False,
    )
    revised_at: Mapped[datetime.datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )
