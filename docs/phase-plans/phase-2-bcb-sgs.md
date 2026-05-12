# Phase 2: BCB SGS Adapter

**Agent:** python-pro  **Wave:** W2  **Skills:** python-pro, karpathy-guidelines, monitoring-expert

---

## Scope

Implement `BCBSGSAdapter` for fetching observations from Banco Central do Brasil's
SGS API (Sistema Gerenciador de Séries Temporais). Covers 16/25 seed series.

## Files owned

### Create (new files)

| Path | Purpose |
|---|---|
| `backend/src/api_extractor/extractors/bcb_sgs.py` | `BCBSGSAdapter(SourceAdapter)` |
| `backend/tests/test_extractor_bcb.py` | Unit + contract tests using fixtures |
| `backend/tests/fixtures/bcb_sgs/ipca_433.json` | Real IPCA payload (recent ~100 obs) |
| `backend/tests/fixtures/bcb_sgs/selic_432.json` | Real SELIC payload |
| `backend/tests/fixtures/bcb_sgs/ptax_1.json` | Real PTAX USD payload |
| `docs/data-sources/bcb-sgs.md` | Source contract + per-series curl |

### Do NOT touch

- `backend/src/api_extractor/extractors/base.py`
- `backend/src/api_extractor/extractors/ibge_sidra.py` (parallel agent)
- `backend/src/api_extractor/extractors/b3_yahoo.py` (parallel agent)
- `backend/src/api_extractor/transforms/`, `calendar_scraper/`
- any frontend file, `docker-compose.yml`

---

## Interfaces

### Consumed (from Phase 1)
- `extractors.base.SourceAdapter` — abstract base class
- `extractors.base.FetchedObservation` — return type element
- `extractors.base.ExtractionResult` — return type
- `extractors.base.ExtractionError` — final-failure exception
- `models.series.Series` — input arg

### Produced (consumed by Phase 3 scheduler + Phase 5 admin endpoint)

| Interface | Consumer | Description |
|---|---|---|
| `BCBSGSAdapter()` instance | Phase 3 scheduler / `/admin/extract/{code}` | `await adapter.fetch(series, since)` |
| `bcb_sgs.SOURCE_NAME = "bcb_sgs"` | source-routing logic | string constant |

---

## Test strategy

| Test | What it proves |
|---|---|
| `test_parse_fixture_ipca` | Real payload parses to N observations w/ Decimal values |
| `test_parse_value_comma_decimal` | `"12,34"` → `Decimal("12.34")` |
| `test_parse_date_format` | `"01/01/2024"` → `datetime(2024,1,1,tzinfo=UTC)` |
| `test_fetch_returns_obs_sorted_ascending` | Output sorted by `observed_at` |
| `test_retry_then_raise` | 3x 500 → `ExtractionError`; verifies tenacity backoff path |
| `test_empty_response` | 200 `[]` → empty result, no error |
| `test_since_filter_sent_as_param` | `dataInicial` in URL when `since` given |
| `test_handles_null_value` | `valor: null` row is skipped |

Mock via `httpx.MockTransport` (no `respx` dep). Fixtures = captured real payloads.

## Acceptance criteria mapped

| Spec item | Test |
|---|---|
| FR-1.1 fetch new observations from source | `test_parse_fixture_ipca`, `test_fetch_returns_obs_sorted_ascending` |
| FR-1.3 retry 3x exp backoff | `test_retry_then_raise` |
| FR-1.4 raise on final failure | `test_retry_then_raise` |
| NFR-2 structured logs | `loguru` calls (visual verification) |

## Risks + mitigations

| Risk | Mitigation |
|---|---|
| BCB API rate limits agents under load | tenacity exp backoff handles transient 429/503; client timeout 30s |
| Value field comma decimal locale → float precision | Parse string→Decimal directly, never via float |
| Monthly series anchor on last day of month upstream | Caller (orchestrator) normalizes later if needed; we preserve upstream date |
| `valor: null` for holidays / missing | Skip those rows defensively |
| Date too far back rejected (some series start later) | Adapter sends `dataInicial` only when `since` given; full history when None |

## Background services

- `postgres`, `redis`, `api` already running from W0+W1. No new services.

## Deps

`httpx==0.28.1` + `tenacity==9.0.0` + `loguru==0.7.3` already pinned in
`pyproject.toml`. No additions needed. `respx` not required (using
`httpx.MockTransport`).

---

## 5-line summary

1. Adapter implements `SourceAdapter` for BCB SGS bcdata REST endpoint.
2. Parses pt-BR formats (`DD/MM/YYYY`, comma decimals) into UTC datetime + Decimal.
3. Tenacity retries 3x exponential, raises `ExtractionError` on final failure.
4. Live fixtures captured during research substep guarantee parser matches reality.
5. Owns 6 files; touches no shared module — safe for W2 parallel execution.
