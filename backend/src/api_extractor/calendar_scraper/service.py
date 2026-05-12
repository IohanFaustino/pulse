"""Calendar refresh orchestrator.

Pulls from IBGE + BCB scrapers (live) and the hardcoded JSON (fallback),
merges results, and upserts into the ``releases`` table via ``ReleaseRepo``.

Behavior:
- Hardcoded data is always loaded (cheap, deterministic).
- Each scraper is tried; on ``CalendarScrapeError`` the scraper's series
  coverage falls back to whatever the hardcoded calendar provides for those
  series codes.
- Scraped records take precedence over hardcoded for the same
  ``(series_code, scheduled_for)`` pair — repo upsert overwrites the source
  type.
- Daily series codes are filtered out defensively (FR-6.7).
"""

from __future__ import annotations

from dataclasses import dataclass, field

from loguru import logger
from sqlalchemy.ext.asyncio import AsyncSession

from api_extractor.calendar_scraper._mapping import DAILY_SERIES_CODES
from api_extractor.calendar_scraper.base import (
    SOURCE_TYPE_SCRAPED,
    CalendarScrapeError,
    CalendarSource,
    ReleaseRecord,
)
from api_extractor.calendar_scraper.bcb import BCBCalendarScraper
from api_extractor.calendar_scraper.hardcoded import HardcodedCalendar
from api_extractor.calendar_scraper.ibge import IBGECalendarScraper
from api_extractor.repos.release_repo import ReleaseRepo


@dataclass(slots=True)
class CalendarRefreshReport:
    """Summary of one ``refresh_all`` invocation."""

    scraped_count: int = 0
    hardcoded_count: int = 0
    upserted: int = 0
    skipped_daily: int = 0
    errors: dict[str, str] = field(default_factory=dict)


class CalendarService:
    """Orchestrates scraping + fallback + DB upsert for release calendar."""

    def __init__(
        self,
        ibge: CalendarSource | None = None,
        bcb: CalendarSource | None = None,
        hardcoded: CalendarSource | None = None,
    ) -> None:
        self._ibge = ibge if ibge is not None else IBGECalendarScraper()
        self._bcb = bcb if bcb is not None else BCBCalendarScraper()
        self._hardcoded = hardcoded if hardcoded is not None else HardcodedCalendar()

    async def collect(self) -> tuple[list[ReleaseRecord], CalendarRefreshReport]:
        """Run all sources and return merged, deduplicated records.

        Merge rule: a scraped record for the same (series_code, scheduled_for)
        overrides a hardcoded one. Daily series codes are filtered out.
        """
        report = CalendarRefreshReport()

        # ── Hardcoded always loads first (baseline) ──────────────────────────
        try:
            hardcoded_records = await self._hardcoded.fetch_releases()
        except CalendarScrapeError as exc:
            logger.warning("calendar: hardcoded fallback failed: {}", exc)
            report.errors[self._hardcoded.name] = str(exc)
            hardcoded_records = []
        report.hardcoded_count = len(hardcoded_records)

        # ── Scrapers (graceful fallback per source) ──────────────────────────
        scraped_records: list[ReleaseRecord] = []
        for scraper in (self._ibge, self._bcb):
            try:
                records = await scraper.fetch_releases()
                scraped_records.extend(records)
                logger.info(
                    "calendar: {} scraper produced {} records",
                    scraper.name,
                    len(records),
                )
            except CalendarScrapeError as exc:
                logger.warning("calendar: {} scraper failed; falling back: {}", scraper.name, exc)
                report.errors[scraper.name] = str(exc)
        report.scraped_count = len(scraped_records)

        # ── Merge: scraped wins over hardcoded ───────────────────────────────
        merged: dict[tuple[str, str], ReleaseRecord] = {}
        for record in hardcoded_records:
            merged[(record.series_code, record.scheduled_for.isoformat())] = record
        for record in scraped_records:
            merged[(record.series_code, record.scheduled_for.isoformat())] = record

        # ── FR-6.7: filter daily series defensively ──────────────────────────
        out: list[ReleaseRecord] = []
        for record in merged.values():
            if record.series_code in DAILY_SERIES_CODES:
                report.skipped_daily += 1
                continue
            out.append(record)
        return out, report

    async def refresh_all(self, session: AsyncSession) -> CalendarRefreshReport:
        """Collect + persist. Returns the run report.

        Caller is responsible for committing the session.
        Unknown ``series_code`` values (not present in the ``series`` table) are
        skipped to keep the run resilient to upstream calendars listing series
        we have not yet seeded.
        """
        records, report = await self.collect()
        # Resolve the set of known series codes once.
        from sqlalchemy import select  # local import to avoid touching imports surface
        from api_extractor.models.series import Series

        result = await session.execute(select(Series.code))
        known_codes = {row[0] for row in result.all()}

        repo = ReleaseRepo(session)
        for record in records:
            if record.series_code not in known_codes:
                logger.warning(
                    "calendar refresh: skipping unknown series_code={}",
                    record.series_code,
                )
                continue
            await repo.upsert(
                {
                    "series_code": record.series_code,
                    "scheduled_for": record.scheduled_for,
                    "source_type": record.source_type,
                    "status": "expected",
                }
            )
            report.upserted += 1
        logger.info(
            "calendar refresh: upserted={} scraped={} hardcoded={} errors={}",
            report.upserted,
            report.scraped_count,
            report.hardcoded_count,
            list(report.errors.keys()),
        )
        return report
