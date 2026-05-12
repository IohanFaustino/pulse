# Phase 6: Release Calendar Scraper (IBGE + BCB + Hardcoded fallback)

**Agent:** python-pro  **Wave:** W2  **Skills:** python-pro, karpathy-guidelines

---

## Scope

Build calendar scrapers for IBGE and BCB release calendars with a hardcoded
JSON fallback. Output: rows in the `releases` table tagged with
`source_type` = `scraped` | `hardcoded`. Daily series excluded per FR-6.7.

## Files owned

### Create

| Path | Purpose |
|---|---|
| `backend/src/api_extractor/calendar_scraper/__init__.py` | Package marker + public exports |
| `backend/src/api_extractor/calendar_scraper/base.py` | `CalendarSource` ABC + `ReleaseRecord` dataclass |
| `backend/src/api_extractor/calendar_scraper/ibge.py` | `IBGECalendarScraper(CalendarSource)` |
| `backend/src/api_extractor/calendar_scraper/bcb.py` | `BCBCalendarScraper(CalendarSource)` |
| `backend/src/api_extractor/calendar_scraper/hardcoded.py` | `HardcodedCalendar(CalendarSource)` |
| `backend/src/api_extractor/calendar_scraper/service.py` | `CalendarService.refresh_all()` orchestrator |
| `backend/data/calendar.json` | Hardcoded seed (12 months for 15 non-daily series) |
| `backend/tests/test_calendar_scraper.py` | Unit + fixture tests |
| `backend/tests/fixtures/calendar/ibge.html` | Captured IBGE calendar page |
| `backend/tests/fixtures/calendar/bcb.html` | Captured BCB calendar page |
| `docs/data-sources/calendar.md` | Source contract + indicator→series mapping table |

### Do NOT touch

- `extractors/*`, `transforms/*`, `routers/*`, `scheduler.py`
- frontend, `docker-compose.yml`
- existing `models/`, `repos/` (we consume `ReleaseRepo` only)

---

## Interfaces

### Consumed
- `repos.release_repo.ReleaseRepo.upsert(data)`
- `repos.series_repo.SeriesRepo` (read 25 series to map names)
- `models.release.Release`

### Produced
- `CalendarSource.fetch_releases() -> list[ReleaseRecord]` ABC
- `CalendarService.refresh_all(session) -> dict[str, int]` orchestrator entry
- `calendar_scraper.SOURCE_TYPES = {"scraped", "hardcoded"}`

---

## Architecture

```
CalendarService.refresh_all()
  ├─ try IBGECalendarScraper.fetch_releases() → tag source_type="scraped"
  │    on failure → fall back to relevant slice of hardcoded
  ├─ try BCBCalendarScraper.fetch_releases() → tag source_type="scraped"
  │    on failure → fall back
  └─ HardcodedCalendar always loaded → fills gaps for series not covered by scrapers
  → merge, dedupe by (series_code, scheduled_for), upsert via ReleaseRepo
```

Indicator-name → series.code normalization lives in `calendar_scraper/_mapping.py`
(or inline constant). Source pages name indicators like "IPCA", "PIB Trimestral",
"PNAD Contínua Mensal" — we map to our seed codes.

## Test strategy

| Test | What it proves |
|---|---|
| `test_ibge_parse_fixture` | Loaded HTML fixture → non-empty list of ReleaseRecord |
| `test_bcb_parse_fixture` | Loaded HTML fixture → non-empty list |
| `test_hardcoded_load` | `calendar.json` loads → list of ReleaseRecord |
| `test_indicator_name_normalization` | "IPCA" → series.code="IPCA"; "PIB" → "PIB" |
| `test_service_falls_back_when_scraper_raises` | IBGE scraper raises → hardcoded used |
| `test_service_tags_source_type` | Upserts include `source_type` per source |
| `test_daily_series_excluded` | calendar.json must contain no daily series |

## Acceptance criteria mapped

| Spec item | Test |
|---|---|
| FR-6.6 scrape with fallback | `test_service_falls_back_when_scraper_raises` |
| FR-6.7 daily excluded | `test_daily_series_excluded` |
| ADR-0008 source_type tagging | `test_service_tags_source_type` |

## Risks + mitigations

| Risk | Mitigation |
|---|---|
| Official pages change HTML | Parser defensive; fallback always available |
| Indicator names ambiguous | Explicit mapping table; unmapped → log WARN + skip |
| Date format pt-BR (dd/mm/yyyy) | Defensive parser; reject ambiguous |
| BeautifulSoup not in deps | Add `beautifulsoup4` + `lxml` to runtime deps |
| Network flakiness | `tenacity` 1x retry, 15s timeout (pages are static) |

## Background services

- postgres, redis already running. No new services.

## Deps to add

- `beautifulsoup4==4.12.3`
- `lxml==5.3.0`

---

## 5-line summary

1. Three `CalendarSource` implementations: IBGE HTML scraper, BCB HTML scraper, hardcoded JSON.
2. `CalendarService` orchestrates: try scrape, fall back to hardcoded slice on failure.
3. All upserts tagged with `source_type` ('scraped'|'hardcoded') for UI confidence.
4. Daily series (SELIC/CDI/TR/PTAX/Ibov/IFIX) excluded — calendar.json validates.
5. Indicator-name → series.code mapping in `_mapping.py`; ambiguities logged.
