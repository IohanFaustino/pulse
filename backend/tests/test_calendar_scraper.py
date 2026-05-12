"""Tests for Phase 6 calendar scraper (IBGE + BCB + hardcoded fallback).

Maps spec acceptance:
- FR-6.6 (scrape with fallback) → ``test_service_falls_back_when_scraper_raises``
- FR-6.7 (daily excluded)        → ``test_daily_series_excluded`` + service filter
- ADR-0008 source_type tagging   → ``test_service_tags_source_type``
"""

from __future__ import annotations

import datetime
import json
from pathlib import Path

import pytest

from api_extractor.calendar_scraper import (
    BCBCalendarScraper,
    CalendarScrapeError,
    CalendarService,
    HardcodedCalendar,
    IBGECalendarScraper,
    ReleaseRecord,
)
from api_extractor.calendar_scraper._mapping import (
    DAILY_SERIES_CODES,
    lookup_bcb,
    lookup_ibge,
    normalize_name,
)
from api_extractor.calendar_scraper.base import (
    SOURCE_TYPE_HARDCODED,
    SOURCE_TYPE_SCRAPED,
    CalendarSource,
)

FIXTURES = Path(__file__).parent / "fixtures" / "calendar"
IBGE_FIXTURE = FIXTURES / "ibge.html"
BCB_SAMPLE_FIXTURE = FIXTURES / "bcb_sample.html"
CALENDAR_JSON = Path(__file__).parents[1] / "data" / "calendar.json"


# ── Parser tests ──────────────────────────────────────────────────────────────


def test_ibge_parse_fixture() -> None:
    html = IBGE_FIXTURE.read_text(encoding="utf-8")
    records = IBGECalendarScraper.parse(html)

    assert len(records) > 0, "expected non-empty parse from IBGE fixture"
    assert all(isinstance(r, ReleaseRecord) for r in records)
    assert all(r.source_type == SOURCE_TYPE_SCRAPED for r in records)
    # Spot-check: IPCA should appear (12/05/2026 in captured fixture).
    ipca = [r for r in records if r.series_code == "IPCA"]
    assert ipca, "IPCA not found in IBGE fixture parse"
    assert any(r.scheduled_for == datetime.date(2026, 5, 12) for r in ipca)


def test_bcb_parse_fixture() -> None:
    html = BCB_SAMPLE_FIXTURE.read_text(encoding="utf-8")
    records = BCBCalendarScraper.parse(html)

    assert len(records) > 0, "expected non-empty parse from BCB sample fixture"
    series_codes = {r.series_code for r in records}
    # Setor Externo expands to 3 series; Fiscais to 2; Monetárias to IBC-Br.
    assert "IBC-Br" in series_codes
    assert "Balanca_Comercial" in series_codes
    assert "Resultado_Primario" in series_codes
    assert all(r.source_type == SOURCE_TYPE_SCRAPED for r in records)


def test_hardcoded_load() -> None:
    source = HardcodedCalendar(path=CALENDAR_JSON)
    import asyncio

    records = asyncio.run(source.fetch_releases())
    assert len(records) > 0
    assert all(r.source_type == SOURCE_TYPE_HARDCODED for r in records)


def test_daily_series_excluded(tmp_path: Path) -> None:
    """FR-6.7: hardcoded calendar must not contain daily series."""
    # Real seed file: validate by parsing.
    raw = json.loads(CALENDAR_JSON.read_text(encoding="utf-8"))
    leaked = [e for e in raw if e["series_code"] in DAILY_SERIES_CODES]
    assert leaked == [], f"daily series leaked into calendar.json: {leaked}"

    # Bad input: hardcoded loader must reject daily series too.
    bad_path = tmp_path / "bad.json"
    bad_path.write_text(
        json.dumps([{"series_code": "SELIC", "scheduled_for": "2026-05-12"}]),
        encoding="utf-8",
    )
    import asyncio

    with pytest.raises(CalendarScrapeError, match="FR-6.7"):
        asyncio.run(HardcodedCalendar(path=bad_path).fetch_releases())


# ── Name normalization ───────────────────────────────────────────────────────


def test_indicator_name_normalization() -> None:
    assert normalize_name("Índice  Nacional de Preços") == "indice nacional de precos"
    assert lookup_ibge("Índice Nacional de Preços ao Consumidor Amplo") == ["IPCA"]
    # Accent-insensitive:
    assert lookup_ibge("INDICE NACIONAL DE PRECOS AO CONSUMIDOR AMPLO") == ["IPCA"]
    # Unmapped → empty list, no raise.
    assert lookup_ibge("Some Random Page") == []
    # BCB 1:N expansion.
    bcb_codes = lookup_bcb("Estatísticas do Setor Externo")
    assert set(bcb_codes) == {"Balanca_Comercial", "Reservas_Internacionais", "Conta_Corrente"}


# ── Service orchestration ────────────────────────────────────────────────────


class _StubScraper(CalendarSource):
    """Test double — returns canned records or raises on demand."""

    def __init__(
        self,
        name: str,
        records: list[ReleaseRecord] | None = None,
        raises: bool = False,
    ) -> None:
        self.name = name
        self._records = records or []
        self._raises = raises

    async def fetch_releases(self) -> list[ReleaseRecord]:
        if self._raises:
            raise CalendarScrapeError(self.name, "stub failure")
        return list(self._records)


