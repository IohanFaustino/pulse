"""BCB SGS (Banco Central do Brasil — Sistema Gerenciador de Séries Temporais) adapter.

Fetches observations for a single series from the public bcdata endpoint.
Spec: ``docs/data-sources/bcb-sgs.md``.

Endpoint pattern::

    https://api.bcb.gov.br/dados/serie/bcdata.sgs.{source_id}/dados
        ?formato=json[&dataInicial=DD/MM/YYYY][&dataFinal=DD/MM/YYYY]

Response: JSON array of ``{"data": "DD/MM/YYYY", "valor": "<numeric string>"}``.
"""

from __future__ import annotations

import time
from datetime import UTC, date, datetime, timedelta
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

SOURCE_NAME = "bcb_sgs"
BASE_URL = "https://api.bcb.gov.br/dados/serie/bcdata.sgs.{source_id}/dados"
DEFAULT_TIMEOUT = httpx.Timeout(30.0)

# BCB SGS rejects daily-series requests with windows > 10 years (and rejects
# daily-series requests with no window at all). To stay inside that envelope
# regardless of series frequency, we chunk historical fetches into ≤ 10-year
# windows. We use 3650 days (slightly under 10 calendar years, accounting for
# leap days) so we never tip over BCB's exact 10-year threshold.
_MAX_WINDOW_DAYS = 3650

# Retry only on transport / 5xx / 429 — never on other 4xx schema errors.
_TRANSIENT_TRANSPORT_EXC = (httpx.TransportError, httpx.TimeoutException)


def _is_retryable(exc: BaseException) -> bool:
    """Retry on transport errors and on 5xx / 429 HTTP responses only."""
    if isinstance(exc, _TRANSIENT_TRANSPORT_EXC):
        return True
    if isinstance(exc, httpx.HTTPStatusError):
        code = exc.response.status_code
        return code == 429 or code >= 500
    return False


def _parse_date(raw: str) -> datetime:
    """Parse ``DD/MM/YYYY`` (pt-BR) into timezone-aware UTC datetime at 00:00."""
    return datetime.strptime(raw, "%d/%m/%Y").replace(tzinfo=UTC)


def _parse_value(raw: str) -> Decimal:
    """Parse numeric string to ``Decimal``.

    Accepts both dot (``"0.38"`` — ``formato=json`` default) and comma
    (``"0,38"`` — pt-BR / csv fallback). Never goes through ``float``.
    """
    normalized = raw.strip().replace(",", ".")
    try:
        return Decimal(normalized)
    except InvalidOperation as e:  # pragma: no cover — defensive
        raise ValueError(f"Cannot parse value {raw!r} as Decimal") from e


def _first_obs_or_default(series: Series, today: date) -> date:
    """Resolve the historical start for a 'full history' fetch.

    Uses ``series.first_observation`` when available; otherwise reaches back
    ~50 years from ``today``. The actual fetch is still chunked into
    ≤ 10-year windows so this can be safely generous.
    """
    first = getattr(series, "first_observation", None)
    if isinstance(first, date):
        return first
    return today - timedelta(days=365 * 50)


def _chunk_windows(
    start: date,
    end: date,
    max_days: int,
) -> list[tuple[date, date]]:
    """Split ``[start, end]`` into a list of ≤ ``max_days``-wide windows.

    Windows are inclusive on both sides and ordered ascending. If
    ``start > end`` returns a single ``(end, end)`` so we still emit a
    valid one-day request (BCB tolerates that and returns 200 / 404).
    """
    if start > end:
        return [(end, end)]
    windows: list[tuple[date, date]] = []
    cursor = start
    step = timedelta(days=max_days)
    while cursor <= end:
        window_end = min(cursor + step, end)
        windows.append((cursor, window_end))
        if window_end == end:
            break
        cursor = window_end + timedelta(days=1)
    return windows


