# Phase 18 — Multi-Measure Series

**Status:** Plan approved, execution staged.
**Author:** Claude (sub-agent run, 2026-05-11)
**Lifecycle:** Think → Plan → Execute → Test → Done

## 1. Motivation

A single economic indicator is observed by users through multiple equivalent
"measures" (forms). PIB is the canonical example:

- variação trimestral (% t/t-1) — default analytic view
- variação interanual (% int.) — comparative view
- índice de volume (base 1995=100) — level view

Today the system maps one series → one `source_id` → one stream of observations.
Operators must register near-duplicate series cards (e.g. `PIB_yoy`, `PIB_idx`)
to surface alternates, which clutters the index and confuses users.

The goal of Phase 18 is to keep **one card per indicator** while letting the
user toggle between equivalent measures inside the Analysis Panel.

## 2. Scope

### In scope

- Backend schema: `series.measures` JSONB; `observations.measure_key` column;
  PK migration on the TimescaleDB hypertable; `revisions.measure_key`.
- Seed enrichment for **PIB, IBC-Br, IPCA, Ibovespa, Reservas_Internacionais**.
  All other 20 series receive a single synthesized default measure for
  backwards compatibility.
- Extractor surface (`SourceAdapter.fetch`) accepts a measure spec override.
- Services (`ExtractionService`, `BackfillService`) iterate all configured
  measures per series.
- API: `GET /series/{code}` exposes `measures[]` with observation counts.
  `GET /series/{code}/observations`, `POST /series/{code}/transform`, and
  `POST /admin/extract/{code}` accept an optional `measure` query param.
- Frontend `AnalysisPanel` adds a measure selector dropdown that re-queries
  observations and transforms on change. Hidden when the series has a single
  measure.
- Full backend test suite + frontend AnalysisPanel measure-switching test.
- Documentation updates (`docs/data-sources/bcb-sgs.md`,
  `docs/data-sources/ibge-sidra.md`).

### Out of scope (deferred)

- Per-measure status / freshness / staleness logic in the dashboard.
- Multi-measure sparklines on the index grid (stays on default measure).
- Derived measures that require client-side composition (e.g. cumulative
  product of IPCA 433 to produce a virtual `idx`). Captured as open Q.
- Per-measure pinning / per-measure card transforms.

## 3. Backwards compatibility contract

- Existing single-measure series (20 of 25) get one auto-synthesized measure
  in the seed (`key="default"`, `is_default=true`) pointing at the current
  `source_id`. Their behaviour is unchanged.
- The observations PK becomes `(series_code, measure_key, observed_at)` but
  every existing row is backfilled with `measure_key='default'` via the
  migration. No data loss.
- API: omitting `?measure=` falls back to the default measure. All 219 BE
  tests that don't pass a measure stay green.

## 4. Schema changes

### `series` table

```sql
ALTER TABLE series
  ADD COLUMN measures JSONB NOT NULL DEFAULT '[]'::jsonb;
```

`series.measures` shape (validated in the `MeasureRead` Pydantic model):

```jsonc
[
  {
    "key": "pct_qoq",
    "name": "Variação trimestral",
    "unit": "% t/t-1",
    "source_type": "ibge_sidra",
    "source_id": "5932",
    "is_default": true,
    "ibge_variable": "6564",        // IBGE-only override
    "ibge_classification": ["11255", "90707"],  // IBGE-only override
    "frequency": "quarterly"        // optional override
  }
]
```

The legacy `series.source` / `series.source_id` / `series.unit` columns stay
populated (always equal to the default measure) so existing consumers and
sparkline reads continue to work without change.

### `observations` table

```sql
ALTER TABLE observations ADD COLUMN measure_key TEXT NOT NULL DEFAULT 'default';
ALTER TABLE observations DROP CONSTRAINT pk_observations;
ALTER TABLE observations
  ADD CONSTRAINT pk_observations
    PRIMARY KEY (series_code, measure_key, observed_at);
-- Refresh compound index for new query pattern.
DROP INDEX IF EXISTS ix_observations_series_date_desc;
CREATE INDEX ix_observations_series_measure_date_desc
  ON observations (series_code, measure_key, observed_at DESC);
```

