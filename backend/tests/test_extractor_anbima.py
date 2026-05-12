"""Tests for the ANBIMA IMA-family adapter.

Strategy:
- Use captured fixtures in ``backend/tests/fixtures/anbima_ima/`` for the
  parsing path.
- Use ``httpx.MockTransport`` for fetch / retry / error path tests (no real
  network).
- All tests force ``throttle_seconds=0`` so the suite stays fast.
"""

from __future__ import annotations

from datetime import UTC, date, datetime
from decimal import Decimal
from pathlib import Path

import httpx
import pytest

from api_extractor.extractors.anbima_ima import (
    ANBIMAAdapter,
    _iter_business_dates,
    _normalize_index_name,
    _parse_csv,
    _parse_pt_br_decimal,
    _parse_response_date,
)
from api_extractor.extractors.base import ExtractionError
from api_extractor.models.series import Series

FIXTURES = Path(__file__).parent / "fixtures" / "anbima_ima"


# ── helpers ──────────────────────────────────────────────────────────────────
def _series(code: str, source_id: str, first_obs: date | None = None) -> Series:
    return Series(
        code=code,
        name=code,
        category="Renda Fixa",
        source="ANBIMA",
        source_id=source_id,
        frequency="daily",
        unit="índice",
        first_observation=first_obs or date(2000, 12, 29),
    )


def _client_with(handler) -> httpx.AsyncClient:
    return httpx.AsyncClient(transport=httpx.MockTransport(handler))


def _read_fixture_bytes(name: str) -> bytes:
    return (FIXTURES / name).read_bytes()


def _decode(body: bytes) -> str:
    return body.decode("iso-8859-1")


# ── pure parser tests ───────────────────────────────────────────────────────
def test_parse_pt_br_locale() -> None:
    assert _parse_pt_br_decimal("1.234,567") == Decimal("1234.567")
    assert _parse_pt_br_decimal("11.521,718637") == Decimal("11521.718637")
    assert _parse_pt_br_decimal("0,38") == Decimal("0.38")


def test_normalize_index_name() -> None:
    assert _normalize_index_name("IMA-GERAL") == "IMA-GERAL"
    assert _normalize_index_name("IMA-GERAL ex-C") == "IMA-GERAL-EX-C"
    assert _normalize_index_name("IMA-B 5+") == "IMA-B-5+"
    assert _normalize_index_name("  IRF-M 1 ") == "IRF-M-1"


def test_parse_response_date() -> None:
    parsed = _parse_response_date("08/05/2026")
    assert parsed == datetime(2026, 5, 8, tzinfo=UTC)
    assert parsed.tzinfo is UTC


def test_business_date_iteration() -> None:
    # 2026-05-01 (Fri) through 2026-05-08 (Fri). Sat 02 + Sun 03 dropped.
    dates = _iter_business_dates(date(2026, 5, 1), date(2026, 5, 8))
    assert dates == [
        date(2026, 5, 1),
        date(2026, 5, 4),
        date(2026, 5, 5),
        date(2026, 5, 6),
        date(2026, 5, 7),
        date(2026, 5, 8),
    ]


# ── fixture-driven parsing ──────────────────────────────────────────────────
def test_parse_fixture_ima_geral() -> None:
    body = _decode(_read_fixture_bytes("IMA_SH_08052026.csv"))
    obs = _parse_csv(body, target_source_id="IMA-GERAL", series_code="IMA-Geral")
    # IMA-GERAL (not IMA-GERAL ex-C) appears once on 08/05/2026.
    assert len(obs) >= 1
    assert obs[0].series_code == "IMA-Geral"
    assert obs[0].observed_at == datetime(2026, 5, 8, tzinfo=UTC)
    assert isinstance(obs[0].value, Decimal)
    assert obs[0].value > Decimal("1000")


def test_iso_8859_1_decoding() -> None:
    # Header contains "Índice" / "Variação" / "Número" with accented chars.
    raw = _read_fixture_bytes("IMA_SH_08052026.csv")
    body = raw.decode("iso-8859-1")
    assert "Índice" in body
    assert "Variação" in body
    assert "Número" in body


def test_filter_by_source_id() -> None:
    """Multi-series CSV must yield rows only for the requested source_id."""
    body = _decode(_read_fixture_bytes("IMA_SH_08052026.csv"))
    irf_m_1 = _parse_csv(body, target_source_id="IRF-M-1", series_code="IRF-M_1")
    assert len(irf_m_1) == 1
    irf_m_1_plus = _parse_csv(
        body, target_source_id="IRF-M-1+", series_code="IRF-M_1plus"
    )
    assert len(irf_m_1_plus) == 1
    # Distinct values
    assert irf_m_1[0].value != irf_m_1_plus[0].value
    # "IRF-M" parent must not collide with "IRF-M 1" or "IRF-M 1+"
    irf_m = _parse_csv(body, target_source_id="IRF-M", series_code="IRF-M")
    assert len(irf_m) == 1
    assert irf_m[0].value not in {irf_m_1[0].value, irf_m_1_plus[0].value}


