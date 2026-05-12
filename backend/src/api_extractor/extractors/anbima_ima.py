"""ANBIMA IMA-family adapter — DEPRECATED.

Superseded by :mod:`api_extractor.extractors.anbima_bulk` (Phase 20 Wave D),
which downloads the full XLSX history per index from ANBIMA's public S3
bucket in a single request. This module is retained for reference and as a
fallback if S3 access is ever revoked; it is no longer wired into
``registry.py``.

Fetches the IMA family of fixed-income indexes from the public ANBIMA
"série histórica" endpoint:

    POST https://www.anbima.com.br/informacoes/ima/ima-sh-down.asp

Spec: ``docs/data-sources/anbima-ima.md``.

One HTTP POST per business date. Response is ISO-8859-1 CSV (``;``-delimited)
carrying the full quadro of sub-indexes for that date. Adapter filters rows to
the requested series ``source_id`` and emits one ``FetchedObservation`` per
data row.

Weekends / holidays / future dates return HTTP 200 with a tiny body (~46
bytes, ``TOTAIS - QUADRO RESUMO`` only). These are silently skipped — not
errors.
"""

from __future__ import annotations

import asyncio
import csv
import io
import time
from datetime import UTC, date, datetime, timedelta
from decimal import Decimal, InvalidOperation

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

SOURCE_NAME = "anbima"
ENDPOINT = "https://www.anbima.com.br/informacoes/ima/ima-sh-down.asp"
DEFAULT_TIMEOUT = httpx.Timeout(30.0)
THROTTLE_SECONDS = 1.0
RESPONSE_ENCODING = "iso-8859-1"

# Default backfill horizon when series.first_observation is missing. Keep
# generous; Wave-C orchestrator can override with explicit ``since=``.
_DEFAULT_BACKFILL_YEARS = 25

_TRANSIENT_TRANSPORT_EXC = (httpx.TransportError, httpx.TimeoutException)


def _is_retryable(exc: BaseException) -> bool:
    """Retry on transport errors and on 5xx / 429 HTTP responses only."""
    if isinstance(exc, _TRANSIENT_TRANSPORT_EXC):
        return True
    if isinstance(exc, httpx.HTTPStatusError):
        code = exc.response.status_code
        return code == 429 or code >= 500
    return False


def _normalize_index_name(name: str) -> str:
    """Normalize an ANBIMA index label for comparison.

    Examples:
        "IMA-GERAL ex-C"   -> "IMA-GERAL-EX-C"
        "IMA-B 5+"          -> "IMA-B-5+"
        "  IRF-M 1 "        -> "IRF-M-1"
    """
    return "-".join(name.strip().upper().split())


def _parse_pt_br_decimal(raw: str) -> Decimal:
    """Parse a pt-BR locale numeric string to ``Decimal``.

    Examples:
        "11.521,718637" -> Decimal("11521.718637")
        "1.234,567"     -> Decimal("1234.567")
        "0,38"          -> Decimal("0.38")
    """
    cleaned = raw.strip()
    if not cleaned or cleaned in {"--", "-"}:
        raise InvalidOperation(f"empty / sentinel value: {raw!r}")
    # Remove thousand separator dots, then swap decimal comma for dot.
    normalized = cleaned.replace(".", "").replace(",", ".")
    return Decimal(normalized)


def _parse_response_date(raw: str) -> datetime:
    """Parse ``DD/MM/YYYY`` to timezone-aware UTC datetime at 00:00."""
    return datetime.strptime(raw.strip(), "%d/%m/%Y").replace(tzinfo=UTC)


def _iter_business_dates(start: date, end: date) -> list[date]:
    """Return all weekdays (Mon–Fri) in ``[start, end]`` inclusive, ascending.

    Holidays are NOT filtered here — they are detected at response time when
    the server returns an empty body.
    """
    if start > end:
        return []
    days: list[date] = []
    cur = start
    one_day = timedelta(days=1)
    while cur <= end:
        if cur.weekday() < 5:
            days.append(cur)
        cur += one_day
    return days


