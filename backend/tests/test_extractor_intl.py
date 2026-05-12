"""Phase 20 Wave B-3 — International index adapter coverage.

The existing :class:`B3YahooAdapter` is series-driven (it reads
``series.source_id`` verbatim), so it serves all 8 new international index
series seeded in Wave A. These tests:

- replay captured fixtures for ^GSPC, ^IXIC, ^STOXX50E (no network)
- verify trading-day anchoring is correct for non-Brazil markets (in
  particular Europe/Berlin, which used to round-trip through Sao_Paulo and
  drift one day back)
- assert currency is *not* attached to observations (it's series metadata)
- sanity-check that ETF-proxy series (URTH for MSCI World) return ETF prices
  rather than underlying index values
"""

from __future__ import annotations

import datetime
import json
from dataclasses import fields as dc_fields
from decimal import Decimal
from pathlib import Path
from unittest.mock import MagicMock, patch

import pandas as pd
import pytest

from api_extractor.extractors import b3_yahoo
from api_extractor.extractors.b3_yahoo import B3YahooAdapter, SOURCE_NAME
from api_extractor.extractors.base import ExtractionResult, FetchedObservation

FIXTURES = Path(__file__).parent / "fixtures" / "intl_indexes"


# ──────────────────────────── helpers ─────────────────────────────────────── #


def _df_from_fixture(name: str) -> pd.DataFrame:
    payload = json.loads((FIXTURES / name).read_text())
    df = pd.DataFrame(payload["records"])
    # Preserve original tz offsets — fixtures carry the market-local anchor
    # (e.g. -04:00 for NY, +02:00 for Berlin).
    df["Date"] = pd.to_datetime(df["Date"], utc=False)
    df = df.set_index("Date")
    return df


def _make_series(code: str, source_id: str) -> object:
    s = MagicMock()
    s.code = code
    s.source_id = source_id
    s.first_observation = datetime.date(2026, 4, 1)
    return s


def _patched_ticker(df: pd.DataFrame) -> MagicMock:
    ticker = MagicMock()
    ticker.history.return_value = df
    return ticker


def _fixture_trading_days(name: str) -> set[datetime.date]:
    """Extract the set of local trading days from a fixture file.

    The fixture's ``Date`` field is the local-tz midnight anchor; the date
    portion is the trading day regardless of tz.
    """
    payload = json.loads((FIXTURES / name).read_text())
    days: set[datetime.date] = set()
    for rec in payload["records"]:
        # e.g. "2026-04-13T00:00:00+02:00" — first 10 chars are YYYY-MM-DD
        days.add(datetime.date.fromisoformat(rec["Date"][:10]))
    return days


# ────────────────────────────── tests ─────────────────────────────────────── #


@pytest.mark.asyncio
async def test_parse_fixture_sp500() -> None:
    df = _df_from_fixture("gspc_30d.json")
    series = _make_series("SP500", "^GSPC")
    with patch.object(b3_yahoo.yf, "Ticker", return_value=_patched_ticker(df)):
        result = await B3YahooAdapter().fetch(series)
    assert isinstance(result, ExtractionResult)
    assert result.source == SOURCE_NAME
    assert len(result.observations) >= 15
    assert all(o.series_code == "SP500" for o in result.observations)
    assert all(isinstance(o.value, Decimal) for o in result.observations)
    # S&P 500 in 2026 sits well above 4000; sanity-check magnitude.
    assert all(o.value > Decimal("1000") for o in result.observations)


@pytest.mark.asyncio
async def test_parse_fixture_nasdaq_composite() -> None:
    df = _df_from_fixture("ixic_30d.json")
    series = _make_series("Nasdaq_Composite", "^IXIC")
    with patch.object(b3_yahoo.yf, "Ticker", return_value=_patched_ticker(df)):
        result = await B3YahooAdapter().fetch(series)
    assert len(result.observations) >= 15
    assert all(o.series_code == "Nasdaq_Composite" for o in result.observations)
    # Observations must be sorted ascending by observed_at.
    dates = [o.observed_at for o in result.observations]
    assert dates == sorted(dates)


@pytest.mark.asyncio
async def test_parse_fixture_euro_stoxx_trading_day_preserved() -> None:
    """STOXX50E uses Europe/Berlin (+02:00). The adapter must preserve the
    upstream local trading day rather than rounding to America/Sao_Paulo."""
    df = _df_from_fixture("stoxx50e_30d.json")
    series = _make_series("Euro_Stoxx_50", "^STOXX50E")
    with patch.object(b3_yahoo.yf, "Ticker", return_value=_patched_ticker(df)):
        result = await B3YahooAdapter().fetch(series)

    assert len(result.observations) >= 15
    # Every observed_at must be UTC midnight.
    for o in result.observations:
        assert o.observed_at.tzinfo == datetime.timezone.utc
        assert o.observed_at.hour == 0
        assert o.observed_at.minute == 0

    # Every trading day in the fixture survives intact (no off-by-one).
    expected_days = _fixture_trading_days("stoxx50e_30d.json")
    got_days = {o.observed_at.date() for o in result.observations}
    assert got_days == expected_days, (
        f"trading-day drift: expected {sorted(expected_days)}, "
        f"got {sorted(got_days)}"
    )


@pytest.mark.asyncio
async def test_currency_field_not_attached_to_observations() -> None:
    """Currency is series-level metadata. Observations carry only
    ``series_code``, ``observed_at``, ``value`` — no currency."""
    df = _df_from_fixture("gspc_30d.json")
    series = _make_series("SP500", "^GSPC")
    with patch.object(b3_yahoo.yf, "Ticker", return_value=_patched_ticker(df)):
        result = await B3YahooAdapter().fetch(series)
    obs_field_names = {f.name for f in dc_fields(FetchedObservation)}
    assert "currency" not in obs_field_names
    assert obs_field_names == {"series_code", "observed_at", "value"}
    # And the fixture observations themselves don't sneak one in.
    assert all(not hasattr(o, "currency") for o in result.observations)


@pytest.mark.asyncio
async def test_proxy_etf_returns_etf_values() -> None:
    """MSCI World is fetched via the URTH ETF proxy. The adapter must return
    ETF share prices verbatim (no transform to underlying index)."""
    # URTH trades roughly in the USD 100-300 range; the MSCI World index sits
    # in the 2000-4000 range. Build a synthetic fixture in URTH territory and
    # verify the adapter passes values straight through.
    df = pd.DataFrame(
        {
            "Open": [180.0, 182.0],
            "High": [183.0, 184.0],
            "Low": [179.0, 181.0],
            "Close": [182.50, 183.25],
            "Volume": [1_000_000, 1_200_000],
        },
        index=pd.to_datetime(
            ["2026-04-13", "2026-04-14"]
        ).tz_localize("America/New_York"),
    )
    series = _make_series("MSCI_World", "URTH")
    with patch.object(b3_yahoo.yf, "Ticker", return_value=_patched_ticker(df)):
        result = await B3YahooAdapter().fetch(series)

    assert len(result.observations) == 2
    values = [o.value for o in result.observations]
    assert values == [Decimal("182.5"), Decimal("183.25")]
    # ETF prices, not index magnitude.
    assert all(Decimal("50") < v < Decimal("1000") for v in values)
