"""Shared interface for upstream data source adapters.

Each adapter implements `SourceAdapter.fetch` to pull observations
for a single series from its upstream API. Adapters are stateless and
idempotent; orchestrator passes them to the observation repo for upsert.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass
from datetime import date, datetime
from decimal import Decimal
from typing import Protocol

from api_extractor.models.series import Series


@dataclass(frozen=True, slots=True)
class FetchedObservation:
    """A single observation pulled from upstream, normalized.

    `observed_at` is timezone-aware UTC. Daily series anchor to 00:00 UTC
    of the trading day; monthly/quarterly series anchor to the first day
    of the period at 00:00 UTC.
    """

    series_code: str
    observed_at: datetime
    value: Decimal


@dataclass(frozen=True, slots=True)
class ExtractionResult:
    """Outcome of one extraction run for one series."""

    series_code: str
    observations: list[FetchedObservation]
    fetched_at: datetime
    source: str
    raw_payload_path: str | None = None
    """Optional pointer to the captured raw response (for audit / replay)."""


class SourceAdapter(ABC):
    """Base class for all upstream source adapters.

    Subclasses MUST:
    - implement `fetch` with their source-specific request logic
    - use `httpx.AsyncClient` for HTTP I/O (never blocking)
    - wrap network calls with `tenacity` retry (3x exp backoff: 2s, 8s, 30s)
    - return observations sorted by `observed_at` ascending
    - raise `ExtractionError` (or subclass) on final failure
    """

    source: str  # subclass class-attr: "bcb_sgs" | "ibge_sidra" | "b3_yahoo"

    @abstractmethod
    async def fetch(
        self,
        series: Series,
        since: date | None = None,
    ) -> ExtractionResult:
        """Fetch observations for `series` since `since` (inclusive).

        If `since` is None, fetch full history from `series.first_observation`.
        Adapters must respect `series.source_id` to address the upstream
        resource.
        """
        ...


class ExtractionError(Exception):
    """Raised when extraction fails after all retries are exhausted."""

    def __init__(self, source: str, series_code: str, message: str) -> None:
        super().__init__(f"[{source}:{series_code}] {message}")
        self.source = source
        self.series_code = series_code
