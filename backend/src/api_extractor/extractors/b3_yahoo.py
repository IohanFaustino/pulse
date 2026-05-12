"""B3 / Yahoo Finance source adapter.

Wraps the unofficial ``yfinance`` library to fetch daily closing prices for
Brazilian index series:

- ``Ibovespa`` → Yahoo ticker ``^BVSP``
- ``IFIX``     → Yahoo ticker ``XFIX11.SA`` (proxy ETF; see
  ``docs/data-sources/b3-yahoo.md`` for ticker resolution rationale)

The adapter satisfies the :class:`SourceAdapter` contract from ``extractors.base``:

- Blocking ``yfinance`` calls are dispatched to a worker thread via
  :func:`asyncio.to_thread` to keep the FastAPI event loop responsive.
- Network/HTTP failures are retried 3× with exponential backoff via
  :mod:`tenacity` (2s, 8s, 30s).
- Final failure raises :class:`ExtractionError`.
- ``Close`` is converted to :class:`decimal.Decimal` via the string form to
  avoid binary-float drift.
- Trading-day index entries are normalized to UTC midnight, per the
  ``FetchedObservation`` anchoring convention.
"""

from __future__ import annotations

import asyncio
from datetime import date, datetime, timezone
from decimal import Decimal

import pandas as pd
import yfinance as yf
from loguru import logger
from tenacity import (
    RetryError,
    retry,
    retry_if_exception_type,
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

SOURCE_NAME = "b3_yahoo"


def _to_utc_midnight(ts: pd.Timestamp | datetime) -> datetime:
    """Anchor a pandas/Yahoo timestamp to UTC 00:00 of its trading day.

    yfinance anchors each daily bar at midnight of the trading day in the
    *market's* local timezone (America/Sao_Paulo for ^BVSP, America/New_York
    for US tickers, Europe/Berlin for ^STOXX50E, etc.). Taking the date in
    that local tz yields the correct trading day; we then re-anchor to UTC
    midnight for deterministic bucketing across markets.

    Naive timestamps are taken as-is.
    """
    if isinstance(ts, pd.Timestamp):
        # Take the date in the upstream local tz — yfinance anchors at local
        # midnight of the trading day, so ts.date() is already the right answer.
        trading_day = ts.date()
    else:
        trading_day = ts.date() if isinstance(ts, datetime) else ts
    return datetime(
        trading_day.year, trading_day.month, trading_day.day, tzinfo=timezone.utc
    )


class B3YahooAdapter(SourceAdapter):
    """Source adapter for Yahoo Finance via ``yfinance``.

    Concrete implementation of :class:`SourceAdapter`. Stateless and safe to
    instantiate per call; tenacity retries are configured at method level.
    """

    source: str = SOURCE_NAME

    async def fetch(
        self,
        series: Series,
        since: date | None = None,
    ) -> ExtractionResult:
        """Fetch daily closing prices for ``series`` since ``since`` (inclusive).

        Falls back to ``series.first_observation`` when ``since`` is ``None``.
        Returns observations sorted ascending by ``observed_at``.
        """
        start_date: date | None = since or series.first_observation
        symbol = series.source_id

        logger.info(
            "b3_yahoo.fetch start",
            extra={
                "series_code": series.code,
                "symbol": symbol,
                "start": start_date.isoformat() if start_date else None,
            },
        )

        try:
            df = await asyncio.to_thread(self._history_with_retry, symbol, start_date)
        except RetryError as exc:
            logger.error(
                "b3_yahoo.fetch failed after retries",
                extra={"series_code": series.code, "symbol": symbol},
            )
            raise ExtractionError(
                self.source, series.code, f"yfinance retries exhausted: {exc}"
            ) from exc
        except Exception as exc:  # noqa: BLE001 — defensive top-level guard
            logger.error(
                "b3_yahoo.fetch raised unexpected",
                extra={"series_code": series.code, "symbol": symbol, "error": str(exc)},
            )
            raise ExtractionError(self.source, series.code, str(exc)) from exc

        observations = self._dataframe_to_observations(df, series.code)
        observations.sort(key=lambda o: o.observed_at)

        logger.info(
            "b3_yahoo.fetch done",
            extra={"series_code": series.code, "n_obs": len(observations)},
        )

        return ExtractionResult(
            series_code=series.code,
            observations=observations,
            fetched_at=datetime.now(timezone.utc),
            source=self.source,
        )

    # ----------------------------- internals ------------------------------- #

    @staticmethod
    @retry(
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=2, min=2, max=30),
        retry=retry_if_exception_type(Exception),
        reraise=True,
    )
    def _history_with_retry(symbol: str, start: date | None) -> pd.DataFrame:
        """Blocking yfinance call with tenacity retry.

        Run inside :func:`asyncio.to_thread`. Retries any exception 3×.
        """
        ticker = yf.Ticker(symbol)
        kwargs: dict[str, object] = {"interval": "1d", "auto_adjust": False}
        if start is not None:
            kwargs["start"] = start.isoformat()
        else:
            kwargs["period"] = "max"
        df = ticker.history(**kwargs)
        return df

    @staticmethod
    def _dataframe_to_observations(
        df: pd.DataFrame, series_code: str
    ) -> list[FetchedObservation]:
        """Convert a yfinance DataFrame into normalized observations.

        - Uses ``Close`` only (Open/High/Low/Volume dropped).
        - Skips rows with NaN ``Close``.
        - Converts via ``Decimal(str(value))`` to avoid float drift.
        - Anchors index timestamps to UTC midnight.
        """
        if df is None or df.empty:
            return []
        if "Close" not in df.columns:
            logger.warning(
                "b3_yahoo.parse missing Close column",
                extra={"series_code": series_code, "columns": list(df.columns)},
            )
            return []

        out: list[FetchedObservation] = []
        for ts, close_val in df["Close"].items():
            if pd.isna(close_val):
                continue
            out.append(
                FetchedObservation(
                    series_code=series_code,
                    observed_at=_to_utc_midnight(ts),
                    value=Decimal(str(close_val)),
                )
            )
        return out
