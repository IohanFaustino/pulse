"""Hardcoded fallback calendar reader.

Reads ``backend/data/calendar.json`` and validates against
``DAILY_SERIES_CODES`` (FR-6.7: daily series must not appear in the calendar).
"""

from __future__ import annotations

import datetime
import json
from pathlib import Path
from typing import ClassVar

from api_extractor.calendar_scraper._mapping import DAILY_SERIES_CODES
from api_extractor.calendar_scraper.base import (
    SOURCE_TYPE_HARDCODED,
    CalendarScrapeError,
    CalendarSource,
    ReleaseRecord,
)

# Project layout: this file at backend/src/api_extractor/calendar_scraper/hardcoded.py
# Data file at:    backend/data/calendar.json
_DEFAULT_PATH = Path(__file__).resolve().parents[3] / "data" / "calendar.json"


class HardcodedCalendar(CalendarSource):
    """Loads a curated annual release schedule from JSON."""

    name: ClassVar[str] = "hardcoded"

    def __init__(self, path: Path | str | None = None) -> None:
        self._path = Path(path) if path is not None else _DEFAULT_PATH

    async def fetch_releases(self) -> list[ReleaseRecord]:
        if not self._path.exists():
            raise CalendarScrapeError(self.name, f"file not found: {self._path}")
        try:
            raw = json.loads(self._path.read_text(encoding="utf-8"))
        except json.JSONDecodeError as exc:
            raise CalendarScrapeError(self.name, f"invalid JSON: {exc}") from exc

        if not isinstance(raw, list):
            raise CalendarScrapeError(self.name, "calendar.json root must be a list")

        records: list[ReleaseRecord] = []
        for idx, entry in enumerate(raw):
            if not isinstance(entry, dict):
                raise CalendarScrapeError(
                    self.name, f"entry {idx} is not an object: {entry!r}"
                )
            code = entry.get("series_code")
            scheduled_for_raw = entry.get("scheduled_for")
            if not isinstance(code, str) or not isinstance(scheduled_for_raw, str):
                raise CalendarScrapeError(
                    self.name,
                    f"entry {idx} missing series_code/scheduled_for: {entry!r}",
                )
            if code in DAILY_SERIES_CODES:
                raise CalendarScrapeError(
                    self.name,
                    f"daily series {code!r} present in hardcoded calendar "
                    "(FR-6.7 violation)",
                )
            try:
                scheduled = datetime.date.fromisoformat(scheduled_for_raw)
            except ValueError as exc:
                raise CalendarScrapeError(
                    self.name,
                    f"entry {idx} has invalid scheduled_for {scheduled_for_raw!r}: {exc}",
                ) from exc
            records.append(
                ReleaseRecord(
                    series_code=code,
                    scheduled_for=scheduled,
                    source_type=SOURCE_TYPE_HARDCODED,
                )
            )
        return records
