"""BCB calendar of notas econômico-financeiras scraper.

Target page (SharePoint List):
``https://www.bcb.gov.br/content/estatisticas/Lists/calendario-notas-economico-financeiras/AllItems.aspx``

The live page filters non-browser user agents in some environments; when the
fetch fails or yields zero rows, this scraper raises ``CalendarScrapeError``
and the orchestrator falls back to hardcoded data for BCB-covered series.

Coverage: three BCB notes map to 6 series codes total (see ``_mapping``):
- Estatísticas Monetárias e de Crédito → IBC-Br
- Estatísticas do Setor Externo → Balanca_Comercial, Reservas_Internacionais, Conta_Corrente
- Estatísticas Fiscais → Resultado_Primario, Divida_Bruta
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

from api_extractor.calendar_scraper._mapping import lookup_bcb
from api_extractor.calendar_scraper.base import (
    SOURCE_TYPE_SCRAPED,
    CalendarScrapeError,
    CalendarSource,
    ReleaseRecord,
)

_DATE_RE = re.compile(r"(\d{2})/(\d{2})/(\d{4})")


class BCBCalendarScraper(CalendarSource):
    """Scraper for the BCB SharePoint calendar List page."""

    name: ClassVar[str] = "bcb"
    DEFAULT_URL: ClassVar[str] = (
        "https://www.bcb.gov.br/content/estatisticas/Lists/"
        "calendario-notas-economico-financeiras/AllItems.aspx"
    )
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
        except Exception as exc:  # noqa: BLE001
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
        headers = {
            "User-Agent": (
                "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
                "(KHTML, like Gecko) api-extractor/0.1 Safari/537.36"
            ),
            "Accept": "text/html,application/xhtml+xml",
            "Accept-Language": "pt-BR,pt;q=0.9",
        }
        if self._client is not None:
            response = await self._client.get(self._url, timeout=self.TIMEOUT_SECONDS)
            response.raise_for_status()
            return response.text
        async with httpx.AsyncClient(timeout=self.TIMEOUT_SECONDS, headers=headers) as client:
            response = await client.get(self._url)
            response.raise_for_status()
            return response.text

    @classmethod
    def parse(cls, html: str) -> list[ReleaseRecord]:
        """Parse BCB SharePoint List HTML into ``ReleaseRecord`` objects.

        Strategy: walk all ``<tr>`` elements; for each row, take the first
        ``td`` matching a ``dd/mm/yyyy`` date and the first remaining cell with
        non-empty text as the indicator name.
        """
        soup = BeautifulSoup(html, "lxml")
        records: list[ReleaseRecord] = []
        for row in soup.find_all("tr"):
            cells = row.find_all("td")
            if not cells:
                continue
            scheduled, indicator_name = cls._extract_row(cells)
            if scheduled is None or not indicator_name:
                continue
            series_codes = lookup_bcb(indicator_name)
            if not series_codes:
                logger.info(
                    "bcb calendar: skipping unmapped indicator {name!r}",
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
    def _extract_row(cells: list[object]) -> tuple[datetime.date | None, str]:
        scheduled: datetime.date | None = None
        indicator_name = ""
        for cell in cells:
            text = cell.get_text(" ", strip=True) if hasattr(cell, "get_text") else ""  # type: ignore[attr-defined]
            if not text:
                continue
            if scheduled is None:
                match = _DATE_RE.search(text)
                if match:
                    day, month, year = (int(g) for g in match.groups())
                    try:
                        scheduled = datetime.date(year, month, day)
                    except ValueError:
                        scheduled = None
                    continue
            if not indicator_name:
                indicator_name = text
                break
        return scheduled, indicator_name
