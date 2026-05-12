"""Tests for the BCB SGS adapter.

Strategy:
- Use captured fixtures in ``backend/tests/fixtures/bcb_sgs/`` for parsing tests.
- Use ``httpx.MockTransport`` for fetch-path / retry / error-path tests
  (no network, no extra dev dep).
"""

from __future__ import annotations

import json
from datetime import UTC, date, datetime
from decimal import Decimal
from pathlib import Path

import httpx
import pytest

from api_extractor.extractors.base import ExtractionError, FetchedObservation
from api_extractor.extractors.bcb_sgs import (
    BCBSGSAdapter,
    _parse_date,
    _parse_value,
)
from api_extractor.models.series import Series

FIXTURES = Path(__file__).parent / "fixtures" / "bcb_sgs"


# ── helpers ──────────────────────────────────────────────────────────────────
def _series(code: str, source_id: str, freq: str = "monthly") -> Series:
    return Series(
        code=code,
        name=code,
        category="Inflação",
        source="BCB SGS",
        source_id=source_id,
        frequency=freq,
        unit="%",
        first_observation=date(2000, 1, 1),
    )


def _client_with(handler) -> httpx.AsyncClient:
    return httpx.AsyncClient(transport=httpx.MockTransport(handler))


# ── pure parser tests ───────────────────────────────────────────────────────
def test_parse_value_dot_decimal() -> None:
    assert _parse_value("0.38") == Decimal("0.38")
    assert _parse_value("5.6937") == Decimal("5.6937")


def test_parse_value_comma_decimal() -> None:
    """Defensive: csv-format responses use comma. Must still parse."""
    assert _parse_value("12,34") == Decimal("12.34")
    assert _parse_value("-0,73") == Decimal("-0.73")


def test_parse_date_format() -> None:
    parsed = _parse_date("01/01/2024")
    assert parsed == datetime(2024, 1, 1, tzinfo=UTC)
    assert parsed.tzinfo is UTC


# ── fixture-driven parsing ──────────────────────────────────────────────────
@pytest.mark.asyncio
async def test_parse_fixture_ipca() -> None:
    payload = json.loads((FIXTURES / "ipca_433.json").read_text())

    def handler(_request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json=payload)

    async with _client_with(handler) as client:
        adapter = BCBSGSAdapter(client=client)
        result = await adapter.fetch(_series("IPCA", "433"))

    assert result.source == "bcb_sgs"
    assert result.series_code == "IPCA"
    assert len(result.observations) == len(payload)
    # Spot-check first parsed observation against raw payload.
    first = result.observations[0]
    assert isinstance(first, FetchedObservation)
    assert first.value == Decimal(payload[0]["valor"])
    assert first.observed_at == _parse_date(payload[0]["data"])


@pytest.mark.asyncio
async def test_fetch_returns_obs_sorted_ascending() -> None:
    payload = json.loads((FIXTURES / "selic_432.json").read_text())

    def handler(_request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json=payload)

    async with _client_with(handler) as client:
        adapter = BCBSGSAdapter(client=client)
        result = await adapter.fetch(_series("SELIC", "432", freq="daily"))

    dates = [o.observed_at for o in result.observations]
    assert dates == sorted(dates)


# ── since-filter ─────────────────────────────────────────────────────────────
@pytest.mark.asyncio
async def test_since_filter_sent_as_param() -> None:
    captured: dict[str, httpx.URL] = {}

    def handler(request: httpx.Request) -> httpx.Response:
        captured["url"] = request.url
        return httpx.Response(200, json=[])

    async with _client_with(handler) as client:
        adapter = BCBSGSAdapter(client=client)
        await adapter.fetch(_series("IPCA", "433"), since=date(2024, 1, 15))

    assert captured["url"].params["dataInicial"] == "15/01/2024"
    assert captured["url"].params["formato"] == "json"


@pytest.mark.asyncio
async def test_no_since_sends_window_param() -> None:
    """Regression (W5b/Bug 1): BCB SGS rejects daily series with no window
    and rejects any series with windows > 10y. The adapter must always emit
    a bounded ``dataInicial``/``dataFinal`` pair when ``since is None``."""
    captured: list[httpx.URL] = []

    def handler(request: httpx.Request) -> httpx.Response:
        captured.append(request.url)
        return httpx.Response(200, json=[])

    async with _client_with(handler) as client:
        adapter = BCBSGSAdapter(client=client)
        await adapter.fetch(_series("IPCA", "433"))

    # At least one request was made and every one of them carries window
    # params; none reaches BCB with the no-param shape that triggers 406.
    assert captured
    for url in captured:
        assert "dataInicial" in url.params
        assert "dataFinal" in url.params


