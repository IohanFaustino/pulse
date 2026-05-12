"""IBGE monthly release calendar scraper.

Fetches https://www.ibge.gov.br/calendario/mensal.html and parses the
agenda entries (``div.agenda--lista__data`` + ``div.agenda--lista__evento``
pairs). Maps each IBGE indicator name to one or more series codes via
``_mapping.IBGE_NAME_TO_CODES``.

Network calls use ``httpx.AsyncClient`` with a single ``tenacity`` retry.
Calendar pages are static — fast timeout (15s) and aggressive retry don't help.
"""

from __future__ import annotations

import datetime
import re
from typing import ClassVar

import httpx
from bs4 import BeautifulSoup
from loguru import logger
from tenacity import (
    retry,
    retry_if_exception_type,
    stop_after_attempt,
    wait_fixed,
)

from api_extractor.calendar_scraper._mapping import lookup_ibge
from api_extractor.calendar_scraper.base import (
    SOURCE_TYPE_SCRAPED,
    CalendarScrapeError,
    CalendarSource,
    ReleaseRecord,
)

_DATE_RE = re.compile(r"(\d{2})/(\d{2})/(\d{4})")


class IBGECalendarScraper(CalendarSource):
    """Scraper for the IBGE ``calendario/mensal.html`` page."""

    name: ClassVar[str] = "ibge"
    DEFAULT_URL: ClassVar[str] = "https://www.ibge.gov.br/calendario/mensal.html"
    TIMEOUT_SECONDS: ClassVar[float] = 15.0

    def __init__(
        self,
        url: str | None = None,
        client: httpx.AsyncClient | None = None,
    ) -> None:
        self._url = url or self.DEFAULT_URL
        self._client = client

    async def fetch_releases(self) -> list[ReleaseRecord]:
        try:
            html = await self._fetch_html()
        except Exception as exc:  # noqa: BLE001 — wrap all network/parse failures
            raise CalendarScrapeError(self.name, f"fetch failed: {exc}") from exc

        records = self.parse(html)
        if not records:
            raise CalendarScrapeError(self.name, "parsed 0 release records")
        return records

    @retry(
        retry=retry_if_exception_type(httpx.HTTPError),
        stop=stop_after_attempt(2),
        wait=wait_fixed(2),
        reraise=True,
    )
    async def _fetch_html(self) -> str:
        if self._client is not None:
            response = await self._client.get(self._url, timeout=self.TIMEOUT_SECONDS)
            response.raise_for_status()
            return response.text
        async with httpx.AsyncClient(
            timeout=self.TIMEOUT_SECONDS,
            headers={"User-Agent": "api-extractor/0.1 (+calendar-scraper)"},
        ) as client:
            response = await client.get(self._url)
            response.raise_for_status()
            return response.text

    @classmethod
    def parse(cls, html: str) -> list[ReleaseRecord]:
        """Parse IBGE agenda HTML into ``ReleaseRecord`` objects.

        Pairs ``.agenda--lista__data`` (date) with the immediately following
        ``.agenda--lista__evento`` (indicator name).
        """
        soup = BeautifulSoup(html, "lxml")
        date_divs = soup.find_all("div", class_="agenda--lista__data")
        event_divs = soup.find_all("div", class_="agenda--lista__evento")
        if len(date_divs) != len(event_divs):
            logger.warning(
                "ibge calendar: date/event div count mismatch {dates} vs {events}",
                dates=len(date_divs),
                events=len(event_divs),
            )

        records: list[ReleaseRecord] = []
        for date_div, event_div in zip(date_divs, event_divs, strict=False):
            scheduled = cls._extract_date(date_div)
            if scheduled is None:
                continue
            indicator_name = cls._extract_event_name(event_div)
            if not indicator_name:
                continue
            series_codes = lookup_ibge(indicator_name)
            if not series_codes:
                logger.info(
                    "ibge calendar: skipping unmapped indicator {name!r}",
                    name=indicator_name,
                )
                continue
            for code in series_codes:
                records.append(
                    ReleaseRecord(
                        series_code=code,
                        scheduled_for=scheduled,
                        source_type=SOURCE_TYPE_SCRAPED,
                    )
                )
        return records

    @staticmethod
    def _extract_date(date_div: object) -> datetime.date | None:
        # Prefer the ISO ``data-divulgacao`` attribute on the inner span.
        span = date_div.find("span") if hasattr(date_div, "find") else None  # type: ignore[attr-defined]
        if span is not None:
            iso = span.get("data-divulgacao")
            if iso:
                # Format: ``2026-05-12 09:00:00-03:00``
                try:
                    return datetime.date.fromisoformat(iso[:10])
                except ValueError:
                    pass
        text = date_div.get_text(strip=True) if hasattr(date_div, "get_text") else ""  # type: ignore[attr-defined]
        match = _DATE_RE.search(text)
        if not match:
            return None
        day, month, year = (int(g) for g in match.groups())
        try:
            return datetime.date(year, month, day)
        except ValueError:
            return None

    @staticmethod
    def _extract_event_name(event_div: object) -> str:
        anchor = event_div.find("a") if hasattr(event_div, "find") else None  # type: ignore[attr-defined]
        if anchor is not None:
            return anchor.get_text(strip=True)
        return event_div.get_text(strip=True) if hasattr(event_div, "get_text") else ""  # type: ignore[attr-defined]
