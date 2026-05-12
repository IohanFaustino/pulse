"""SQLAlchemy ORM model for the `releases` table.

Stores scheduled release dates for economic indicators. Used by the Calendário
page. Populated by Phase 6 calendar scrapers and hardcoded fallback data.
Daily-frequency series are excluded from the calendar per spec FR-6.7.
"""

import datetime

from sqlalchemy import BigInteger, Date, ForeignKey, Index, String
from sqlalchemy.orm import Mapped, mapped_column

from api_extractor.db import Base


class Release(Base):
    """A scheduled or realized release event for an indicator.

    Attributes:
        id: Surrogate PK (bigserial).
        series_code: FK to `series.code`.
        scheduled_for: Expected publication date.
        status: "expected" (future) | "realized" (past, confirmed published).
        source_type: How the date was determined: "scraped" | "hardcoded" | "inferred".
    """

    __tablename__ = "releases"
    __table_args__ = (
        Index("ix_releases_series_code", "series_code"),
        Index("ix_releases_scheduled_for", "scheduled_for"),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    series_code: Mapped[str] = mapped_column(
        String(64),
        ForeignKey("series.code", ondelete="CASCADE"),
        nullable=False,
    )
    scheduled_for: Mapped[datetime.date] = mapped_column(Date, nullable=False)
    status: Mapped[str] = mapped_column(
        String(16), nullable=False, server_default="expected"
    )
    source_type: Mapped[str] = mapped_column(
        String(16), nullable=False, server_default="hardcoded"
    )