**Hypertable note:** TimescaleDB *does* allow altering the PK as long as the
partition column (`observed_at`) remains in the constraint. Verified via
TimescaleDB 2.x release notes (the `_timescaledb_internal._hyper_*` chunks
inherit constraint changes). The migration must run inside a single
transaction and must not require chunk-level rewrites — adding a column with
a `DEFAULT` literal that has no volatility (string constant) is metadata-only
in PG 11+, so the rewrite is avoided.

### `revisions` table

```sql
ALTER TABLE revisions ADD COLUMN measure_key TEXT NOT NULL DEFAULT 'default';
DROP INDEX IF EXISTS ix_revisions_series_date;
CREATE INDEX ix_revisions_series_measure_date
  ON revisions (series_code, measure_key, observed_at);
```

### Downgrade

The migration is reversible:

1. Drop `measure_key` from `revisions` (and recreate old index).
2. Drop `measure_key` from `observations`, restore old PK and index.
   (Pre-condition: no two rows differ only in `measure_key` for a given
   `(series_code, observed_at)`. Migration verifies via `SELECT COUNT(*) …`
   before dropping; raises if violated. Operator must purge non-default
   measures first.)
3. Drop `measures` column from `series`.

## 5. Source mapping

### PIB (IBGE SIDRA table 5932)

| key          | variable | classification    | unit             | default |
| ------------ | -------- | ----------------- | ---------------- | ------- |
| pct_qoq      | 6564     | (11255, 90707)    | % t/t-1          | ✅      |
| pct_yoy      | 6561     | (11255, 90707)    | % int.           |         |
| idx_volume   | 6563     | (11255, 90707)    | índice 1995=100  |         |

(Variable IDs verified via `docs/data-sources/ibge-sidra.md` notes from W2.)

### IBC-Br (BCB SGS)

| key      | source_id | unit       | default |
| -------- | --------- | ---------- | ------- |
| idx      | 24364     | índice     | ✅      |
| pct_mom  | 24365     | % a.m.     |         |
| pct_yoy  | 24363     | % int.     |         |

### IPCA (BCB SGS)

| key      | source_id | unit         | default |
| -------- | --------- | ------------ | ------- |
| pct_mom  | 433       | % a.m.       | ✅      |
| pct_12m  | 13522     | % acum. 12m  |         |

*Note:* an `idx` measure derived from cumulative product of 433 is technically
feasible but deferred (open Q-1): no upstream series at SGS 433 carries the
cumulative index directly. Mentioned in user prompt as "(need verify) OR use
cumulative product".

### Ibovespa (Yahoo + derived)

| key         | source              | unit   | default | transform              |
| ----------- | ------------------- | ------ | ------- | ---------------------- |
| close       | Yahoo `^BVSP` close | pts    | ✅      | none                   |
| pct_daily   | derived             | % d/d  |         | `delta_pct(close, 1)`  |

A derived measure is a measure whose `source_type == "derived"` and whose
`transform` field describes an op spec (mirrors the existing `transforms`
registry). It runs once after extraction of its dependency measure and writes
its own rows to `observations` with the derived measure_key. Implementation
note: re-use `transforms.service.run_spec` and shape the output as
`bulk_upsert` input. The dependency graph is single-level for now (`close →
pct_daily`); we will raise on multi-level or cyclic specs.

### Reservas_Internacionais (BCB SGS)

| key      | source_id | unit            | default |
| -------- | --------- | --------------- | ------- |
| total    | 13621     | US$ bi          | ✅      |
| liquidez | 13982     | US$ bi (liq.)   |         |

### All other series (20)

```jsonc
[{"key": "default", "name": "<series.name>", "unit": "<series.unit>",
  "source_type": "<inferred>", "source_id": "<series.source_id>",
  "is_default": true}]
```

Synthesized by the seed loader if `measures` is absent in the JSON, so the
seed file only needs to declare measure arrays for the 5 enriched series.

## 6. File plan

### Backend (CREATE)

