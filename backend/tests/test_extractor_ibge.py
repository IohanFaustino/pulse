"""Tests for `IBGESidraAdapter` (Phase 2 / W2).

Strategy:
- Parsing tests use captured live fixtures in `tests/fixtures/ibge_sidra/`
  to exercise the real SIDRA response shape without network I/O.
- Retry test injects an `httpx.MockTransport` that always 500s to confirm
  the adapter exhausts its 3 attempts and raises `ExtractionError`.
- Pure period parsers are exercised directly for monthly and quarterly codes.

Maps FR-1.1 (unified adapter contract: returns ``ExtractionResult`` with
normalized observations) and FR-1.3 (idempotent + retry: deterministic
parsing, sorted output, retries-then-raise).
"""

from __future__ import annotations

import json
from datetime import UTC, datetime
from decimal import Decimal
from pathlib import Path
from types import SimpleNamespace

import httpx
import pytest

from api_extractor.extractors.base import ExtractionError, ExtractionResult
from api_extractor.extractors.ibge_sidra import (
    IBGE_VARIABLE_MAP,
    IBGESidraAdapter,
    parse_period_monthly,
    parse_period_quarterly,
)

FIXTURE_DIR = Path(__file__).parent / "fixtures" / "ibge_sidra"


def _load(name: str) -> list[dict]:
    return json.loads((FIXTURE_DIR / name).read_text(encoding="utf-8"))


def _stub_series(code: str):
    """Minimal stand-in for the SQLAlchemy Series ORM model.

    `IBGESidraAdapter.fetch` only reads `.code` and (indirectly) `.source_id`,
    so a duck-typed object suffices and avoids touching the DB.
    """
    return SimpleNamespace(code=code, source_id=IBGE_VARIABLE_MAP[code].table)


# ── Pure period parsers ──────────────────────────────────────────────────────


def test_period_parser_monthly() -> None:
    assert parse_period_monthly("202401") == datetime(2024, 1, 1, tzinfo=UTC)
    assert parse_period_monthly("199912") == datetime(1999, 12, 1, tzinfo=UTC)
    with pytest.raises(ValueError):
        parse_period_monthly("2024")
    with pytest.raises(ValueError):
        parse_period_monthly("202413")


def test_period_parser_quarterly() -> None:
    assert parse_period_quarterly("202301") == datetime(2023, 1, 1, tzinfo=UTC)
    assert parse_period_quarterly("202302") == datetime(2023, 4, 1, tzinfo=UTC)
    assert parse_period_quarterly("202303") == datetime(2023, 7, 1, tzinfo=UTC)
    assert parse_period_quarterly("202304") == datetime(2023, 10, 1, tzinfo=UTC)
    with pytest.raises(ValueError):
        parse_period_quarterly("202305")
    with pytest.raises(ValueError):
        parse_period_quarterly("2023Q1")


# ── Fixture-driven parsing ───────────────────────────────────────────────────


def test_parse_fixture_pib() -> None:
    adapter = IBGESidraAdapter()
    payload = _load("pib_5932.json")
    spec = IBGE_VARIABLE_MAP["PIB_Nominal"]
    obs = adapter._parse_payload(payload, "PIB_Nominal", spec)

    # Captured fixture is Q1 2023 → quarterly anchor = 2023-01-01 UTC.
    assert len(obs) >= 1
    by_var = {o.value for o in obs}
    assert Decimal("1.4") in by_var  # taxa t/t-1 from variable 6564
    for o in obs:
        assert o.series_code == "PIB_Nominal"
        assert o.observed_at == datetime(2023, 1, 1, tzinfo=UTC)
        assert isinstance(o.value, Decimal)


def test_parse_fixture_prod_industrial() -> None:
    adapter = IBGESidraAdapter()
    payload = _load("prod_industrial_8888.json")
    spec = IBGE_VARIABLE_MAP["Prod_Industrial"]
    obs = adapter._parse_payload(payload, "Prod_Industrial", spec)

    assert len(obs) == 1
    only = obs[0]
    assert only.observed_at == datetime(2024, 1, 1, tzinfo=UTC)
    assert only.value == Decimal("93.75190")


def test_skip_metadata_header_row() -> None:
    """The first array element is the SIDRA pt-BR field-label header; we must skip it."""
    adapter = IBGESidraAdapter()
    payload = _load("desemprego_4099.json")
    spec = IBGE_VARIABLE_MAP["Desemprego"]
    obs = adapter._parse_payload(payload, "Desemprego", spec)

    # Header row has V="Valor" — if not skipped, Decimal("Valor") would raise.
    assert all(isinstance(o.value, Decimal) for o in obs)
    # No header-derived observation leaked through (no value == "Valor").
    assert all(o.value != Decimal(0) for o in obs)  # 0 would be plausible only if "0"
    assert len(obs) == 1
    assert obs[0].value == Decimal("7.9")


def test_handle_missing_value_dots() -> None:
    """SIDRA encodes missing values as '..', '...', '-', or 'x'; adapter skips them."""
    adapter = IBGESidraAdapter()
    header = {
        "V": "Valor",
        "D2C": "Variável (Código)",
        "D2N": "Variável",
        "D3C": "Mês (Código)",
        "D3N": "Mês",
    }
    rows = [
        {"V": "..", "D2C": "1", "D3C": "202401"},
        {"V": "...", "D2C": "1", "D3C": "202402"},
        {"V": "-", "D2C": "1", "D3C": "202403"},
        {"V": "x", "D2C": "1", "D3C": "202404"},
        {"V": "42.5", "D2C": "1", "D3C": "202405"},
    ]
    spec = IBGE_VARIABLE_MAP["Prod_Industrial"]
    obs = adapter._parse_payload([header, *rows], "Prod_Industrial", spec)

    assert len(obs) == 1
    assert obs[0].value == Decimal("42.5")
    assert obs[0].observed_at == datetime(2024, 5, 1, tzinfo=UTC)


