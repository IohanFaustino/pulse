# Phase 10: Final acceptance verification (W7)

**Agent:** test-master  **Wave:** W7  **Skills:** test-master, debugging-wizard, the-fool

## Goal

Walk through spec acceptance criteria + DoD checklist + end-to-end smoke without
modifying any application code. Produce a single sign-off document at
`docs/VERIFICATION-REPORT.md`.

## Files owned

- create: `docs/phase-plans/phase-10-verification.md` (this file)
- create: `docs/VERIFICATION-REPORT.md` (final report)
- create: `backend/tests/test_acceptance_e2e.py` (codifies AC-1, AC-4, AC-5 as live tests against the running API; AC-2/3/6/7 already covered in `test_api_acceptance.py`)

Nothing else is touched.

## Interfaces

- consumes: running docker compose stack (`api`, `postgres`, `redis`, `web`), seeded DB with 25 series + backfill, scheduler running, releases table populated.
- produces: a structured verification report mapping each DoD bullet + AC + NFR to evidence (pass/fail + measurement).

## Verification matrix

| Item | Source of truth | Command / Probe | Expected |
|---|---|---|---|
| Test suite (backend) | `pytest` | `docker compose exec api pytest tests/ -q` | 236 passed, 2 skipped |
| Test suite (frontend) | `vitest` | `docker compose exec web npm run test -- --run` | 198 passed |
| Typecheck | `tsc --noEmit` | `docker compose exec web npm run typecheck` | 0 errors |
| Services up | docker | `docker compose ps` | 4 services |
| /health | API | `curl /health` | status=ok, 25 series, all fresh |
| 25 series seeded | DB | `SELECT count(*) FROM series` | 25 |
| Per-series obs | DB | `SELECT series_code, COUNT(*) FROM observations GROUP BY series_code` | 25 rows (≥1 obs each) |
| Releases ≥2 months | DB | `SELECT COUNT(*) FROM releases WHERE scheduled_for>=CURRENT_DATE` | ≥ 60 |
| Scheduler jobs | API | `GET /admin/scheduler/jobs` | 3 jobs, running=true |
| Scheduler persistence | DB | `SELECT * FROM apscheduler_jobs` | 3 rows |
| AC-1 backfill coverage | E2E test | `test_ac1_full_backfill_coverage` | all 25 series have ≥1 obs |
| AC-2 pin appears | existing test | `test_ac2_pin_to_painel` | pass |
| AC-3 transform persists | existing test | `test_ac3_transform_application` | pass |
| AC-4 failure → stale | new test | `test_ac4_extraction_failure_marks_stale` | series.status=stale, response.status=failed |
| AC-5 calendar by month | new test | `test_ac5_releases_filterable_by_month` | ≥1 release current+next month |
| AC-6 NaN gaps | existing test | `test_ac6_nan_gap_in_metadata` | pass |
| AC-7 empty prefs | existing test | `test_ac7_empty_user_prefs` | pass |
| NFR observations p95 cached | curl | `curl /series/CODE/observations` 3x | ≤200ms warm |
| NFR transform p95 uncached | curl | `curl POST /series/CODE/transform` | ≤800ms |
| NFR Painel cold load | curl | `curl http://localhost:5174/` | ≤1.5s (dev server serves shell instantly; tested as cold root) |
| Restart preserves | shell | PATCH prefs → restart api → GET prefs | pins/transforms identical |
| pt-BR | HTML | `curl http://localhost:5174/` | `<html lang="pt-BR">` + pt-BR strings present |
| FR coverage | grep | cross-reference FR ids to test files | each FR has ≥1 test |

## Test strategy for new AC tests

- **AC-1:** purely a database read (count observations per series) — no upstream calls; reads current state.
- **AC-4:** use FastAPI dependency override pattern to replace `get_extraction_service` with one whose `SourceAdapter` raises `ExtractionError`. Hit `POST /admin/extract/SELIC`. Then re-fetch `GET /series/SELIC` and assert `status=='stale'`.
- **AC-5:** hit `GET /releases?month=YYYY-MM` for current and next month; assert ≥ 1 item each.

`test_acceptance_e2e.py` uses the same `api_client` fixture as `test_api_acceptance.py` to leverage existing dependency override scaffolding.

## Risks + mitigations

- IPCA not backfilled → AC-1 will surface that; recorded as DoD failure but no fix attempt per scope.
- AC-4 will mutate SELIC status to 'stale' in the DB. Test restores `fresh` in teardown by patching status back via `SeriesRepo`.
- Performance numbers are single-run on a dev machine; flagged as informational, not statistical p95.

## Success criteria

- Verification matrix fully populated with evidence
- `pytest tests/test_acceptance_e2e.py -v` green for the 3 new tests
- Full backend suite still 236+ pass, 2 skipped
- `VERIFICATION-REPORT.md` ends with a SHIP / FIX-X-THEN-SHIP / NO-SHIP recommendation

## Background services needed

- postgres + redis + api + web (all up from prior waves)