- `backend/alembic/versions/0003_multi_measure.py`
- `backend/tests/test_measures.py`

### Backend (EDIT)

| Path                                                            | Change                                                         |
| --------------------------------------------------------------- | -------------------------------------------------------------- |
| `backend/data/series.seed.json`                                 | Add `measures` to 5 enriched series                            |
| `backend/src/api_extractor/models/series.py`                    | `measures: Mapped[list[dict]]` JSONB                           |
| `backend/src/api_extractor/models/observation.py`               | `measure_key` Mapped column + PK update                        |
| `backend/src/api_extractor/models/revision.py`                  | `measure_key` Mapped column                                    |
| `backend/src/api_extractor/schemas/series.py`                   | `MeasureRead` model + `measures` field on `SeriesRead`         |
| `backend/src/api_extractor/schemas/observation.py`              | Optional `measure_key`                                         |
| `backend/src/api_extractor/schemas/transform.py`                | Accept `measure` field in request / query                      |
| `backend/src/api_extractor/schemas/admin.py`                    | Backfill report fields keyed by `(code, measure_key)`          |
| `backend/src/api_extractor/repos/series_repo.py`                | Return `measures`; helper `default_measure()`                  |
| `backend/src/api_extractor/repos/observation_repo.py`           | All CRUD methods accept `measure_key` (default `"default"`)    |
| `backend/src/api_extractor/extractors/base.py`                  | `fetch(..., measure: dict \| None = None)`                     |
| `backend/src/api_extractor/extractors/bcb_sgs.py`               | Use `measure['source_id']` when provided                       |
| `backend/src/api_extractor/extractors/ibge_sidra.py`            | Build `_SidraSpec` from measure overrides; map fallback        |
| `backend/src/api_extractor/extractors/b3_yahoo.py`              | Use `measure['source_id']` when provided                       |
| `backend/src/api_extractor/services/extraction_service.py`      | `run_for(code, measure_key=None)`; iterate when None           |
| `backend/src/api_extractor/services/backfill_service.py`        | Iterate all measures sequentially per series                   |
| `backend/src/api_extractor/routers/series.py`                   | `measure` query on observations; expose `measures[]`           |
| `backend/src/api_extractor/routers/transform.py`                | `measure` query                                                |
| `backend/src/api_extractor/routers/admin.py`                    | `measure` query on `/admin/extract/{code}`                     |
| `backend/src/api_extractor/seed.py`                             | Synthesize default measure when JSON omits `measures`          |
| `backend/src/api_extractor/transforms/service.py`               | Read `measure_key` filter, write derived measure_key           |
| `backend/tests/test_repos_observation.py`                       | Test measure_key parameter on all CRUD ops                     |
| `backend/tests/test_api_series.py`                              | Test `measures[]` in series response                           |
| `backend/tests/test_api_transform.py`                           | Test `?measure=` routing                                       |
| `backend/tests/test_extractor_bcb.py`                           | Test measure override                                          |
| `backend/tests/test_extractor_ibge.py`                          | Test measure override + variable/classification injection      |
| `backend/tests/test_extractor_b3_yahoo.py`                      | Test measure override                                          |
| `backend/tests/test_migration_hypertable.py`                    | Update PK assertion                                            |

### Frontend (EDIT)

| Path                                                            | Change                                                         |
| --------------------------------------------------------------- | -------------------------------------------------------------- |
| `frontend/src/api/schema.ts`                                    | Regenerated via codegen after `openapi.json` refresh           |
| `frontend/src/hooks/useObservations.ts`                         | Accept `measure?: string`; include in query key + params       |
| `frontend/src/hooks/useTransform.ts`                            | Pass `measure` in mutation body                                |
| `frontend/src/hooks/useSeriesOne.ts`                            | (No behaviour change; consume `measures[]` field)              |
| `frontend/src/components/AnalysisPanel/index.tsx`               | Measure dropdown above accordions; resets transform on switch  |
| `frontend/src/components/AnalysisPanel/AnalysisPanel.module.css`| Selector styles using existing tokens                          |
| `frontend/src/components/AnalysisPanel/AnalysisPanel.test.tsx`  | Dropdown render + measure switch refetch test                  |

