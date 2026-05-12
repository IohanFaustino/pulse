# Phase 2 (W2) — IBGE SIDRA Adapter

## Scope
Implement `IBGESidraAdapter` for the 5 IBGE-sourced series in `series.seed.json`:

| code | table_id (seed) | frequency | unit |
|---|---|---|---|
| PIB | 1846 | quarterly | % t/t-1 |
| Prod_Industrial | 3653 | monthly | índice |
| Vendas_Varejo | 8881 | monthly | índice |
| Desemprego | 4099 | monthly | % |
| Massa_Salarial | 6390 | monthly | R$ bi |

## File ownership (only these)
- **CREATE** `backend/src/api_extractor/extractors/ibge_sidra.py`
- **CREATE** `backend/tests/test_extractor_ibge.py`
- **CREATE** `backend/tests/fixtures/ibge_sidra/*.json`
- **CREATE** `docs/data-sources/ibge-sidra.md`

Do not touch: `base.py`, `bcb_sgs.py`, `b3_yahoo.py`, `transforms/`, `calendar_scraper/`, `frontend/`, `docker-compose.yml`.

## Design

### URL pattern
Base: `https://apisidra.ibge.gov.br/values`

Template: `/t/{table}/n1/all/v/{variable}/p/{period}[/c{class}/{cat}]`

Where:
- `t` = tabela
- `n1/all` = nível territorial Brasil (código 1)
- `v` = código da variável
- `p` = período (YYYYMM mensal, YYYYQQ ou YYYYTT trimestral; `all` permitido)
- `c{class}/{cat}` = classificação opcional

### Response
JSON array of objects. First element = metadata header (field names in pt-BR like "Valor", "Mês", "Trimestre"). Subsequent elements = data rows where keys are column codes ("D1C","D2N","V","MN","MC",…).

Key fields:
- `V` = numeric value as string (pt-BR locale dot decimal in API)
- `D2C` / `D3C` = period code ("YYYYMM" or "YYYYQQ")
- `"..."` = missing / not yet released
- `"-"` = not applicable

### Adapter behavior
1. Build URL from `series.source_id` (= table) + per-code variable + period range from `since`.
2. Async GET with `httpx.AsyncClient(timeout=30)`, tenacity 3x exp backoff (2/8/30s).
3. Skip first row (metadata header).
4. Parse each row: `V` → `Decimal` (skip "..." / "-"); period code → datetime UTC anchored to first day of period.
5. Return `ExtractionResult` sorted ascending by `observed_at`.
6. Final failure → `ExtractionError("ibge_sidra", code, msg)`.

### Period anchoring
- Monthly "YYYYMM" → `datetime(YYYY, MM, 1, tzinfo=UTC)`.
- Quarterly "YYYYQQ" where QQ in {01,02,03,04} → first day of `[Jan, Apr, Jul, Oct]`.

### Variable mapping (per code)
Selected after research; pinned at module level in `IBGE_VARIABLE_MAP`. See `docs/data-sources/ibge-sidra.md`.

## Tests
- `test_parse_fixture_pib` — quarterly anchor (Q1→Jan-01, Q2→Apr-01…)
- `test_parse_fixture_prod_industrial` — monthly anchor
- `test_skip_metadata_header_row`
- `test_handle_missing_value_dots`
- `test_period_parser_monthly`
- `test_period_parser_quarterly`
- `test_retry_then_raise`

Run: `docker compose exec api pytest backend/tests/test_extractor_ibge.py -v`.

## FR mapping
- FR-1.1 (unified adapter contract) — `IBGESidraAdapter.fetch` returns `ExtractionResult`
- FR-1.3 (idempotent + retry) — tenacity retries, sorted output, deterministic parsing

## Open Qs (deferred to orchestrator)
Recorded in `docs/data-sources/ibge-sidra.md` "Open Qs" if any seed table_id requires correction.