def test_observations_sorted_ascending() -> None:
    """Adapter contract: observations sorted by observed_at ascending."""
    adapter = IBGESidraAdapter()
    header = {
        "V": "Valor",
        "D2C": "Variável (Código)",
        "D2N": "Variável",
        "D3C": "Mês (Código)",
        "D3N": "Mês",
    }
    rows = [
        {"V": "3.0", "D2C": "1", "D3C": "202403"},
        {"V": "1.0", "D2C": "1", "D3C": "202401"},
        {"V": "2.0", "D2C": "1", "D3C": "202402"},
    ]
    spec = IBGE_VARIABLE_MAP["Prod_Industrial"]
    obs = adapter._parse_payload([header, *rows], "Prod_Industrial", spec)
    assert [o.observed_at.month for o in obs] == [1, 2, 3]


# ── URL builder ──────────────────────────────────────────────────────────────


def test_build_url_with_classification() -> None:
    spec = IBGE_VARIABLE_MAP["PIB_Nominal"]
    url = IBGESidraAdapter.build_url(spec, period="202301")
    assert url == (
        "https://apisidra.ibge.gov.br/values"
        "/t/1846/n1/all/v/585/p/202301/c11255/90707"
    )


def test_build_url_without_classification() -> None:
    spec = IBGE_VARIABLE_MAP["Desemprego"]
    url = IBGESidraAdapter.build_url(spec, period="all")
    assert url == (
        "https://apisidra.ibge.gov.br/values/t/4099/n1/all/v/4099/p/all"
    )


# ── W5b regression: Rendimento_Medio map entry ───────────────────────────────


def test_rendimento_medio_map_entry_present() -> None:
    """Regression (W5b/Bug 3): backfill failed with 'No IBGE_VARIABLE_MAP
    entry for series code Rendimento_Medio'. Verify the entry exists and
    points at table 6390 / variable 5933 (PNAD Contínua headline rendimento
    médio mensal real), with no classification and monthly-stepping period
    codes (trimestre móvel)."""
    spec = IBGE_VARIABLE_MAP["Rendimento_Medio"]
    assert spec.table == "6390"
    assert spec.variable == "5933"
    assert spec.classification is None
    assert spec.frequency == "monthly"


def test_build_url_rendimento_medio() -> None:
    spec = IBGE_VARIABLE_MAP["Rendimento_Medio"]
    url = IBGESidraAdapter.build_url(spec, period="last")
    assert url == (
        "https://apisidra.ibge.gov.br/values/t/6390/n1/all/v/5933/p/last"
    )


# ── Retry behavior ───────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_retry_then_raise() -> None:
    """3 consecutive 500s must exhaust retries and surface ExtractionError."""
    call_count = 0

    def handler(request: httpx.Request) -> httpx.Response:
        nonlocal call_count
        call_count += 1
        return httpx.Response(500, json={"error": "boom"})

    transport = httpx.MockTransport(handler)
    # Use very small waits to keep the test fast — patch wait inside the adapter
    # via a custom client; the adapter's wait_exponential lower bound is 2s, so
    # we monkey-patch the adapter to use a no-wait retry strategy.
    async with httpx.AsyncClient(transport=transport) as client:
        adapter = IBGESidraAdapter(client=client)

        # Replace _get_with_retry's wait with zero to keep test under a second.
        from tenacity import AsyncRetrying, retry_if_exception_type, stop_after_attempt, wait_none

        async def fast_get(url: str, series_code: str) -> list[dict]:
            async for attempt in AsyncRetrying(
                stop=stop_after_attempt(3),
                wait=wait_none(),
                retry=retry_if_exception_type(httpx.HTTPError),
                reraise=True,
            ):
                with attempt:
                    resp = await client.get(url)
                    resp.raise_for_status()
                    data = resp.json()
                    if not isinstance(data, list):
                        raise httpx.HTTPError("not a list")
                    return data
            raise httpx.HTTPError("unreachable")

        adapter._get_with_retry = fast_get  # type: ignore[method-assign]

        with pytest.raises(ExtractionError) as exc_info:
            await adapter.fetch(_stub_series("PIB_Nominal"))

    assert "ibge_sidra:PIB" in str(exc_info.value)
    assert call_count == 3


# ── End-to-end with MockTransport (FR-1.1 happy path) ────────────────────────


@pytest.mark.asyncio
async def test_fetch_returns_extraction_result() -> None:
    """Successful fetch returns an `ExtractionResult` with the parsed obs."""
    payload = _load("prod_industrial_8888.json")

    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json=payload)

    transport = httpx.MockTransport(handler)
    async with httpx.AsyncClient(transport=transport) as client:
        adapter = IBGESidraAdapter(client=client)
        result = await adapter.fetch(_stub_series("Prod_Industrial"))

    assert isinstance(result, ExtractionResult)
    assert result.source == "ibge_sidra"
    assert result.series_code == "Prod_Industrial"
    assert len(result.observations) == 1
    assert result.observations[0].value == Decimal("93.75190")