def _resolve_since(series: Series, since: date | None, today: date) -> date:
    """Pick the inclusive lower bound for the fetch.

    Precedence:
      1. Explicit ``since`` argument (caller wins).
      2. ``series.first_observation`` if present.
      3. ``today - _DEFAULT_BACKFILL_YEARS`` as a generous fallback.
    """
    if since is not None:
        return min(since, today)
    first = getattr(series, "first_observation", None)
    if isinstance(first, date):
        return min(first, today)
    return today - timedelta(days=365 * _DEFAULT_BACKFILL_YEARS)


def _parse_csv(
    body: str,
    target_source_id: str,
    series_code: str,
) -> list[FetchedObservation]:
    """Parse one ANBIMA ima-sh-down CSV body and emit matching observations.

    Filters rows whose normalized ``Índice`` column equals
    ``_normalize_index_name(target_source_id)``. Empty bodies (weekends /
    holidays) yield an empty list.

    Column layout (verbatim, pt-BR):
        0: Índice
        1: Data de Referência (DD/MM/YYYY)
        2: Número Índice  ← the value we extract
        3+: variations, weights, etc. (ignored)
    """
    target = _normalize_index_name(target_source_id)
    rows = csv.reader(io.StringIO(body), delimiter=";")
    out: list[FetchedObservation] = []
    for row in rows:
        # Skip blanks, section headers, the column header line, and the
        # CARTEIRA POR ÍNDICE composition section that follows TOTAIS.
        if len(row) < 3:
            continue
        first = row[0].strip()
        if not first:
            continue
        # Header row starts with "Índice" (with accented I) — never matches
        # a normalized source_id, so it is naturally filtered. But other
        # section banners (single-cell rows like "CARTEIRA POR ÍNDICE")
        # are already len<3 and bail above.
        if _normalize_index_name(first) != target:
            continue
        try:
            observed_at = _parse_response_date(row[1])
            value = _parse_pt_br_decimal(row[2])
        except (ValueError, InvalidOperation) as e:
            logger.warning(
                "extraction.skip_row source={src} series={code} row={row} reason={err}",
                src=SOURCE_NAME,
                code=series_code,
                row=row,
                err=repr(e),
            )
            continue
        out.append(
            FetchedObservation(
                series_code=series_code,
                observed_at=observed_at,
                value=value,
            )
        )
    return out


class ANBIMAAdapter(SourceAdapter):
    """Adapter for the ANBIMA IMA family ima-sh-down.asp endpoint."""

    source: str = SOURCE_NAME

    def __init__(
        self,
        client: httpx.AsyncClient | None = None,
        timeout: httpx.Timeout = DEFAULT_TIMEOUT,
        throttle_seconds: float = THROTTLE_SECONDS,
    ) -> None:
        self._owns_client = client is None
        self._client = client or httpx.AsyncClient(timeout=timeout)
        self._throttle_seconds = throttle_seconds

    async def aclose(self) -> None:
        if self._owns_client:
            await self._client.aclose()

    # ── public ──────────────────────────────────────────────────────────────
    async def fetch(
        self,
        series: Series,
        since: date | None = None,
    ) -> ExtractionResult:
        """Fetch observations for ``series`` since ``since`` (inclusive)."""
        today = datetime.now(tz=UTC).date()
        effective_since = _resolve_since(series, since, today)
        dates = _iter_business_dates(effective_since, today)

        started = time.monotonic()
        observations: list[FetchedObservation] = []
        try:
            for i, d in enumerate(dates):
                if i > 0:
                    await asyncio.sleep(self._throttle_seconds)
                body = await self._post_with_retry(d)
                if not body or not body.strip():
                    # Weekend / holiday / no-data day — skip silently.
                    continue
                observations.extend(
                    _parse_csv(body, series.source_id, series.code)
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
    async def _post_with_retry(self, ref_date: date) -> str:
        form = {
            "Pai": "ima",
            "Tipo": "",
            "Dt_Ref": ref_date.strftime("%d/%m/%Y"),
            "Dt_Ref_Ver": "20000101",
            "Idioma": "PT",
            "saida": "csv",
            "escolha": "2",
        }
        resp = await self._client.post(ENDPOINT, data=form)
        if resp.status_code == 429 or resp.status_code >= 500:
            resp.raise_for_status()
        resp.raise_for_status()
        return resp.content.decode(RESPONSE_ENCODING, errors="replace")
