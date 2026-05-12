"""Tests for the seed CLI and series.seed.json data quality.

Maps to:
- PLAN §6 Phase 1: Seed 25 series (25 rows in series table)
- PLAN §8: The 25 series table — each code must exist
"""

import json
import os

import pytest
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from api_extractor.models.series import Series
from api_extractor.seed import _parse_seed_row, _resolve_data_file, seed

_SEED_FILE = _resolve_data_file()
_DB_URL = os.environ.get(
    "DATABASE_URL",
    "postgresql+asyncpg://postgres:postgres@postgres:5432/api_extractor",
)


async def _count_series() -> int:
    engine = create_async_engine(_DB_URL, echo=False)
    factory = async_sessionmaker(bind=engine, class_=AsyncSession, expire_on_commit=False)
    async with factory() as s:
        result = await s.execute(select(func.count()).select_from(Series))
        count = result.scalar_one()
    await engine.dispose()
    return count


async def _get_codes() -> set[str]:
    engine = create_async_engine(_DB_URL, echo=False)
    factory = async_sessionmaker(bind=engine, class_=AsyncSession, expire_on_commit=False)
    async with factory() as s:
        result = await s.execute(select(Series.code))
        codes = {row[0] for row in result.fetchall()}
    await engine.dispose()
    return codes


async def _get_series(code: str) -> Series | None:
    engine = create_async_engine(_DB_URL, echo=False)
    factory = async_sessionmaker(bind=engine, class_=AsyncSession, expire_on_commit=False)
    async with factory() as s:
        result = await s.execute(select(Series).where(Series.code == code))
        series = result.scalar_one_or_none()
    await engine.dispose()
    return series


