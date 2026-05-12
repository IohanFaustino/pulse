"""B3 Portal source adapter (unofficial `indexStatisticsProxy`).

Fetches daily closing levels for B3 stock / ESG / governance indexes that
Yahoo Finance does not expose with historical depth (IBrX 100, ISE, ICO2,
IGC family, ITAG, and IBrX 50 as a Yahoo-independent path).

Spec: ``docs/data-sources/b3-indexes.md``.

Endpoint::

    https://sistemaswebb3-listados.b3.com.br/indexStatisticsProxy/IndexCall/
        GetPortfolioDay/{base64_payload}

Payload (base64-encoded JSON)::

    {"language": "pt-br", "index": "<CODE>", "year": "<YYYY>"}

Response is a 31-row × 12-column day×month matrix with pt-BR formatted numeric
strings (``"131.147,29"``) and ``null`` cells.
"""

from __future__ import annotations

import asyncio
import base64
import json
import time
from datetime import UTC, date, datetime
from decimal import Decimal, InvalidOperation
from typing import Any

import httpx
from loguru import logger
from tenacity import (
    RetryError,
    retry,
    retry_if_exception,
    stop_after_attempt,
    wait_exponential,
)

from api_extractor.extractors.base import (
    ExtractionError,
    ExtractionResult,
    FetchedObservation,
    SourceAdapter,
)
from api_extractor.models.series import Series

SOURCE_NAME = "b3_portal"
BASE_URL = (
    "https://sistemaswebb3-listados.b3.com.br/"
    "indexStatisticsProxy/IndexCall/GetPortfolioDay/{payload}"
)
DEFAULT_TIMEOUT = httpx.Timeout(30.0)
# B3 returns 403 to default Python UA.
DEFAULT_HEADERS = {"User-Agent": "Mozilla/5.0", "Accept": "application/json"}
# Polite throttle between year requests.
INTER_YEAR_SLEEP_S = 0.5

_TRANSIENT_TRANSPORT_EXC = (httpx.TransportError, httpx.TimeoutException)


def _is_retryable(exc: BaseException) -> bool:
    """Retry on transport errors and on 5xx / 429 HTTP responses only."""
    if isinstance(exc, _TRANSIENT_TRANSPORT_EXC):
        return True
    if isinstance(exc, httpx.HTTPStatusError):
        code = exc.response.status_code
        return code == 429 or code >= 500
    return False


def _build_payload(index_code: str, year: int) -> str:
    """Base64-encode the year-matrix payload for ``index_code`` / ``year``.

    Uses ``separators=(",", ":")`` for compact JSON and standard base64
    (with padding, no urlsafe variant — the live portal accepts both, but
    we match what was captured in fixtures).
    """
    body = json.dumps(
        {"language": "pt-br", "index": index_code, "year": str(year)},
        separators=(",", ":"),
        ensure_ascii=False,
    )
    return base64.b64encode(body.encode("utf-8")).decode("ascii")


def _build_url(index_code: str, year: int) -> str:
    return BASE_URL.format(payload=_build_payload(index_code, year))


def _parse_pt_br_decimal(raw: str) -> Decimal:
    """Parse pt-BR formatted numeric string.

    ``"131.147,29"`` → ``Decimal("131147.29")``. Strips thousands ``.`` then
    swaps ``,`` for ``.``. Never goes through ``float``.
    """
    normalized = raw.strip().replace(".", "").replace(",", ".")
    try:
        return Decimal(normalized)
    except InvalidOperation as e:  # pragma: no cover — defensive
        raise ValueError(f"Cannot parse pt-BR value {raw!r}") from e


def _parse_year_matrix(
    series_code: str,
    year: int,
    results: list[dict[str, Any]],
) -> list[FetchedObservation]:
    """Convert a single-year ``results`` matrix into observations.

    - Skips envelope rows with ``day == 0`` (min/max summaries).
    - Iterates ``rateValue1..rateValue12``; ``None`` → skip.
    - Guards ``ValueError`` from ``date(year, m, d)`` (Feb 30, Apr 31, etc.).
    - Anchors to UTC midnight.
    """
    out: list[FetchedObservation] = []
    for row in results:
        day = row.get("day")
        if not isinstance(day, int) or day < 1 or day > 31:
            # 0 = min/max envelope row; anything else malformed → skip.
            continue
        for month in range(1, 13):
            raw = row.get(f"rateValue{month}")
            if raw is None:
                continue
            try:
                anchor = date(year, month, day)
            except ValueError:
                # day-of-month does not exist for this month.
                continue
            try:
                value = _parse_pt_br_decimal(str(raw))
            except ValueError as e:
                logger.warning(
                    "b3_portal.skip_cell series={code} year={y} m={m} d={d} err={err}",
                    code=series_code,
                    y=year,
                    m=month,
                    d=day,
                    err=repr(e),
                )
                continue
            out.append(
                FetchedObservation(
                    series_code=series_code,
                    observed_at=datetime(
                        anchor.year, anchor.month, anchor.day, tzinfo=UTC
                    ),
                    value=value,
                )
            )
    return out


