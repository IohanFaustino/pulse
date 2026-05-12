# Phase 20 — Wave D — ANBIMA Bulk-History Ingestion

## Goal
Replace the per-date `ima-sh-down.asp` scraper with a single XLSX download per
index from ANBIMA's public S3 bucket. Adds full historical backfill in one
request per series and expands ANBIMA coverage from 9 to **34 indexes**.

## Source URL pattern
```
https://s3-data-prd-use1-precos.s3.us-east-1.amazonaws.com/arquivos/indices-historico/{CODE}-HISTORICO.xls
```
- File is XLSX (PK signature). Parsed via `pandas.read_excel(engine='openpyxl')`.
- Single sheet `Historico`. Each file holds the full history of a single index.
- Key columns: `Data de Referência` (datetime), `Número Índice` (Decimal).

## Indexes covered (34)
9 existing (`source_id` migrated to S3 file-code):
- IMA-Geral (IMAGERAL), IMA-Geral_ex-C (IMAGERALEXC), IMA-B (IMAB),
  IMA-B_5 (IMAB5), IMA-B_5plus (IMAB5MAIS), IRF-M (IRFM), IRF-M_1 (IRFM1),
  IRF-M_1plus (IRFM1MAIS), IMA-S (IMAS).

25 new:
- IDA family: IDA_Geral, IDA_Liq_Geral, IDA_DI, IDA_Liq_DI, IDA_IPCA,
  IDA_IPCA_Infra, IDA_IPCA_ExInfra, IDA_Liq_IPCA, IDA_Liq_IPCA_Infra.
- IDKA family (pré): IDKA_PRE_3M, IDKA_PRE_1A, IDKA_PRE_2A, IDKA_PRE_3A,
  IDKA_PRE_5A.
- IDKA family (IPCA): IDKA_IPCA_2A, IDKA_IPCA_3A, IDKA_IPCA_5A.
- IDKA family (IPCA Infra): IDKA_IPCA_Infra_2A, IDKA_IPCA_Infra_3A,
  IDKA_IPCA_Infra_5A, IDKA_IPCA_Infra.
- Sub-quotas: IRF-M_P2, IRF-M_P3, IMA-B_5_P2.
- IHFA (Índice de Hedge Funds ANBIMA).
- IMA-Geral_exc (alt code IMAGERALEXC — already counted above; the 34th is
  `IDKA_IPCA_Infra` aggregate file `IDKAIPCAINFR`).

## File ownership
| Path | Action |
| --- | --- |
| `backend/src/api_extractor/extractors/anbima_bulk.py` | CREATE |
| `backend/src/api_extractor/extractors/registry.py` | EDIT — swap adapter |
| `backend/data/series.seed.json` | EDIT — +25 new, update 9 existing source_ids |
| `backend/tests/test_extractor_anbima_bulk.py` | CREATE |
| `backend/tests/fixtures/anbima_bulk/IMAGERAL-HISTORICO.xls` | CREATE (live download) |
| `backend/tests/test_seed.py` | EDIT — bump 50 → 75 |
| `docs/data-sources/anbima-ima.md` | APPEND bulk section |
| `docs/PLAN.md` | APPEND Phase 20 Wave D note |

## Adapter design
- `ANBIMABulkAdapter(SourceAdapter)`, `source="anbima"`.
- Async download via `httpx.AsyncClient.get(...)` returning bytes.
- Parsing offloaded via `asyncio.to_thread` (sync pandas).
- 3× tenacity retry on transient transport + 5xx/429.
- `since=` filters parsed observations on `Data de Referência >= since`.
- Each file = single index, so name-matching is unnecessary; we use all rows.

## Backfill
After re-seed, set status=fresh for all 34 ANBIMA series and trigger
`POST /admin/extract/{code}` per code. ~5s × 34 ≈ 3min total.

## Tests
- `test_parse_imageral_xlsx` — parses real fixture, asserts ≥ 6000 rows.
- `test_filter_by_since` — `since=2024-01-01` filters correctly.
- `test_decimal_parsing` — `value` is `Decimal`, not float.
- `test_download_404_raises` — 404 → `ExtractionError`.
- `test_retry_on_transport_error` — 3 transport errors → ExtractionError.

## Backwards compat
- The 9 existing ANBIMA codes keep their canonical `code` (e.g. `IMA-Geral`)
  and `name`; only `source_id` migrates to the S3 file-code (e.g. `IMAGERAL`).
  Public API (`/series/IMA-Geral/observations`) continues unchanged.
- `anbima_ima.py` (per-date scraper) remains in tree for reference; not wired
  into the registry. Marked deprecated in its module docstring.
