"""ANBIMA bulk-history adapter — single XLSX download per index.

Replaces the per-date ``ima-sh-down.asp`` scraper (see ``anbima_ima.py``) with
a single download from ANBIMA's public S3 bucket. Each XLSX holds the full
history of a single index from inception to the latest business day.

Source URL pattern (no auth required)::

    https://s3-data-prd-use1-precos.s3.us-east-1.amazonaws.com/arquivos/indices-historico/{CODE}-HISTORICO.xls

The file is XLSX (PK signature) despite the ``.xls`` extension. Parsed via
``pandas.read_excel(engine='openpyxl')``. Single sheet ``Historico`` with
columns::

    Índice | Data de Referência | Número Índice | Variação Diária (%) | ... |
    Variação 24 Meses (%) | Duration (d.u.) | PMR

Adapter behavior:
- One HTTP GET per series; bytes streamed into BytesIO.
- pandas parsing runs in a worker thread (``asyncio.to_thread``) so the event
  loop is never blocked.
- ``since`` filters by ``Data de Referência >= since`` (inclusive).
- Each file = single index, so no name-based row filtering is needed.
"""

from __future__ import annotations

import asyncio
import io
import time
from datetime import UTC, date, datetime
from decimal import Decimal
from typing import Any

import httpx
import pandas as pd
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
S3_BASE = (
    "https://s3-data-prd-use1-precos.s3.us-east-1.amazonaws.com/"
    "arquivos/indices-historico"
)
DEFAULT_TIMEOUT = httpx.Timeout(60.0)
SHEET_NAME = "Historico"
COL_DATE = "Data de Referência"
COL_VALUE = "Número Índice"

_TRANSIENT_TRANSPORT_EXC = (httpx.TransportError, httpx.TimeoutException)


def _is_retryable(exc: BaseException) -> bool:
    """Retry on transport errors and on 5xx / 429 HTTP responses only."""
    if isinstance(exc, _TRANSIENT_TRANSPORT_EXC):
        return True
    if isinstance(exc, httpx.HTTPStatusError):
        code = exc.response.status_code
        return code == 429 or code >= 500
    return False


def _build_url(source_id: str) -> str:
    return f"{S3_BASE}/{source_id}-HISTORICO.xls"


def _parse_xlsx_bytes(
    payload: bytes,
    series_code: str,
    since: date | None,
) -> list[FetchedObservation]:
    """Parse XLSX bytes into a list of FetchedObservation.

    Pure sync function — caller runs it via ``asyncio.to_thread``. Filters
    out rows with NaN value or NaN date. Returns observations sorted ascending
    by ``observed_at``.
    """
    df = pd.read_excel(
        io.BytesIO(payload),
        engine="openpyxl",
        sheet_name=SHEET_NAME,
    )
    if COL_DATE not in df.columns or COL_VALUE not in df.columns:
        raise ValueError(
            f"unexpected columns: {list(df.columns)} (need "
            f"{COL_DATE!r} and {COL_VALUE!r})"
        )
    # Drop rows with missing date or value.
    sub = df[[COL_DATE, COL_VALUE]].dropna()
    out: list[FetchedObservation] = []
    for raw_date, raw_value in sub.itertuples(index=False, name=None):
        # raw_date is pandas Timestamp; convert to UTC midnight.
        ts: pd.Timestamp = pd.Timestamp(raw_date)  # type: ignore[arg-type]
        observed_at = datetime(ts.year, ts.month, ts.day, tzinfo=UTC)
        if since is not None and observed_at.date() < since:
            continue
        # str(float) → Decimal preserves the displayed value better than
        # Decimal(float) (which exposes binary-fp noise).
        value = Decimal(str(raw_value))
        out.append(
            FetchedObservation(
                series_code=series_code,
                observed_at=observed_at,
                value=value,
            )
        )
    out.sort(key=lambda o: o.observed_at)
    return out


class ANBIMABulkAdapter(SourceAdapter):
    """Adapter that downloads the full history XLSX from ANBIMA's S3 bucket."""

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

    async def fetch(
        self,
        series: Series,
        since: date | None = None,
    ) -> ExtractionResult:
        """Download + parse the XLSX for ``series`` and emit observations."""
        url = _build_url(series.source_id)
        started = time.monotonic()
        try:
            payload = await self._download_with_retry(url)
            observations = await asyncio.to_thread(
                _parse_xlsx_bytes, payload, series.code, since
            )
        except RetryError as e:
            last_exc: Any = e.last_attempt.exception()
            msg = f"giving up after retries: {last_exc!r}"
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
        except ValueError as e:
            msg = f"parse error: {e!r}"
            logger.error(
                "extraction.failed source={src} series={code} reason={msg}",
                src=self.source,
                code=series.code,
                msg=msg,
            )
            raise ExtractionError(self.source, series.code, msg) from e

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

    @retry(
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=2, min=2, max=30),
        retry=retry_if_exception(_is_retryable),
        reraise=False,
    )
    async def _download_with_retry(self, url: str) -> bytes:
        resp = await self._client.get(url)
        resp.raise_for_status()
        return resp.content