class B3PortalAdapter(SourceAdapter):
    """Adapter for the unofficial B3 ``indexStatisticsProxy`` portal."""

    source: str = SOURCE_NAME

    def __init__(
        self,
        client: httpx.AsyncClient | None = None,
        timeout: httpx.Timeout = DEFAULT_TIMEOUT,
        inter_year_sleep_s: float = INTER_YEAR_SLEEP_S,
    ) -> None:
        self._owns_client = client is None
        self._client = client or httpx.AsyncClient(
            timeout=timeout, headers=DEFAULT_HEADERS
        )
        self._inter_year_sleep_s = inter_year_sleep_s

    async def aclose(self) -> None:
        if self._owns_client:
            await self._client.aclose()

    # ── public ──────────────────────────────────────────────────────────────
    async def fetch(
        self,
        series: Series,
        since: date | None = None,
    ) -> ExtractionResult:
        """Fetch observations for ``series`` since ``since`` (inclusive).

        Iterates one HTTPS request per calendar year from
        ``max(since, series.first_observation).year`` to today.
        """
        today = datetime.now(tz=UTC).date()
        start: date = since or series.first_observation or date(today.year, 1, 1)
        if start > today:
            start = today
        years = list(range(start.year, today.year + 1))

        started = time.monotonic()
        observations: list[FetchedObservation] = []
        try:
            for idx, year in enumerate(years):
                if idx > 0 and self._inter_year_sleep_s > 0:
                    await asyncio.sleep(self._inter_year_sleep_s)
                url = _build_url(series.source_id, year)
                payload = await self._get_with_retry(url)
                if payload is None:
                    continue
                results = (
                    payload.get("results") if isinstance(payload, dict) else None
                )
                if not isinstance(results, list):
                    logger.warning(
                        "b3_portal.unexpected_payload series={code} year={y}",
                        code=series.code,
                        y=year,
                    )
                    continue
                observations.extend(
                    _parse_year_matrix(series.code, year, results)
                )
        except RetryError as e:
            msg = f"giving up after retries: {e.last_attempt.exception()!r}"
            logger.error(
                "extraction.failed source={src} series={code} reason={msg}",
                src=self.source,
                code=series.code,
                msg=msg,
            )
            raise ExtractionError(self.source, series.code, msg) from e
        except httpx.HTTPError as e:
            msg = f"non-retryable HTTP error: {e!r}"
            logger.error(
                "extraction.failed source={src} series={code} reason={msg}",
                src=self.source,
                code=series.code,
                msg=msg,
            )
            raise ExtractionError(self.source, series.code, msg) from e

        # Filter to `since` (inclusive) and dedupe defensively.
        since_dt = (
            datetime(since.year, since.month, since.day, tzinfo=UTC)
            if since is not None
            else None
        )
        seen: set[datetime] = set()
        filtered: list[FetchedObservation] = []
        for obs in observations:
            if since_dt is not None and obs.observed_at < since_dt:
                continue
            if obs.observed_at in seen:
                continue
            seen.add(obs.observed_at)
            filtered.append(obs)
        filtered.sort(key=lambda o: o.observed_at)
        latency_ms = (time.monotonic() - started) * 1000.0

        logger.info(
            "extraction.ok source={src} series={code} count={n} years={ny} "
            "latency_ms={ms:.1f}",
            src=self.source,
            code=series.code,
            n=len(filtered),
            ny=len(years),
            ms=latency_ms,
        )

        return ExtractionResult(
            series_code=series.code,
            observations=filtered,
            fetched_at=datetime.now(tz=UTC),
            source=self.source,
        )

    # ── internals ───────────────────────────────────────────────────────────
    @retry(
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=2, min=2, max=30),
        retry=retry_if_exception(_is_retryable),
        reraise=False,
    )
    async def _get_with_retry(self, url: str) -> dict[str, Any] | None:
        resp = await self._client.get(url)
        if resp.status_code == 429 or resp.status_code >= 500:
            resp.raise_for_status()
        if resp.status_code == 404:
            return None
        resp.raise_for_status()
        return resp.json()
