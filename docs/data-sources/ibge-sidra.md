# IBGE SIDRA — Data source notes

## Base URL
`https://apisidra.ibge.gov.br/values`

## Auth
None. Public API. No token, no IP allowlist.

## URL builder
```
/values/t/{table}/n1/all/v/{variable}/p/{period}[/c{class_id}/{cat_id}]
```

Parameter glossary:

| Segment | Meaning |
|---|---|
| `t/{table}` | Table aggregate id (e.g. `5932`) — required |
| `n1/all` | Geographic level 1 (Brasil), value `all` (= national aggregate) |
| `v/{variable}` | Variable code (e.g. `6564`); `all` returns every variable |
| `p/{period}` | Period code (`YYYYMM` monthly, `YYYYQQ` quarterly), comma-separated list, range `A-B`, or `last N` |
| `c{class_id}/{cat_id}` | Optional classification filter (e.g. `c544/129314` = CNAE Indústria geral) |

Examples:
- PIB var t/t-1 Q1/2023: `…/t/5932/n1/all/v/6564/p/202301/c11255/90707`
- PIM-PF índice jan/2024: `…/t/8888/n1/all/v/12606/p/202401/c544/129314`
- Desemprego Q1/2024: `…/t/4099/n1/all/v/4099/p/202401`

## Response schema
JSON array. **First element = metadata header** (field code → pt-BR label). Subsequent elements = data rows with same field codes mapped to actual values.

Common field codes:

| Code | Meaning |
|---|---|
| `NC`/`NN` | Nível territorial (code/name) |
| `MC`/`MN` | Unidade de medida |
| `V` | Valor (string; decimal dot) |
| `D1C`/`D1N` | Localidade |
| `D{n}C`/`D{n}N` | Dimensão n: variável OR período OR classificação. Order depends on table. |

To identify which `D{n}` is the period, inspect the header row: a label containing "Mês", "Trimestre" or "Trimestre Móvel" marks the period dimension.

## Period format
- **Monthly**: `YYYYMM` (e.g. `202401` = janeiro 2024) → anchor to `datetime(YYYY, MM, 1, tzinfo=UTC)`
- **Quarterly**: `YYYYQQ` where `QQ ∈ {01,02,03,04}` (e.g. `202301` = 1º trimestre 2023) → anchor to first day of [Jan, Apr, Jul, Oct].
- Trimestre móvel (rolling quarter, e.g. table 6390): coded as `YYYYMM` where MM is the final month of the 3-month window. Treated as monthly anchor on the first day of that final month (documented quirk).

## Value formatting
- Returned as **string** with decimal **dot** ("3382", "93.75190").
- Locale: API uses C decimal point even though SIDRA UI uses comma. No locale parsing needed.
- Parse with `Decimal(str)`.

## Missing / sentinel values
| Token | Meaning | Adapter behavior |
|---|---|---|
| `..` | Não disponível / suprimido | skip |
| `...` | Não disponível | skip |
| `-` | Não se aplica | skip |
| `x` | Valor omitido (sigilo) | skip |

## Per-series mapping

| code | table_id (verified) | variable | classif | freq | sample URL |
|---|---|---|---|---|---|
| PIB_Nominal | **1846** | 585 (Valores correntes) | c11255/90707 | quarterly | `/t/1846/n1/all/v/585/p/all/c11255/90707` → R$ mi |
| PIB_Real | **6612** | 9318 (Encadeados preços 1995) | c11255/90707 | quarterly | `/t/6612/n1/all/v/9318/p/all/c11255/90707` → R$ mi 1995 |
| Prod_Industrial | **8888** *(seed has 3653)* | 12606 (PIMPF Índice 2022=100) | c544/129314 | monthly | `/t/8888/n1/all/v/12606/p/all/c544/129314` |
| Vendas_Varejo | 8881 | 7170 (PMC Índice c/ AS) | c11046/56734 | monthly | `/t/8881/n1/all/v/7170/p/all/c11046/56734` |
| Desemprego | 4099 | 4099 (Taxa desocupação) | — | **quarterly** *(seed says monthly)* | `/t/4099/n1/all/v/4099/p/all` |
| Massa_Salarial | 6390 | 5933 (Rendimento médio real)* | — | monthly (trimestre móvel) | `/t/6390/n1/all/v/5933/p/all` |
| Rendimento_Medio | 6390 | 5933 (Rendimento médio mensal real, R$/pessoa) | — | monthly (trimestre móvel) | `/t/6390/n1/all/v/5933/p/all` |

\* Table 6390 in SIDRA is **"Rendimento médio mensal real"**, not strictly "Massa de Rendimentos" (which is table 5429 / variable 6300). Seed name + unit need orchestrator review.

## Quirks
- Header row MUST be skipped before parsing data.
- Variable dimension is sometimes `D2C` (e.g. PIB table 5932) and sometimes `D3C` (e.g. PIM table 8888 with `/v/all/`). Adapter resolves dynamically from header.
- `last N` works: `p/last%201`, `p/last%2012`.
- Range syntax: `p/202401-202412`.
- Suppression markers (`..`, `...`, `-`, `x`) appear for very recent periods or low-significance cells.
- No rate limit documented; tenacity 3x exp backoff is safe.
- Response is always JSON when path ends in `/values/...`.

## Open Qs (orchestrator → seed.json updates)
1. **PIB**: seed `source_id` is `1846` (Valores a preços correntes em R$ milhões, often suppressed); the correct table for `% t/t-1` is **5932 var 6564 classif c11255/90707**. Suggest seed update.
2. **Prod_Industrial**: seed `source_id` is `3653`; current PIM-PF active table is **8888**. Table 3653 returns empty even with valid filters. Suggest seed update to `8888`.
3. **Desemprego (4099)**: SIDRA emits this **quarterly** (1º/2º/3º/4º trimestre). Seed says `monthly`. Either change frequency to `quarterly` or switch to monthly PNADC table (e.g. 6318/6320 — to be researched W3 if needed).
4. **Massa_Salarial (6390)**: table is rendimento médio (R$/pessoa), not massa de rendimentos (R$ bi). Name + unit in seed don't match table. If true "massa" is wanted, switch to table 5429 var 6300.
5. Adapter encodes variable+classification per-code in `IBGE_VARIABLE_MAP` so `Series.source_id` (table id) is the only seed field used; downstream change of seed table ids requires updating the map.

## Multi-measure roadmap (Phase 18 stage 1 complete)

Planned measures per series (post-stage-1):
- **PIB** (table 5932): `pct_qoq` (var 6564, default), `pct_yoy` (var 6561), `idx_volume` (var 6563)
- **IBC-Br** alternative could live here if BCB SGS coverage is incomplete
- **Prod_Industrial** (table 8888): single default measure for v1
- **Vendas_Varejo** (table 8881): single default measure for v1
- **Desemprego** (table 4099): single default measure for v1
- **Rendimento_Medio** (table 6390): single default measure for v1

Measure spec extension: each measure may declare `ibge_variable` and `ibge_classification` overrides; the adapter's existing `IBGE_VARIABLE_MAP` becomes the fallback when no override is present. Stages 2–5 will implement this.
