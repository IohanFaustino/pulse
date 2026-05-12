# Phase 20 — Wave B-2: B3 Portal Adapter

**Status:** in progress (2026-05-11)
**Scope:** Implement `B3PortalAdapter` covering 8 B3 indexes seeded with
`source="B3"`: IBrX_50, IBrX_100, ISE_B3, ICO2_B3, IGC_B3, IGCT_B3, IGC_NM_B3,
ITAG_B3 (source_id codes IBXL, IBXX, ISEE, ICO2, IGCX, IGCT, IGNM, ITAG).

Out of scope: Yahoo-sourced Ibovespa/IFIX (already covered by `B3YahooAdapter`,
mapped under `"Yahoo Finance"`). The existing `"b3"` registry alias is repointed
from `B3YahooAdapter` to the new `B3PortalAdapter` because seed `source="B3"`
now means portal, not Yahoo.

## Endpoint

`GET https://sistemaswebb3-listados.b3.com.br/indexStatisticsProxy/IndexCall/GetPortfolioDay/{base64}`

Payload (base64-encoded JSON, year-matrix variant validated by captured fixtures):

```json
{"language": "pt-br", "index": "<CODE>", "year": "<YYYY>"}
```

Response is a 31-row × 12-column day-of-month × month matrix with pt-BR formatted
numeric strings (`"131.147,29"`) and `null` cells.

Note: the original Wave B-2 brief mentioned a `monthYear` payload variant
(`MM/YYYY`, `pageNumber`/`pageSize`). All four captured fixtures use the `year`
variant. We implement against the captured/validated payload; the matrix already
returns a year at a time, so monthly iteration would be wasteful.

## File ownership

CREATE:
- `backend/src/api_extractor/extractors/b3_portal.py`
- `backend/tests/test_extractor_b3_portal.py`
- this plan

EDIT:
- `backend/src/api_extractor/extractors/registry.py` — repoint `"b3"` slug
  to the new portal adapter, add `B3PortalAdapter` instance.

APPEND-ONLY:
- `docs/data-sources/b3-indexes.md` — implementation-notes section.

DO NOT TOUCH: other extractors (incl. `b3_yahoo.py`), `series.seed.json`,
migrations, frontend, docker-compose.

## Approach

1. Pure parser `_parse_year_matrix(year, results) -> list[FetchedObservation]`
   that:
   - skips `day == 0` envelope rows (min/max)
   - iterates `rateValue1..rateValue12`
   - skips nulls
   - guards `ValueError` from `date(year, m, d)` (Feb 30, Apr 31, etc.)
   - parses pt-BR (`"131.147,29"` → `Decimal("131147.29")`)
   - anchors `datetime(year, m, d, tzinfo=UTC)`
2. Async `fetch` loop over years from `max(since, first_observation).year` to
   `today.year`, inclusive.
3. `httpx.AsyncClient` with `User-Agent: Mozilla/5.0` (B3 returns 403 to default
   Python UA), tenacity 3× exponential backoff (2s/8s/30s) on transport + 5xx +
   429.
4. Polite `0.5s` sleep between successive year requests.
5. Filter out observations before `since` if provided.
6. Sort ascending; dedupe defensively (same date should never repeat under the
   year scheme, but cheap to guard).

## Test plan

`backend/tests/test_extractor_b3_portal.py` uses `httpx.MockTransport` (no
network) and the `isee_b3portal_2025.json` fixture:

- `test_parse_pt_br_decimal` — `"131.147,29"` → `Decimal("131147.29")`
- `test_base64_param_construction` — payload encodes/decodes round-trip
- `test_invalid_dates_skipped` — synthetic row with Feb 30 → no observation
- `test_null_cells_skipped` — synthetic row with all-null → empty
- `test_parse_fixture_isee` — count of non-null cells matches observation count
- `test_iterate_months_until_today` (renamed: years) — adapter requests one URL
  per year in `[since.year, today.year]`
- `test_retry_then_raise` — handler raises `httpx.ConnectError` 3× →
  `ExtractionError`

## Live smoke

`POST /admin/extract/ISE_B3?since=2026-04-01` (or equivalent CLI), expect ≥ 10
non-null observations between 2026-04-01 and today (2026-05-11 = ~27 trading
days, several nulls expected).

## Risks / open

- B3 portal occasionally rate-limits; 0.5s sleep + retry covers normal load.
- TLS chain reportedly unreliable from some CI environments; we keep
  `verify=True` (httpx default) and let the existing platform CA bundle handle
  it. If observed in live smoke we can revisit.
- The brief's `monthYear` variant remains a possible future code path if B3
  deprecates `year`; the parser is shaped so a sibling fetch can call it with
  a single-month matrix.