@pytest.mark.asyncio
async def test_no_since_chunks_into_ten_year_windows() -> None:
    """Regression (W5b/Bug 1): when full history span exceeds 10 years,
    the adapter must split the fetch into ≤ 10-year windows."""
    captured: list[httpx.URL] = []

    def handler(request: httpx.Request) -> httpx.Response:
        captured.append(request.url)
        return httpx.Response(200, json=[])

    # Force a >10-year historical span by passing a series with a very old
    # first_observation. The adapter is expected to issue ≥ 2 requests.
    s = _series("PTAX_USD", "1", freq="daily")
    s.first_observation = date(1984, 1, 1)
    async with _client_with(handler) as client:
        adapter = BCBSGSAdapter(client=client)
        await adapter.fetch(s)

    assert len(captured) >= 2
    # Each window must be ≤ 10 years wide.
    for url in captured:
        di = datetime.strptime(url.params["dataInicial"], "%d/%m/%Y").date()
        df = datetime.strptime(url.params["dataFinal"], "%d/%m/%Y").date()
        assert (df - di).days <= 365 * 10 + 5  # small slack for boundary day


# ── edge cases ───────────────────────────────────────────────────────────────
@pytest.mark.asyncio
async def test_empty_response() -> None:
    def handler(_request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json=[])

    async with _client_with(handler) as client:
        adapter = BCBSGSAdapter(client=client)
        result = await adapter.fetch(_series("IPCA", "433"))

    assert result.observations == []
    assert result.source == "bcb_sgs"


@pytest.mark.asyncio
async def test_handles_null_value() -> None:
    payload = [
        {"data": "01/01/2024", "valor": "1.23"},
        {"data": "02/01/2024", "valor": None},  # holiday / missing
        {"data": "03/01/2024", "valor": "1.25"},
    ]

    def handler(_request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json=payload)

    async with _client_with(handler) as client:
        adapter = BCBSGSAdapter(client=client)
        result = await adapter.fetch(_series("CDI", "12", freq="daily"))

    assert len(result.observations) == 2
    assert [o.value for o in result.observations] == [Decimal("1.23"), Decimal("1.25")]


# ── retry + failure ─────────────────────────────────────────────────────────
@pytest.mark.asyncio
async def test_retry_then_raise(monkeypatch: pytest.MonkeyPatch) -> None:
    """3 consecutive 500s → ExtractionError raised, 3 calls made."""
    # Patch tenacity wait to 0 so test is fast.
    import api_extractor.extractors.bcb_sgs as mod
    from tenacity import wait_none

    monkeypatch.setattr(
        mod.BCBSGSAdapter._get_with_retry.retry,
        "wait",
        wait_none(),
    )

    call_count = {"n": 0}

    def handler(_request: httpx.Request) -> httpx.Response:
        call_count["n"] += 1
        return httpx.Response(500, json={"error": "upstream"})

    async with _client_with(handler) as client:
        adapter = BCBSGSAdapter(client=client)
        with pytest.raises(ExtractionError) as exc:
            await adapter.fetch(_series("IPCA", "433"))

    assert call_count["n"] == 3
    assert exc.value.source == "bcb_sgs"
    assert exc.value.series_code == "IPCA"


@pytest.mark.asyncio
async def test_404_treated_as_no_data(monkeypatch: pytest.MonkeyPatch) -> None:
    """Regression (W5b/Bug 1): BCB returns 404 for windows that contain
    zero observations (e.g. daily series queried at since=today before the
    daily publication). That is a normal "no new data" outcome, not a
    failure, and must not be retried."""
    import api_extractor.extractors.bcb_sgs as mod
    from tenacity import wait_none

    monkeypatch.setattr(
        mod.BCBSGSAdapter._get_with_retry.retry,
        "wait",
        wait_none(),
    )

    call_count = {"n": 0}

    def handler(_request: httpx.Request) -> httpx.Response:
        call_count["n"] += 1
        return httpx.Response(404, json={"error": "not found"})

    async with _client_with(handler) as client:
        adapter = BCBSGSAdapter(client=client)
        result = await adapter.fetch(
            _series("BOGUS", "999999"), since=date(2026, 5, 11)
        )

    assert result.observations == []
    assert call_count["n"] == 1


@pytest.mark.asyncio
async def test_non_list_payload_raises_extraction_error() -> None:
    """Regression (W5b/Bug 2): BCB sometimes returns a JSON object error
    envelope (``{"error": ..., "message": ...}``) with a 2xx status. The
    adapter must surface that as a clear ExtractionError rather than
    crashing inside _parse_payload with ``'str' object has no attribute 'get'``."""
    def handler(_request: httpx.Request) -> httpx.Response:
        return httpx.Response(
            200,
            json={
                "error": "O sistema aceita uma janela de consulta de, no "
                "máximo, 10 anos em séries de periodicidade diária",
                "message": "...",
            },
        )

    async with _client_with(handler) as client:
        adapter = BCBSGSAdapter(client=client)
        with pytest.raises(ExtractionError) as exc:
            await adapter.fetch(
                _series("CDI", "12", freq="daily"), since=date(2026, 1, 1)
            )

    assert "not a JSON array" in str(exc.value)