def test_empty_body_returns_no_observations() -> None:
    """Weekend/holiday body (HTTP 200, ~46 bytes, header only) yields []."""
    body = "TOTAIS - QUADRO RESUMO\r\n"
    obs = _parse_csv(body, target_source_id="IMA-GERAL", series_code="IMA-Geral")
    assert obs == []


# ── adapter fetch path ──────────────────────────────────────────────────────
@pytest.mark.asyncio
async def test_fetch_fixture_round_trip() -> None:
    """End-to-end: 1 business day, fixture body, returns 1 obs."""
    body = _read_fixture_bytes("IMA_SH_08052026.csv")  # raw ISO-8859-1 bytes

    def handler(_request: httpx.Request) -> httpx.Response:
        return httpx.Response(
            200, content=body, headers={"content-type": "text/csv"}
        )

    series = _series("IMA-Geral", "IMA-GERAL", first_obs=date(2026, 5, 8))
    async with _client_with(handler) as client:
        adapter = ANBIMAAdapter(client=client, throttle_seconds=0.0)
        # since=today bound; just a single business day to fetch
        result = await adapter.fetch(series, since=date(2026, 5, 8))

    assert result.source == "anbima"
    assert result.series_code == "IMA-Geral"
    # Today is dynamic; we just require ≥1 observation parsed from the fixture
    assert len(result.observations) >= 1
    first = result.observations[0]
    assert first.value > Decimal("1000")


@pytest.mark.asyncio
async def test_fetch_skips_empty_days() -> None:
    """Empty-body response (weekend) must not contribute observations."""

    def handler(_request: httpx.Request) -> httpx.Response:
        return httpx.Response(
            200,
            content=b"TOTAIS - QUADRO RESUMO\r\n",
            headers={"content-type": "text/csv"},
        )

    series = _series("IMA-Geral", "IMA-GERAL", first_obs=date(2026, 5, 4))
    async with _client_with(handler) as client:
        adapter = ANBIMAAdapter(client=client, throttle_seconds=0.0)
        result = await adapter.fetch(series, since=date(2026, 5, 4))
    assert result.observations == []


@pytest.mark.asyncio
async def test_retry_then_raise() -> None:
    """Three consecutive 500 responses → ExtractionError after retries."""
    attempts = {"n": 0}

    def handler(_request: httpx.Request) -> httpx.Response:
        attempts["n"] += 1
        return httpx.Response(500, content=b"boom")

    series = _series("IMA-Geral", "IMA-GERAL", first_obs=date(2026, 5, 8))
    async with _client_with(handler) as client:
        # Force fast retry waits via a monkey-patched sleep on the wrapper if
        # needed. tenacity's wait_exponential min=2 means ~10s worst case,
        # acceptable for a single test.
        adapter = ANBIMAAdapter(client=client, throttle_seconds=0.0)
        with pytest.raises(ExtractionError):
            await adapter.fetch(series, since=date(2026, 5, 8))
    assert attempts["n"] == 3


@pytest.mark.asyncio
async def test_business_date_iteration_via_fetch() -> None:
    """since=2026-05-01 must POST only on Mon-Fri up to (and incl.) today,
    but in test we restrict by giving the handler-mock observed dates."""
    seen: list[str] = []

    def handler(request: httpx.Request) -> httpx.Response:
        # Form body is urlencoded; capture Dt_Ref
        params = dict(
            kv.split("=", 1)
            for kv in request.content.decode("ascii").split("&")
            if "=" in kv
        )
        seen.append(params.get("Dt_Ref", ""))
        return httpx.Response(
            200,
            content=b"TOTAIS - QUADRO RESUMO\r\n",
            headers={"content-type": "text/csv"},
        )

    # Use a tight historical window so we don't iterate through 'today'.
    # We achieve this by setting first_observation in the past and `since` =
    # start of the window; the adapter caps end at today, which is fine —
    # the test only asserts NO Sat/Sun appear among the requested dates.
    series = _series("IMA-Geral", "IMA-GERAL", first_obs=date(2026, 5, 1))
    async with _client_with(handler) as client:
        adapter = ANBIMAAdapter(client=client, throttle_seconds=0.0)
        await adapter.fetch(series, since=date(2026, 5, 1))

    # Every captured Dt_Ref must parse to a weekday.
    assert seen, "expected at least one POST"
    for s in seen:
        d = datetime.strptime(s.replace("%2F", "/"), "%d/%m/%Y").date()
        assert d.weekday() < 5, f"weekend date requested: {s}"

    # Sanity: 2026-05-01 (Fri), 04 (Mon), 05 (Tue) must be present if today
    # is on/after them — which it is for any reasonable test run date.
    requested_dates = {
        datetime.strptime(s.replace("%2F", "/"), "%d/%m/%Y").date() for s in seen
    }
    assert date(2026, 5, 1) in requested_dates