@pytest.mark.asyncio
async def test_service_falls_back_when_scraper_raises() -> None:
    """FR-6.6: scrape failure must NOT empty the calendar; hardcoded fills in."""
    hardcoded_records = [
        ReleaseRecord("IPCA", datetime.date(2026, 6, 10), SOURCE_TYPE_HARDCODED),
        ReleaseRecord("PIB", datetime.date(2026, 8, 28), SOURCE_TYPE_HARDCODED),
    ]
    service = CalendarService(
        ibge=_StubScraper("ibge", raises=True),
        bcb=_StubScraper("bcb", raises=True),
        hardcoded=_StubScraper("hardcoded", records=hardcoded_records),
    )
    records, report = await service.collect()
    assert {r.series_code for r in records} == {"IPCA", "PIB"}
    assert all(r.source_type == SOURCE_TYPE_HARDCODED for r in records)
    assert "ibge" in report.errors
    assert "bcb" in report.errors


@pytest.mark.asyncio
async def test_service_tags_source_type() -> None:
    """Scraped records keep ``scraped`` tag; hardcoded keep ``hardcoded``.

    When both sources emit the same (series_code, scheduled_for) pair,
    scraped wins over hardcoded.
    """
    same_date = datetime.date(2026, 6, 10)
    hardcoded_records = [
        ReleaseRecord("IPCA", same_date, SOURCE_TYPE_HARDCODED),
        ReleaseRecord("PIB", datetime.date(2026, 8, 28), SOURCE_TYPE_HARDCODED),
    ]
    scraped_records = [
        ReleaseRecord("IPCA", same_date, SOURCE_TYPE_SCRAPED),
    ]
    service = CalendarService(
        ibge=_StubScraper("ibge", records=scraped_records),
        bcb=_StubScraper("bcb", records=[]),
        hardcoded=_StubScraper("hardcoded", records=hardcoded_records),
    )
    records, _report = await service.collect()
    ipca = next(r for r in records if r.series_code == "IPCA")
    pib = next(r for r in records if r.series_code == "PIB")
    assert ipca.source_type == SOURCE_TYPE_SCRAPED
    assert pib.source_type == SOURCE_TYPE_HARDCODED


@pytest.mark.asyncio
async def test_service_filters_daily_series() -> None:
    """Even if a scraper leaks a daily series, the service strips it."""
    leaked = [
        ReleaseRecord("IPCA", datetime.date(2026, 6, 10), SOURCE_TYPE_SCRAPED),
        # Manually construct a daily-series record — bypass ReleaseRecord
        # validation by going through a non-validating path: scraper emits it.
        ReleaseRecord("SELIC", datetime.date(2026, 6, 10), SOURCE_TYPE_SCRAPED),
    ]
    service = CalendarService(
        ibge=_StubScraper("ibge", records=leaked),
        bcb=_StubScraper("bcb", records=[]),
        hardcoded=_StubScraper("hardcoded", records=[]),
    )
    records, report = await service.collect()
    codes = {r.series_code for r in records}
    assert "SELIC" not in codes
    assert "IPCA" in codes
    assert report.skipped_daily == 1


# ── DB integration: tags source_type on upsert ───────────────────────────────


@pytest.mark.asyncio
async def test_service_refresh_persists_with_source_type(session, series_repo) -> None:  # type: ignore[no-untyped-def]
    """End-to-end: refresh_all writes rows tagged with the right source_type."""
    # Ensure the FK target exists.
    await series_repo.upsert(
        {
            "code": "IPCA",
            "name": "IPCA",
            "category": "Inflação",
            "source": "BCB SGS",
            "source_id": "433",
            "frequency": "monthly",
            "unit": "% a.m.",
        }
    )
    await session.commit()

    target_date = datetime.date(2026, 6, 10)
    service = CalendarService(
        ibge=_StubScraper(
            "ibge",
            records=[ReleaseRecord("IPCA", target_date, SOURCE_TYPE_SCRAPED)],
        ),
        bcb=_StubScraper("bcb", raises=True),
        hardcoded=_StubScraper("hardcoded", records=[]),
    )
    report = await service.refresh_all(session)
    await session.commit()

    assert report.upserted == 1
    assert report.scraped_count == 1
    assert "bcb" in report.errors

    from api_extractor.repos.release_repo import ReleaseRepo

    repo = ReleaseRepo(session)
    rows = await repo.list_by_series("IPCA")
    matches = [r for r in rows if r.scheduled_for == target_date]
    assert matches, "release row not written"
    assert matches[0].source_type == SOURCE_TYPE_SCRAPED

    # Cleanup: remove only the test-injected release for the synthetic future
    # date. Do NOT delete the IPCA series row — that cascades to observations
    # and breaks later acceptance tests (AC-1 full backfill coverage).
    from sqlalchemy import delete

    from api_extractor.models.release import Release

    await session.execute(
        delete(Release)
        .where(Release.series_code == "IPCA")
        .where(Release.scheduled_for == target_date)
    )
    await session.commit()
