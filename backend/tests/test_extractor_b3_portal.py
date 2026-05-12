"""Tests for the B3 portal (`indexStatisticsProxy`) adapter.

Strategy:
- Use the captured ``isee_b3portal_2025.json`` fixture for the year-matrix
  parsing path.
- Use ``httpx.MockTransport`` for fetch / retry / error paths (no network).
"""

from __future__ import annotations

import base64
import json
from datetime import UTC, date, datetime
from decimal import Decimal
from pathlib import Path

import httpx
import pytest

from api_extractor.extractors.b3_portal import (
    B3PortalAdapter,
    _build_payload,
    _parse_pt_br_decimal,
    _parse_year_matrix,
)
from api_extractor.extractors.base import ExtractionError
from api_extractor.models.series import Series

FIXTURES = Path(__file__).parent / "fixtures" / "b3_indexes"


# ── helpers ──────────────────────────────────────────────────────────────────
def _series(code: str = "ISE_B3", source_id: str = "ISEE") -> Series:
    return Series(
        code=code,
        name=code,
        category="Sustentabilidade",
        source="B3",
        source_id=source_id,
        frequency="daily",
        unit="pontos",
        first_observation=date(2025, 1, 1),
    )


def _client_with(handler) -> httpx.AsyncClient:
    return httpx.AsyncClient(transport=httpx.MockTransport(handler))


# ── pure parser tests ───────────────────────────────────────────────────────
def test_pt_br_decimal_parsing() -> None:
    assert _parse_pt_br_decimal("131.147,29") == Decimal("131147.29")
    assert _parse_pt_br_decimal("3.020,18") == Decimal("3020.18")
    # No thousands separator.
    assert _parse_pt_br_decimal("12,34") == Decimal("12.34")
    # Negative.
    assert _parse_pt_br_decimal("-1.234,56") == Decimal("-1234.56")


def test_base64_param_construction() -> None:
    """Payload round-trips through base64 → JSON with the expected keys."""
    encoded = _build_payload("ISEE", 2025)
    decoded = json.loads(base64.b64decode(encoded).decode("utf-8"))
    assert decoded == {"language": "pt-br", "index": "ISEE", "year": "2025"}


def test_invalid_dates_skipped() -> None:
    """A synthetic ``day=30`` row must not yield a Feb observation."""
    results = [
        {
            "day": 30,
            "rateValue1": "100,00",  # January 30 — valid
            "rateValue2": "999,99",  # February 30 — INVALID, must be skipped
            "rateValue3": None,
            "rateValue4": "300,00",  # April 30 — valid
            "rateValue5": None,
            "rateValue6": None,
            "rateValue7": None,
            "rateValue8": None,
            "rateValue9": None,
            "rateValue10": None,
            "rateValue11": None,
            "rateValue12": None,
        }
    ]
    obs = _parse_year_matrix("ISE_B3", 2025, results)
    dates = {o.observed_at for o in obs}
    assert datetime(2025, 1, 30, tzinfo=UTC) in dates
    assert datetime(2025, 4, 30, tzinfo=UTC) in dates
    # February only has 28/29 days — no Feb 30 should ever appear.
    assert all(o.observed_at.month != 2 for o in obs)
    assert len(obs) == 2


def test_null_cells_skipped() -> None:
    """Rows where every ``rateValueN`` is null must produce no observations."""
    results = [
        {"day": 1, **{f"rateValue{m}": None for m in range(1, 13)}},
        {"day": 2, **{f"rateValue{m}": None for m in range(1, 13)}},
    ]
    obs = _parse_year_matrix("ISE_B3", 2025, results)
    assert obs == []


def test_envelope_rows_skipped() -> None:
    """The ``day == 0`` min/max envelope rows must not yield observations."""
    results = [
        {"day": 0, **{f"rateValue{m}": "1,00" for m in range(1, 13)}},
    ]
    obs = _parse_year_matrix("ISE_B3", 2025, results)
    assert obs == []


