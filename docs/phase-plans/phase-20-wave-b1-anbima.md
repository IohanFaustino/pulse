# Phase 20 — Wave B-1: ANBIMA IMA Adapter

**Status:** in progress
**Owner:** Wave B-1
**Scope:** Implement `ANBIMAAdapter` for the IMA family series scraped from
`https://www.anbima.com.br/informacoes/ima/ima-sh-down.asp` (CSV format).

## Goals

1. New `SourceAdapter` subclass at
   `backend/src/api_extractor/extractors/anbima_ima.py` with `source="ANBIMA"`.
2. Adapter iterates business dates from `since` (or `series.first_observation`)
   through `today`, POSTing one request per date with a 1 rps polite throttle.
3. Decoder: ISO-8859-1 → `csv.reader(delim=';')` → filter rows whose `Índice`
   column normalizes to `series.source_id` → emit `FetchedObservation` with
   `Decimal` value parsed from pt-BR locale (`.` thousands, `,` decimal).
4. tenacity 3x exp backoff for transport + 5xx; non-retryable for 4xx and 200
   empty bodies.
5. Register `ANBIMAAdapter` in
   `backend/src/api_extractor/extractors/registry.py` under both `"ANBIMA"`
   and `"anbima"` slugs.
6. Unit tests at `backend/tests/test_extractor_anbima.py` covering parsing,
   locale, encoding, empty-day, multi-series filter, retry-exhaustion, and
   business-date iteration.
7. Live smoke (manual, in test step) — `POST /admin/extract/IMA-Geral?since=2026-05-01`
   should land ~5 business-day observations.

## File ownership

| File | Action |
|---|---|
| `backend/src/api_extractor/extractors/anbima_ima.py` | CREATE |
| `backend/src/api_extractor/extractors/registry.py` | EDIT (add mapping + import) |
| `backend/tests/test_extractor_anbima.py` | CREATE |
| `docs/data-sources/anbima-ima.md` | APPEND "Implementation notes" |
| `docs/phase-plans/phase-20-wave-b1-anbima.md` | CREATE (this file) |

**Do not touch:** other extractors, `series.seed.json`, schema, frontend,
docker-compose, scheduler. Backfill orchestration is Wave C.

## Index name normalization

`series.source_id` uses dash-joined uppercase form (e.g. `IMA-GERAL-EX-C`,
`IMA-B-5+`, `IRF-M-1`, `IMA-S`). The CSV `Índice` column uses space-separated
mixed-case form (e.g. `IMA-GERAL ex-C`, `IMA-B 5+`, `IRF-M 1`, `IMA-S`).

Adapter normalization (applied to both sides before comparison):

1. Strip whitespace.
2. Uppercase.
3. Replace runs of whitespace with `-`.

So `"IMA-GERAL ex-C"` → `"IMA-GERAL-EX-C"` matches `source_id="IMA-GERAL-EX-C"`.
`"IMA-B 5+"` → `"IMA-B-5+"` matches `source_id="IMA-B-5+"`.

## Decimal parsing (pt-BR)

`"11.521,718637"` → remove thousands `.` → `"11521,718637"` → replace `,`→`.` →
`Decimal("11521.718637")`. Never via `float`.

Cell values `"--"` (used for Yield/Redemption Yield on IMA-S / IMA-Geral ex-C)
are simply not the column we parse — we only extract `Número Índice` (column 3).

## Business-date iteration

`weekday() < 5` (Mon–Fri). Holidays are detected at response time (empty body
~46 bytes, no data rows after the TOTAIS header). We do NOT consult a holiday
calendar here — empty days are silently skipped. (Wave C orchestrator can layer
a calendar filter later.)

## Throttle & retry

- `await asyncio.sleep(1.0)` between successive successful requests inside one
  fetch run. (Not before the first request, not after the last.)
- tenacity retry: `stop_after_attempt(3)`, `wait_exponential(multiplier=2, min=2, max=30)`,
  retry only on `httpx.TransportError | httpx.TimeoutException | HTTPStatusError`
  where status is 429 or ≥500. Three failed attempts → `ExtractionError`.

## Out of scope (deferred to Wave C)

- Full 6000-day backfill orchestration.
- Per-index XLS workbook fast-path for the three XLS-available series.
- Holiday calendar integration.
- Cache-to-disk of raw CSVs.
- Scheduler integration / nightly cadence.
