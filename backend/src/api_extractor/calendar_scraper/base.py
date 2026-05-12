"""Calendar source ABC and shared types.

Each ``CalendarSource`` implementation returns a list of ``ReleaseRecord``s
keyed by ``(series_code, scheduled_for)``. The orchestrator (``service.py``)
merges sources and upserts into the ``releases`` table.

Daily-frequency series are excluded from the calendar per spec FR-6.7. Source
implementations are responsible for not emitting daily-series records.
"""

from __future__ import annotations

import datetime
from abc import ABC, abstractmethod
from dataclasses import dataclass

# ── Source-type tags persisted on the releases row ────────────────────────────
SOURCE_TYPE_SCRAPED = "scraped"
SOURCE_TYPE_HARDCODED = "hardcoded"
SOURCE_TYPES: frozenset[str] = frozenset({SOURCE_TYPE_SCRAPED, SOURCE_TYPE_HARDCODED})


@dataclass(frozen=True, slots=True)
class ReleaseRecord:
    """A single planned release event.

    Attributes:
        series_code: Series code as defined in seed (``IPCA``, ``PIB``, ...).
        scheduled_for: Calendar date of the release (timezone-naive, in BRT
            conceptually; we store as ``date`` not ``datetime``).
        source_type: ``scraped`` when produced by a live scraper; ``hardcoded``
            when produced by the JSON fallback.
    """

    series_code: str
    scheduled_for: datetime.date
    source_type: str

    def __post_init__(self) -> None:
        if self.source_type not in SOURCE_TYPES:
            raise ValueError(
                f"source_type must be one of {sorted(SOURCE_TYPES)}, "
                f"got {self.source_type!r}"
            )


class CalendarSource(ABC):
    """Abstract calendar source.

    Subclasses MUST:
    - implement ``fetch_releases`` returning a list of ``ReleaseRecord``
    - raise ``CalendarScrapeError`` on any failure that should trigger
      the orchestrator's fallback path.
    """

    name: str  # class-attr: "ibge" | "bcb" | "hardcoded"

    @abstractmethod
    async def fetch_releases(self) -> list[ReleaseRecord]:
        """Return all upcoming releases the source knows about."""
        ...


class CalendarScrapeError(Exception):
    """Raised when a scraper cannot produce a usable result.

    The orchestrator catches this and falls back to hardcoded data for the
    affected source's coverage.
    """

    def __init__(self, source: str, message: str) -> None:
        super().__init__(f"[calendar:{source}] {message}")
        self.source = source