### Docs (EDIT)

- `docs/data-sources/bcb-sgs.md` — document SGS 24363/24365, 13522, 13982.
- `docs/data-sources/ibge-sidra.md` — document PIB variables 6561, 6563.

### Untouched

`docker-compose.yml`, `frontend/src/styles/tokens.css`, all other components,
all other adapters, scheduler.

## 7. Execution order

Sequential, each step validated before the next:

1. **Schema** — write `0003_multi_measure.py` + update `models/*`. Apply in
   container. Verify hypertable PK with `\d observations`.
2. **Seed update** — enrich `series.seed.json` (PIB + 4 others). Make
   `seed.py` synthesize default measure when absent. Re-seed. Verify
   `select code, jsonb_array_length(measures) from series order by code;`.
3. **Repos & schemas** — propagate `measure_key` plumbing through repos,
   schemas, and `series_repo.default_measure()` helper. No behaviour change
   at the API yet because routers still default to `"default"`. Run BE tests;
   should remain green except for the new test file.
4. **Extractors** — wire the measure override into the three adapters. For
   IBGE, accept optional `ibge_variable` / `ibge_classification` in the
   measure dict and fall back to `IBGE_VARIABLE_MAP` otherwise.
5. **Services** — `ExtractionService.run_for(code, measure_key=None)`:
   loops measures when None, calls adapter once per measure, upserts with
   `measure_key`. `BackfillService` iterates measures.
6. **Routers** — add `?measure=` query. Update `openapi.json` export.
7. **Derived measure for Ibovespa pct_daily** — implement transform-driven
   measure inside `BackfillService.run_for(series)` (after raw measures
   succeed, run derived ones).
8. **Frontend** — regenerate types, add hook params, add selector, write
   tests.
9. **Live backfill** — run sequential `/admin/backfill` against staging
   compose; record per-(code, measure) counts.
10. **Phase plan close-out** — update this doc with measure counts and any
    open Qs discovered.

## 8. Risk register

| Risk                                                    | Mitigation                                                              |
| ------------------------------------------------------- | ----------------------------------------------------------------------- |
| Hypertable PK alter rewrites chunks / locks too long    | DEFAULT-value-only ADD COLUMN avoids rewrite; PK swap inside txn        |
| Upstream rate limits during 25×~3 measure backfill      | Sequential per series; 250ms inter-measure sleep; reuse adapter HTTP    |
| Old observations get treated as wrong measure           | Migration backfills `measure_key='default'`; seed marks default per S   |
| Frontend caching stale data on measure switch           | Query key includes `measure`; invalidate via `useQueryClient`           |
| Single-measure tests break                              | Default measure auto-resolved server-side when `measure` query omitted  |
| Decimal precision lost via JSON in derived measures     | Round inside transform op then cast back to Decimal before upsert       |
| FE openapi types out of sync                            | Run `make openapi` after router edits; codegen runs in CI               |

## 9. Open questions

- **Q-1.** Should IPCA expose an `idx` measure derived from cumulative product
  of 433? Deferred until product confirms desired base date.
- **Q-2.** For Ibovespa, do we want intraday measures (e.g. open / high /
  low) or only close + derived pct? Plan ships close + pct_daily.
- **Q-3.** Should the measure selector live in the panel header or inside
  each accordion? Plan ships panel-header for now (one selector affects
  chart + transform). Confirm with design.
- **Q-4.** When the user has saved a card transform and switches measure, do
  we drop the transform or attempt to re-apply on the new measure's series?
  Plan: drop (transforms are measure-specific). Surface via toast.

## 10. Test plan

### Backend

- `test_measures.py` (new):
  - Seed PIB with three measures, upsert distinct observation sets for each
    measure_key, assert each is retrievable in isolation and that
    `observations.count(series, measure_key)` is per-measure.
  - `GET /series/PIB` includes `measures[]` with three entries and per-measure
    counts.
  - `GET /series/PIB/observations?measure=pct_yoy` returns only those rows.
  - `POST /series/PIB/transform?measure=pct_yoy` filters before transforming.
  - Default measure resolution: requests without `?measure=` return the
    `is_default=true` measure's rows.
