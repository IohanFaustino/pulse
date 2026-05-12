"""Phase 2 — B3/Yahoo Finance adapter tests.

Strategy:
- Most tests use a captured JSON fixture replayed via a MagicMock standing in for
  ``yfinance.Ticker``. No network calls.
- One opt-in live smoke test (skipped by default) verifies the chosen IFIX
  ticker returns real data. Enable with env ``B3_YAHOO_LIVE=1``.
"""

from __future__ import annotations

import datetime
import json
import os
from decimal import Decimal
from pathlib import Path
from unittest.mock import MagicMock, patch

import pandas as pd
import pytest

from api_extractor.extractors import b3_yahoo
from api_extractor.extractors.b3_yahoo import B3YahooAdapter, SOURCE_NAME
from api_extractor.extractors.base import ExtractionError, ExtractionResult

FIXTURES = Path(__file__).parent / "fixtures" / "b3_yahoo"


# ──────────────────────────── helpers ─────────────────────────────────────── #


def _df_from_fixture(name: str) -> pd.DataFrame:
    payload = json.loads((FIXTURES / name).read_text())
    df = pd.DataFrame(payload["records"])
    df["Date"] = pd.to_datetime(df["Date"], utc=False)
    df = df.set_index("Date")
    return df


def _make_series(code: str, source_id: str) -> object:
    """Minimal duck-typed Series stand-in (avoids DB)."""
    s = MagicMock()
    s.code = code
    s.source_id = source_id
    s.first_observation = datetime.date(2026, 4, 1)
    return s


def _patched_ticker(df: pd.DataFrame) -> MagicMock:
    ticker = MagicMock()
    ticker.history.return_value = df
    return ticker


# ────────────────────────────── tests ─────────────────────────────────────── #


@pytest.mark.asyncio
async def test_parse_fixture_bvsp():
    df = _df_from_fixture("bvsp_30d.json")
    series = _make_series("Ibovespa", "^BVSP")
    with patch.object(b3_yahoo.yf, "Ticker", return_value=_patched_ticker(df)):
        result = await B3YahooAdapter().fetch(series)
    assert isinstance(result, ExtractionResult)
    assert result.source == SOURCE_NAME
    assert len(result.observations) >= 15  # ~21 trading days in 1mo, allow margin
    assert all(o.series_code == "Ibovespa" for o in result.observations)
    assert all(isinstance(o.value, Decimal) for o in result.observations)


@pytest.mark.asyncio
async def test_close_field_used_not_open():
    """Adapter must read Close, not Open. Build a fixture with distinct values."""
    df = pd.DataFrame(
        {
            "Open": [100.0, 200.0],
            "High": [110.0, 210.0],
            "Low": [90.0, 190.0],
            "Close": [105.0, 205.0],
            "Volume": [1, 2],
        },
        index=pd.to_datetime(["2026-05-06", "2026-05-07"]),
    )
    series = _make_series("Ibovespa", "^BVSP")
    with patch.object(b3_yahoo.yf, "Ticker", return_value=_patched_ticker(df)):
        result = await B3YahooAdapter().fetch(series)
    vals = [o.value for o in result.observations]
    assert vals == [Decimal("105.0"), Decimal("205.0")]


@pytest.mark.asyncio
async def test_date_normalized_utc_midnight():
    df = pd.DataFrame(
        {"Close": [100.0]},
        index=pd.DatetimeIndex(
            [pd.Timestamp("2026-05-07 00:00:00", tz="America/Sao_Paulo")]
        ),
    )
    series = _make_series("Ibovespa", "^BVSP")
    with patch.object(b3_yahoo.yf, "Ticker", return_value=_patched_ticker(df)):
        result = await B3YahooAdapter().fetch(series)
    obs = result.observations[0]
    assert obs.observed_at == datetime.datetime(
        2026, 5, 7, 0, 0, 0, tzinfo=datetime.timezone.utc
    )
    assert obs.observed_at.tzinfo == datetime.timezone.utc


@pytest.mark.asyncio
async def test_returns_sorted_ascending():
    df = pd.DataFrame(
        {"Close": [300.0, 100.0, 200.0]},
        index=pd.to_datetime(["2026-05-08", "2026-05-06", "2026-05-07"]),
    )
    series = _make_series("Ibovespa", "^BVSP")
    with patch.object(b3_yahoo.yf, "Ticker", return_value=_patched_ticker(df)):
        result = await B3YahooAdapter().fetch(series)
    dates = [o.observed_at for o in result.observations]
    assert dates == sorted(dates)


@pytest.mark.asyncio
async def test_empty_response_no_error():
    df = pd.DataFrame(columns=["Open", "High", "Low", "Close", "Volume"])
    series = _make_series("Ibovespa", "^BVSP")
    with patch.object(b3_yahoo.yf, "Ticker", return_value=_patched_ticker(df)):
        result = await B3YahooAdapter().fetch(series)
    assert result.observations == []


@pytest.mark.asyncio
async def test_skips_nan_close():
    df = pd.DataFrame(
        {"Close": [100.0, float("nan"), 200.0]},
        index=pd.to_datetime(["2026-05-06", "2026-05-07", "2026-05-08"]),
    )
    series = _make_series("Ibovespa", "^BVSP")
    with patch.object(b3_yahoo.yf, "Ticker", return_value=_patched_ticker(df)):
        result = await B3YahooAdapter().fetch(series)
    assert len(result.observations) == 2
    assert [o.value for o in result.observations] == [Decimal("100.0"), Decimal("200.0")]


@pytest.mark.asyncio
async def test_retry_then_raise():
    """3 consecutive failures from yfinance → ExtractionError."""
    failing_ticker = MagicMock()
    failing_ticker.history.side_effect = RuntimeError("yahoo blew up")
    # Speed up tenacity sleeps in tests
    with patch.object(b3_yahoo.yf, "Ticker", return_value=failing_ticker), patch(
        "tenacity.nap.time.sleep", return_value=None
    ):
        series = _make_series("Ibovespa", "^BVSP")
        with pytest.raises(ExtractionError) as excinfo:
            await B3YahooAdapter().fetch(series)
    assert excinfo.value.source == SOURCE_NAME
    assert excinfo.value.series_code == "Ibovespa"
    assert failing_ticker.history.call_count == 3


@pytest.mark.asyncio
async def test_parse_fixture_ifix():
    df = _df_from_fixture("ifix_30d.json")
    series = _make_series("IFIX", "XFIX11.SA")
    with patch.object(b3_yahoo.yf, "Ticker", return_value=_patched_ticker(df)):
        result = await B3YahooAdapter().fetch(series)
    assert len(result.observations) >= 15
    # XFIX11 trades around R$10-20, never in the 1000s
    for o in result.observations:
        assert Decimal("1") < o.value < Decimal("100")


@pytest.mark.skipif(
    os.environ.get("B3_YAHOO_LIVE") != "1",
    reason="live network test; set B3_YAHOO_LIVE=1 to enable",
)
@pytest.mark.asyncio
async def test_ifix_ticker_resolution_live():
    """Smoke: chosen IFIX ticker XFIX11.SA actually returns data.

    Documents IFIX resolution outcome from docs/data-sources/b3-yahoo.md.
    """
    series = _make_series("IFIX", "XFIX11.SA")
    series.first_observation = datetime.date.today() - datetime.timedelta(days=30)
    result = await B3YahooAdapter().fetch(series)
    assert len(result.observations) >= 5
