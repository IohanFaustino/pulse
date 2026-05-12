# Phase 2: B3 / Yahoo Finance Adapter

**Agent:** python-pro  **Wave:** W2  **Skills:** python-pro, karpathy-guidelines, monitoring-expert

---

## Scope

Implement `B3YahooAdapter` for fetching index quotations from Yahoo Finance
(unofficial `yfinance` library). Covers 2/25 seed series:

- `Ibovespa` (source_id `^BVSP`)
- `IFIX` (source_id TBD — resolved live during research substep)

## Files owned

### Create (new files)

| Path | Purpose |
|---|---|
| `backend/src/api_extractor/extractors/b3_yahoo.py` | `B3YahooAdapter(SourceAdapter)` |
| `backend/tests/test_extractor_b3_yahoo.py` | Unit + contract tests using fixtures |
| `backend/tests/fixtures/b3_yahoo/bvsp_30d.json` | Real BVSP last-30-days payload (records) |
| `backend/tests/fixtures/b3_yahoo/ifix_30d.json` | Real IFIX last-30-days payload (records) |
| `docs/data-sources/b3-yahoo.md` | Source contract + ticker resolution + per-series sample |

### Do NOT touch

- `backend/src/api_extractor/extractors/base.py`
- `backend/src/api_extractor/extractors/bcb_sgs.py` (parallel agent)
- `backend/src/api_extractor/extractors/ibge_sidra.py` (parallel agent)
- `backend/src/api_extractor/transforms/`, `calendar_scraper/`
- any frontend file, `docker-compose.yml`

---

## Interfaces

### Consumed (from Phase 1)
- `extractors.base.SourceAdapter`
- `extractors.base.FetchedObservation`
- `extractors.base.ExtractionResult`
- `extractors.base.ExtractionError`
- `models.series.Series`

### Produced

| Interface | Consumer | Description |
|---|---|---|
| `B3YahooAdapter()` | Phase 3 scheduler / admin endpoint | `await adapter.fetch(series, since)` |
| `b3_yahoo.SOURCE_NAME = "b3_yahoo"` | source-routing | string constant |

---

## Test strategy

| Test | What it proves |
|---|---|
| `test_parse_fixture_bvsp` | Real payload parses to ≥1 observations w/ Decimal Close |
| `test_close_field_used_not_open` | Adapter takes `Close`, not `Open` / `High` |
| `test_date_normalized_utc_midnight` | Pandas index → UTC 00:00 trading-day datetime |
| `test_returns_obs_sorted_ascending` | Output sorted by `observed_at` |
| `test_retry_then_raise` | 3 yfinance failures → `ExtractionError` |
| `test_empty_response` | Empty DataFrame → empty observations, no error |
| `test_ifix_ticker_resolution` | Chosen IFIX ticker yields non-empty result (live smoke, opt-in) |

Mock yfinance: `unittest.mock.patch("api_extractor.extractors.b3_yahoo.yf.Ticker")`
returning a `MagicMock` whose `.history()` returns a DataFrame built from the JSON fixture.

## Acceptance criteria mapped

| Spec item | Test |
|---|---|
| FR-1.1 fetch new observations | `test_parse_fixture_bvsp`, `test_returns_obs_sorted_ascending` |
| FR-1.3 retry 3x exp backoff | `test_retry_then_raise` |
| FR-1.4 raise on final failure | `test_retry_then_raise` |

## Risks + mitigations

| Risk | Mitigation |
|---|---|
| yfinance unofficial API can break | Pin version 0.2.50; tenacity wrap; capture fixtures |
| yfinance is sync — would block event loop | `asyncio.to_thread()` wrap |
| IFIX ticker unavailable on Yahoo | Research substep tests candidates; documented fallback if all fail |
| Float precision from pandas Close column | Convert via `Decimal(str(value))` never `Decimal(float)` |
| Timezone: Yahoo returns America/Sao_Paulo / naive | Convert to UTC, anchor to 00:00 of trading day |

## Background services

- `postgres`, `redis`, `api` running from W0+W1. No new services.

## Deps

`yfinance==0.2.50`, `tenacity==9.0.0`, `loguru==0.7.3`, `pandas==2.2.3` already pinned.

---

## 5-line summary

1. Adapter wraps `yfinance.Ticker(symbol).history()` for daily index closes.
2. Blocking yfinance call wrapped in `asyncio.to_thread` for async safety.
3. Tenacity retries 3x exponential, raises `ExtractionError` on final failure.
4. Close → `Decimal(str(...))`; date index → UTC 00:00 of trading day.
5. Owns 5 files; touches no shared module — safe for W2 parallel execution.