class TestSeedFileStructure:
    """Validate series.seed.json structure before testing DB insertion."""

    def test_seed_file_exists(self):
        """series.seed.json must be present and non-empty."""
        assert _SEED_FILE.exists(), f"Seed file not found at {_SEED_FILE}"
        assert _SEED_FILE.stat().st_size > 0

    def test_seed_file_has_72_entries(self):
        """Seed file must have exactly 72 series (50 + 21 ANBIMA + 1 PIB split)."""
        rows = json.loads(_SEED_FILE.read_text(encoding="utf-8"))
        assert len(rows) == 72, f"Expected 71 series, got {len(rows)}"

    def test_all_required_fields_present(self):
        """Every row must have all required non-null fields."""
        required_fields = {"code", "name", "category", "source", "source_id", "frequency", "unit"}
        rows = json.loads(_SEED_FILE.read_text(encoding="utf-8"))
        for row in rows:
            missing = required_fields - set(row.keys())
            assert not missing, f"Row {row.get('code', '?')} missing fields: {missing}"

    def test_all_codes_are_unique(self):
        """No duplicate codes in seed file."""
        rows = json.loads(_SEED_FILE.read_text(encoding="utf-8"))
        codes = [r["code"] for r in rows]
        assert len(codes) == len(set(codes)), f"Duplicate codes found: {codes}"

    def test_frequency_values_are_valid(self):
        """frequency field must be one of the allowed values."""
        valid_frequencies = {"daily", "monthly", "quarterly", "event"}
        rows = json.loads(_SEED_FILE.read_text(encoding="utf-8"))
        for row in rows:
            assert row["frequency"] in valid_frequencies, (
                f"Series {row['code']} has invalid frequency: {row['frequency']}"
            )

    def test_expected_codes_present(self):
        """All 50 codes (25 legacy + 25 Phase-20 Wave A) must appear in the seed file."""
        expected_codes = {
            # Legacy 25
            "IPCA", "IPCA-15", "IGP-M", "IGP-DI", "INPC",
            "SELIC", "SELIC_meta", "CDI", "TR",
            "PTAX_USD", "PTAX_EUR",
            "Ibovespa", "IFIX",
            "PIB_Nominal", "PIB_Real", "IBC-Br", "Prod_Industrial", "Vendas_Varejo",
            "Desemprego", "Rendimento_Medio", "CAGED",
            "Resultado_Primario", "Divida_Bruta",
            "Balanca_Comercial", "Reservas_Internacionais", "Conta_Corrente",
            # ANBIMA IMA — 9
            "IMA-Geral", "IMA-Geral_ex-C", "IMA-B", "IMA-B_5", "IMA-B_5plus",
            "IRF-M", "IRF-M_1", "IRF-M_1plus", "IMA-S",
            # B3 portal — 8
            "IBrX_50", "IBrX_100",
            "ISE_B3", "ICO2_B3",
            "IGC_B3", "IGCT_B3", "IGC_NM_B3", "ITAG_B3",
            # Intl Yahoo — 8
            "SP500", "DJIA", "Nasdaq_Composite", "Nasdaq_100",
            "MSCI_World", "MSCI_EM", "Euro_Stoxx_50", "SP500_ESG",
        }
        rows = json.loads(_SEED_FILE.read_text(encoding="utf-8"))
        actual_codes = {r["code"] for r in rows}
        missing = expected_codes - actual_codes
        assert not missing, f"Missing expected codes: {missing}"

    def test_new_categories_present(self):
        """Phase-20 Wave A must add Renda Fixa, Mercado Internacional, Sustentabilidade, Governança."""
        new_categories = {"Renda Fixa", "Mercado Internacional", "Sustentabilidade", "Governança"}
        rows = json.loads(_SEED_FILE.read_text(encoding="utf-8"))
        actual_categories = {r["category"] for r in rows}
        missing = new_categories - actual_categories
        assert not missing, f"New categories missing from seed: {missing}"

    def test_currency_field_on_new_entries(self):
        """All Phase-20 Wave A entries must carry a currency field."""
        new_codes = {
            "IMA-Geral", "IMA-Geral_ex-C", "IMA-B", "IMA-B_5", "IMA-B_5plus",
            "IRF-M", "IRF-M_1", "IRF-M_1plus", "IMA-S",
            "IBrX_50", "IBrX_100", "ISE_B3", "ICO2_B3",
            "IGC_B3", "IGCT_B3", "IGC_NM_B3", "ITAG_B3",
            "SP500", "DJIA", "Nasdaq_Composite", "Nasdaq_100",
            "MSCI_World", "MSCI_EM", "Euro_Stoxx_50", "SP500_ESG",
        }
        rows = json.loads(_SEED_FILE.read_text(encoding="utf-8"))
        for row in rows:
            if row["code"] in new_codes:
                assert "currency" in row, f"{row['code']} missing currency field"

    def test_proxy_flags_correct(self):
        """IFIX, MSCI_World, MSCI_EM must have is_proxy=true; others false."""
        proxy_codes = {"IFIX", "MSCI_World", "MSCI_EM"}
        rows = json.loads(_SEED_FILE.read_text(encoding="utf-8"))
        row_map = {r["code"]: r for r in rows}
        for code in proxy_codes:
            assert row_map[code].get("is_proxy") is True, f"{code} should have is_proxy=true"
        # Non-proxy new entries
        non_proxy_new = {
            "IMA-Geral", "IMA-B", "IRF-M", "IMA-S", "IBrX_50", "IBrX_100",
            "ISE_B3", "ICO2_B3", "IGC_B3", "SP500", "DJIA", "Euro_Stoxx_50",
        }
        for code in non_proxy_new:
            assert row_map[code].get("is_proxy") is False, f"{code} should have is_proxy=false"

    def test_intl_series_have_correct_currencies(self):
        """International series must carry their correct currency codes."""
        rows = json.loads(_SEED_FILE.read_text(encoding="utf-8"))
        row_map = {r["code"]: r for r in rows}
        usd_codes = {"SP500", "DJIA", "Nasdaq_Composite", "Nasdaq_100", "MSCI_World", "MSCI_EM", "SP500_ESG"}
        eur_codes = {"Euro_Stoxx_50"}
        for code in usd_codes:
            assert row_map[code]["currency"] == "USD", f"{code} currency should be USD"
        for code in eur_codes:
            assert row_map[code]["currency"] == "EUR", f"{code} currency should be EUR"

    def test_anbima_series_have_brl_currency(self):
        """All ANBIMA IMA series must have currency=BRL."""
        anbima_codes = {
            "IMA-Geral", "IMA-Geral_ex-C", "IMA-B", "IMA-B_5", "IMA-B_5plus",
            "IRF-M", "IRF-M_1", "IRF-M_1plus", "IMA-S",
        }
        rows = json.loads(_SEED_FILE.read_text(encoding="utf-8"))
        row_map = {r["code"]: r for r in rows}
        for code in anbima_codes:
            assert row_map[code]["currency"] == "BRL", f"{code} currency should be BRL"

    def test_parse_seed_row_converts_date(self):
        """_parse_seed_row() converts first_observation string to datetime.date."""
        import datetime

        raw = {
            "code": "X",
            "name": "Test",
            "category": "Test",
            "source": "BCB SGS",
            "source_id": "1",
            "frequency": "monthly",
            "unit": "%",
            "first_observation": "2020-01-01",
        }
        parsed = _parse_seed_row(raw)
        assert isinstance(parsed["first_observation"], datetime.date)
        assert parsed["first_observation"].year == 2020