- Update existing tests to thread `measure_key` where needed and to assert
  default behaviour unchanged.

### Frontend

- `AnalysisPanel.test.tsx`:
  - Renders a select with three options when the series has 3 measures.
  - Hides the select when the series has 1 measure.
  - Switching the option triggers a re-query and chart re-render.
  - Saving a transform after switching measures uses the active measure key.

### Acceptance (manual)

- `curl /api/series/PIB | jq .measures` returns 3 entries.
- After `/admin/backfill`, `psql -c "select series_code, measure_key,
  count(*) from observations group by 1,2 order by 1,2"` shows non-default
  rows present only for the 5 enriched series.
- Open the AnalysisPanel for PIB, switch dropdown, observe chart redraws
  with different data set.

## 11. Done criteria

- 0003 migration runs forward and back on a clean DB.
- All 219 BE tests + new `test_measures.py` pass.
- All 259 FE tests + new AnalysisPanel measure-switch tests pass.
- Re-seed + live backfill produces non-zero observation counts for every
  declared measure of the 5 enriched series.
- Documented open Qs forwarded to product/design.

---

## Stage 1 execution (schema migration + model updates)

**Date:** 2026-05-11
**Agent:** python-pro sub-agent (Stage 1 of 5)
**Migration head before:** 0002
**Observation rows before:** 215 000+ all with implicit `measure_key = 'default'`

### Pre-flight observations

- Container: `api-api-1` running Uvicorn; DB: `api-api-1` → `api_extractor`.
- Current `observations` PK: `pk_observations PRIMARY KEY btree (series_code, observed_at)`.
- 994 hypertable child chunks exist. Adding a column with a constant `DEFAULT`
  is metadata-only in PG 16 (no chunk rewrite). PK swap requires DROP +
  ADD inside a transaction — TimescaleDB 2.26.4 allows this as long as the
  partition column (`observed_at`) remains in the new PK.
- Existing unique constraint `uq_observations_series_date` on
  `(series_code, observed_at)` was noted in 0001 but TimescaleDB drops it
  silently on hypertable conversion; verified absent in live `\d` output.
  The downgrade guard checks for multi-measure rows before restoring old PK.

### Decisions made during execution

1. **Index rename:** `ix_observations_series_date_desc` is replaced by
   `ix_observations_series_measure_date_desc` on `(series_code, measure_key,
   observed_at)`. The downgrade restores the original index name and drops the
   new one.
2. **Revisions index:** `ix_revisions_series_date` is replaced by
   `ix_revisions_series_measure_date` on `(series_code, measure_key,
   observed_at)`. Downgrade restores original.
3. **ORM model index names** in `observation.py` and `revision.py` are updated
   to match the new migration index names so Alembic autogenerate stays clean.
4. **Downgrade guard:** uses `EXISTS (SELECT 1 FROM observations WHERE
   measure_key <> 'default' LIMIT 1)` — avoids full table scan on large
   hypertables.
5. **Test updates in `test_migration_hypertable.py`:**
   - `test_alembic_version_is_head` updated to expect `'0003'`.
   - `test_series_indexes_exist` updated: removes `ix_observations_series_date_desc`,
     adds `ix_observations_series_measure_date_desc`.
   - New test `test_observations_pk_includes_measure_key` asserts that the PK
     column list includes `measure_key`.

### Files written / edited

| File | Action |
|------|--------|
| `backend/alembic/versions/0003_multi_measure.py` | CREATE |
| `backend/src/api_extractor/models/series.py` | EDIT — add `measures` JSONB |
| `backend/src/api_extractor/models/observation.py` | EDIT — add `measure_key` PK column + new index name |
| `backend/src/api_extractor/models/revision.py` | EDIT — add `measure_key` + new index name |
| `backend/tests/test_migration_hypertable.py` | EDIT — version + new PK test + index set |

### Test gate

All 219 existing BE tests must pass after `alembic upgrade head` to 0003.
Backwards compatibility is guaranteed by `DEFAULT 'default'` on all new columns.