# ── fixture-driven parsing ──────────────────────────────────────────────────
def _count_non_null_cells(results: list[dict]) -> int:
    """Count cells in `results` that would yield a valid observation."""
    n = 0
    for row in results:
        day = row.get("day")
        if not isinstance(day, int) or day < 1 or day > 31:
            continue
        for m in range(1, 13):
            raw = row.get(f"rateValue{m}")
            if raw is None:
                continue
            try:
                date(2025, m, day)
            except ValueError:
                continue
            n += 1
    return n


def test_parse_fixture_isee() -> None:
    fixture = json.loads((FIXTURES / "isee_b3portal_2025.json").read_text())
    results = fixture["raw"]["results"]
    expected = _count_non_null_cells(results)
    obs = _parse_year_matrix("ISE_B3", 2025, results)
    assert len(obs) == expected
    assert expected > 100  # sanity: a real trading year has many cells
    # All observations are well-formed.
    for o in obs:
        assert o.series_code == "ISE_B3"
        assert o.observed_at.tzinfo is UTC
        assert isinstance(o.value, Decimal)
        assert o.value > 0


# ── fetch-path tests (MockTransport) ────────────────────────────────────────
@pytest.mark.asyncio
async def test_fetch_iterates_years_until_today() -> None:
    """Adapter must request exactly one URL per calendar year in the range."""
    fixture = json.loads((FIXTURES / "isee_b3portal_2025.json").read_text())
    requested_years: list[int] = []

    def handler(request: httpx.Request) -> httpx.Response:
        # Path = /indexStatisticsProxy/IndexCall/GetPortfolioDay/<b64>
        b64 = request.url.path.rsplit("/", 1)[-1]
        body = json.loads(base64.b64decode(b64).decode("utf-8"))
        requested_years.append(int(body["year"]))
        return httpx.Response(200, json=fixture["raw"])

    today = datetime.now(tz=UTC).date()
    since = date(today.year - 1, 6, 1)

    async with _client_with(handler) as client:
        adapter = B3PortalAdapter(client=client, inter_year_sleep_s=0.0)
        result = await adapter.fetch(_series(), since=since)

    assert requested_years == list(range(since.year, today.year + 1))
    assert result.source == "b3_portal"
    # All returned observations are on/after `since`.
    since_dt = datetime(since.year, since.month, since.day, tzinfo=UTC)
    assert all(o.observed_at >= since_dt for o in result.observations)
    # Sorted ascending.
    assert result.observations == sorted(
        result.observations, key=lambda o: o.observed_at
    )


@pytest.mark.asyncio
async def test_fetch_parse_fixture_isee() -> None:
    """End-to-end: a single-year window returns observations matching the fixture."""
    fixture = json.loads((FIXTURES / "isee_b3portal_2025.json").read_text())

    def handler(_request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json=fixture["raw"])

    async with _client_with(handler) as client:
        adapter = B3PortalAdapter(client=client, inter_year_sleep_s=0.0)
        result = await adapter.fetch(_series(), since=date(2025, 1, 1))

    # Should cover at least one full year of trading-day cells.
    assert len(result.observations) > 100
    assert result.observations[0].observed_at.year == 2025


@pytest.mark.asyncio
async def test_retry_then_raise() -> None:
    """All-fail transport handler → ``ExtractionError`` after exhausting retries."""
    call_count = {"n": 0}

    def handler(_request: httpx.Request) -> httpx.Response:
        call_count["n"] += 1
        raise httpx.ConnectError("simulated network down")

    async with _client_with(handler) as client:
        # Use a short wait by patching the retry decorator? tenacity uses real
        # asyncio.sleep. To keep the test fast we shrink the year range to 1.
        adapter = B3PortalAdapter(client=client, inter_year_sleep_s=0.0)
        # Force a single-year request so retries hit exactly 3.
        today = datetime.now(tz=UTC).date()
        s = _series()
        s.first_observation = date(today.year, 1, 1)
        with pytest.raises(ExtractionError):
            await adapter.fetch(s, since=date(today.year, 1, 1))

    # Three retry attempts inside _get_with_retry.
    assert call_count["n"] == 3
