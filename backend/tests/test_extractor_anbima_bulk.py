"""Tests for the ANBIMA bulk-history XLSX adapter.

Strategy:
- Use the captured fixture ``IMAGERAL-HISTORICO.xls`` for the parse path.
- Use ``httpx.MockTransport`` for fetch / retry / error path tests.
"""

from __future__ import annotations

from datetime import UTC, date, datetime
from decimal import Decimal
from pathlib import Path

import httpx
import pytest

from api_extractor.extractors.anbima_bulk import (
    ANBIMABulkAdapter,
    _build_url,
    _parse_xlsx_bytes,
)
from api_extractor.extractors.base import ExtractionError
from api_extractor.models.series import Series

FIXTURES = Path(__file__).parent / "fixtures" / "anbima_bulk"
FIXTURE_FILE = FIXTURES / "IMAGERAL-HISTORICO.xls"


def _series(code: str, source_id: str) -> Series:
    return Series(
        code=code,
        name=code,
        category="Renda Fixa",
        source="ANBIMA",
        source_id=source_id,
        frequency="daily",
        unit="índice",
        first_observation=date(2001, 12, 4),
    )


def _client_with(handler) -> httpx.AsyncClient:
    return httpx.AsyncClient(transport=httpx.MockTransport(handler))


# ── parse-path tests ────────────────────────────────────────────────────────
def test_build_url() -> None:
    assert _build_url("IMAGERAL") == (
        "https://s3-data-prd-use1-precos.s3.us-east-1.amazonaws.com"
        "/arquivos/indices-historico/IMAGERAL-HISTORICO.xls"
    )


def test_parse_imageral_xlsx() -> None:
    """Parsing the IMAGERAL fixture yields >6k rows w/ correct types."""
    payload = FIXTURE_FILE.read_bytes()
    obs = _parse_xlsx_bytes(payload, series_code="IMA-Geral", since=None)
    assert len(obs) >= 6000
    # Earliest row anchors to 2001-12-04 (file start).
    assert obs[0].observed_at.year == 2001
    assert obs[0].observed_at.month == 12
    assert obs[0].observed_at.tzinfo is UTC
    # First series_code must be propagated.
    assert obs[0].series_code == "IMA-Geral"
    # Values are Decimal, not float.
    assert isinstance(obs[0].value, Decimal)
    # Index started at ~532 in Dec/2001.
    assert obs[0].value > Decimal("500")
    # Latest observation must dwarf the seed value (index trends up over decades).
    assert obs[-1].value > Decimal("5000")
    # Sorted ascending.
    assert all(
        obs[i].observed_at <= obs[i + 1].observed_at for i in range(len(obs) - 1)
    )


def test_filter_by_since() -> None:
    """``since=`` filters parsed rows to ``observed_at.date() >= since``."""
    payload = FIXTURE_FILE.read_bytes()
    cutoff = date(2024, 1, 1)
    obs = _parse_xlsx_bytes(payload, series_code="IMA-Geral", since=cutoff)
    assert obs, "expected non-empty result after 2024-01-01"
    assert all(o.observed_at.date() >= cutoff for o in obs)
    # And full-history minus filtered > filtered (sanity).
    obs_all = _parse_xlsx_bytes(payload, series_code="IMA-Geral", since=None)
    assert len(obs_all) > len(obs)


def test_decimal_parsing() -> None:
    """All values must be Decimal — never float."""
    payload = FIXTURE_FILE.read_bytes()
    obs = _parse_xlsx_bytes(payload, series_code="IMA-Geral", since=None)
    sample = obs[:50] + obs[-50:]
    for o in sample:
        assert isinstance(o.value, Decimal)


# ── adapter-level tests ─────────────────────────────────────────────────────
@pytest.mark.asyncio
async def test_fetch_full_roundtrip() -> None:
    """End-to-end: MockTransport serves the fixture, adapter parses it."""
    payload = FIXTURE_FILE.read_bytes()

    def handler(_req: httpx.Request) -> httpx.Response:
        return httpx.Response(
            200,
            content=payload,
            headers={"content-type": "application/vnd.ms-excel"},
        )

    series = _series("IMA-Geral", "IMAGERAL")
    async with _client_with(handler) as client:
        adapter = ANBIMABulkAdapter(client=client)
        result = await adapter.fetch(series, since=date(2024, 1, 1))
    assert result.source == "anbima"
    assert result.series_code == "IMA-Geral"
    assert len(result.observations) > 0
    assert all(o.observed_at.date() >= date(2024, 1, 1) for o in result.observations)


@pytest.mark.asyncio
async def test_download_404_raises() -> None:
    """A 404 on the S3 GET must surface as ExtractionError (not retried)."""

    def handler(_req: httpx.Request) -> httpx.Response:
        return httpx.Response(404, content=b"<Error>NoSuchKey</Error>")

    series = _series("IMA-Geral", "DOES_NOT_EXIST")
    async with _client_with(handler) as client:
        adapter = ANBIMABulkAdapter(client=client)
        with pytest.raises(ExtractionError):
            await adapter.fetch(series)


@pytest.mark.asyncio
async def test_retry_on_transport_error() -> None:
    """3× transport errors → ExtractionError after retries exhausted."""
    attempts = {"n": 0}

    def handler(_req: httpx.Request) -> httpx.Response:
        attempts["n"] += 1
        raise httpx.ConnectError("boom")

    series = _series("IMA-Geral", "IMAGERAL")
    async with _client_with(handler) as client:
        adapter = ANBIMABulkAdapter(client=client)
        with pytest.raises(ExtractionError):
            await adapter.fetch(series)
    assert attempts["n"] == 3


@pytest.mark.asyncio
async def test_retry_on_5xx_then_succeeds() -> None:
    """Two 503 responses then a 200 → success; observations parsed."""
    payload = FIXTURE_FILE.read_bytes()
    attempts = {"n": 0}

    def handler(_req: httpx.Request) -> httpx.Response:
        attempts["n"] += 1
        if attempts["n"] < 3:
            return httpx.Response(503, content=b"")
        return httpx.Response(200, content=payload)

    series = _series("IMA-Geral", "IMAGERAL")
    async with _client_with(handler) as client:
        adapter = ANBIMABulkAdapter(client=client)
        result = await adapter.fetch(series, since=date(2026, 1, 1))
    assert attempts["n"] == 3
    assert len(result.observations) > 0


@pytest.mark.asyncio
async def test_returns_observations_when_since_none() -> None:
    """No ``since`` argument returns the full history."""
    payload = FIXTURE_FILE.read_bytes()

    def handler(_req: httpx.Request) -> httpx.Response:
        return httpx.Response(200, content=payload)

    series = _series("IMA-Geral", "IMAGERAL")
    async with _client_with(handler) as client:
        adapter = ANBIMABulkAdapter(client=client)
        result = await adapter.fetch(series, since=None)
    # The fixture has 6000+ rows.
    assert len(result.observations) >= 6000
    # Sorted ascending and earliest is 2001.
    assert result.observations[0].observed_at.year == 2001