class TestSeedDBInsertion:
    """Integration tests: run seed and verify DB state via independent connections."""

    async def test_seed_inserts_50_rows(self):
        """Running seed() produces at least 50 rows in the series table."""
        await seed(_SEED_FILE)
        total = await _count_series()
        assert total >= 50, f"Expected at least 50 series rows after seed, got {total}"

    async def test_seed_is_idempotent(self):
        """Running seed() twice does not create duplicate rows."""
        await seed(_SEED_FILE)
        first_count = await _count_series()

        await seed(_SEED_FILE)
        second_count = await _count_series()

        assert first_count == second_count, (
            f"Seed idempotency failed: before={first_count}, after={second_count}"
        )

    async def test_seed_ipca_data_correct(self):
        """After seed, IPCA row has expected source_id and category."""
        await seed(_SEED_FILE)
        ipca = await _get_series("IPCA")
        assert ipca is not None
        assert ipca.source_id == "433"
        assert ipca.category == "Inflação"
        assert ipca.source == "BCB SGS"
        assert ipca.frequency == "monthly"

    async def test_seed_all_codes_in_db(self):
        """After seed, all 51 macro expected codes exist in the series table."""
        await seed(_SEED_FILE)
        db_codes = await _get_codes()

        expected_codes = {
            # Legacy 25
            "IPCA", "IPCA-15", "IGP-M", "IGP-DI", "INPC",
            "SELIC", "SELIC_meta", "CDI", "TR",
            "PTAX_USD", "PTAX_EUR",
            "Ibovespa", "IFIX",
            "PIB_Nominal", "PIB_Real", "IBC-Br", "Prod_Industrial", "Vendas_Varejo",
            "Desemprego", "Rendimento_Medio", "CAGED",
            "Resultado_Primario", "Divida_Bruta",
            "Balanca_Comercial", "Reservas_Internacionais", "Conta_Corrente",
            # ANBIMA IMA — 9
            "IMA-Geral", "IMA-Geral_ex-C", "IMA-B", "IMA-B_5", "IMA-B_5plus",
            "IRF-M", "IRF-M_1", "IRF-M_1plus", "IMA-S",
            # B3 portal — 8
            "IBrX_50", "IBrX_100",
            "ISE_B3", "ICO2_B3",
            "IGC_B3", "IGCT_B3", "IGC_NM_B3", "ITAG_B3",
            # Intl Yahoo — 8
            "SP500", "DJIA", "Nasdaq_Composite", "Nasdaq_100",
            "MSCI_World", "MSCI_EM", "Euro_Stoxx_50", "SP500_ESG",
        }
        missing = expected_codes - db_codes
        assert not missing, f"Missing codes in DB after seed: {missing}"

    async def test_seed_ifix_is_proxy_true(self):
        """After seed, IFIX row must have is_proxy=True (proxy via XFIX11)."""
        await seed(_SEED_FILE)
        ifix = await _get_series("IFIX")
        assert ifix is not None
        assert ifix.is_proxy is True

    async def test_seed_sp500_currency_usd(self):
        """After seed, SP500 row must have currency='USD'."""
        await seed(_SEED_FILE)
        sp500 = await _get_series("SP500")
        assert sp500 is not None
        assert sp500.currency == "USD"

    async def test_seed_ima_geral_currency_brl(self):
        """After seed, IMA-Geral row must have currency='BRL'."""
        await seed(_SEED_FILE)
        ima = await _get_series("IMA-Geral")
        assert ima is not None
        assert ima.currency == "BRL"
        assert ima.is_proxy is False
        assert ima.source == "ANBIMA"

    async def test_seed_euro_stoxx_currency_eur(self):
        """After seed, Euro_Stoxx_50 row must have currency='EUR'."""
        await seed(_SEED_FILE)
        stoxx = await _get_series("Euro_Stoxx_50")
        assert stoxx is not None
        assert stoxx.currency == "EUR"

    async def test_seed_existing_series_get_brl_default(self):
        """After seed, IPCA (legacy) must have currency='BRL' and is_proxy=False."""
        await seed(_SEED_FILE)
        ipca = await _get_series("IPCA")
        assert ipca is not None
        assert ipca.currency == "BRL"
        assert ipca.is_proxy is False