class BCBSGSAdapter(SourceAdapter):
    """Adapter for the BCB SGS bcdata REST endpoint."""

    source: str = SOURCE_NAME

    def __init__(
        self,
        client: httpx.AsyncClient | None = None,
        timeout: httpx.Timeout = DEFAULT_TIMEOUT,
    ) -> None:
        self._owns_client = client is None
        self._client = client or httpx.AsyncClient(timeout=timeout)

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

        Args:
            series: Series ORM row. Uses ``series.code`` and ``series.source_id``.
            since: Inclusive lower-bound date. ``None`` → full history.

        Returns:
            ExtractionResult with observations sorted by ``observed_at`` ASC.

        Raises:
            ExtractionError: after all retries are exhausted.
        """
        url = BASE_URL.format(source_id=series.source_id)
        today = datetime.now(tz=UTC).date()
        # BCB rejects daily series with no window AND with windows > 10 years.
        # When no `since` is provided we walk back from `today` in 10-year
        # chunks until we cover the series' first_observation (or default to
        # 50 years of history for series whose seed value is missing). When
        # `since` is provided, we still chunk if the span > 10 years.
        effective_since = since if since is not None else _first_obs_or_default(series, today)
        if effective_since > today:
            effective_since = today
        windows = _chunk_windows(effective_since, today, _MAX_WINDOW_DAYS)

        started = time.monotonic()
        observations: list[FetchedObservation] = []
        try:
            for window_start, window_end in windows:
                params: dict[str, str] = {
                    "formato": "json",
                    "dataInicial": window_start.strftime("%d/%m/%Y"),
                    "dataFinal": window_end.strftime("%d/%m/%Y"),
                }
                payload = await self._get_with_retry(url, params)
                if payload is None:
                    # 404 → no observations in this window (e.g. since=today
                    # for a daily series that has not published today yet).
                    continue
                if not isinstance(payload, list):
                    # Defensive: BCB occasionally returns a JSON error envelope
                    # ({"error": ..., "message": ...}) with 2xx status when the
                    # query is malformed. Don't iterate dict keys as rows.
                    err = (
                        payload.get("error")
                        if isinstance(payload, dict)
                        else type(payload).__name__
                    )
                    raise ExtractionError(
                        self.source,
                        series.code,
                        f"unexpected BCB payload (not a JSON array): {err!r}",
                    )
                observations.extend(self._parse_payload(series.code, payload))
        except RetryError as e:
            msg = f"giving up after retries: {e.last_attempt.exception()!r}"
            logger.error(
                "extraction.failed source={src} series={code} reason={msg}",
                src=self.source,
                code=series.code,
                msg=msg,
            )
            raise ExtractionError(self.source, series.code, msg) from e
        except httpx.HTTPError as e:  # any non-retryable HTTP failure
            msg = f"non-retryable HTTP error: {e!r}"
            logger.error(
                "extraction.failed source={src} series={code} reason={msg}",
                src=self.source,
                code=series.code,
                msg=msg,
            )
            raise ExtractionError(self.source, series.code, msg) from e

        # Dedupe across overlapping windows (chunk boundaries are inclusive).
        seen: set[datetime] = set()
        deduped: list[FetchedObservation] = []
        for obs in observations:
            if obs.observed_at in seen:
                continue
            seen.add(obs.observed_at)
            deduped.append(obs)
        observations = deduped
        observations.sort(key=lambda o: o.observed_at)
        latency_ms = (time.monotonic() - started) * 1000.0

        logger.info(
            "extraction.ok source={src} series={code} count={n} latency_ms={ms:.1f}",
            src=self.source,
            code=series.code,
            n=len(observations),
            ms=latency_ms,
        )

        return ExtractionResult(
            series_code=series.code,
            observations=observations,
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
    async def _get_with_retry(
        self,
        url: str,
        params: dict[str, str],
    ) -> list[dict[str, Any]] | dict[str, Any] | None:
        resp = await self._client.get(url, params=params)
        # 4xx (except 429) is a permanent input error; do not retry.
        if resp.status_code == 429 or resp.status_code >= 500:
            resp.raise_for_status()
        # BCB SGS returns 404 when a window contains zero observations
        # (notably for daily series queried for today before the close). That
        # is a normal "no new data" condition, not an extraction failure.
        if resp.status_code == 404:
            return None
        resp.raise_for_status()  # other 4xx still raise but not retried
        return resp.json()

    @staticmethod
    def _parse_payload(
        series_code: str,
        rows: list[dict[str, Any]],
    ) -> list[FetchedObservation]:
        parsed: list[FetchedObservation] = []
        for row in rows:
            raw_value = row.get("valor")
            raw_date = row.get("data")
            if raw_value is None or raw_date is None:
                # Holidays / missing data — skip.
                continue
            try:
                observed_at = _parse_date(str(raw_date))
                value = _parse_value(str(raw_value))
            except (ValueError, InvalidOperation) as e:
                logger.warning(
                    "extraction.skip_row series={code} row={row} reason={err}",
                    code=series_code,
                    row=row,
                    err=repr(e),
                )
                continue
            parsed.append(
                FetchedObservation(
                    series_code=series_code,
                    observed_at=observed_at,
                    value=value,
                )
            )
        return parsed
