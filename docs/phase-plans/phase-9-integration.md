# Phase 9: Integration + Polish
**Agent:** fullstack-guardian  **Wave:** W5  **Skills:** fullstack-guardian, javascript-pro

## Goal
Stitch backend and frontend together at a production-of-v1 level. Manual workflow (scheduler deferred to W6). Wire up calendar refresh, multi-series backfill, sync indicator, manual refresh, recents tracking, and locale polish.

## Files owned

### Backend — create
- `backend/src/api_extractor/services/backfill_service.py` — orchestrates all-25-series extraction with bounded concurrency
- `backend/tests/test_api_admin_refresh.py` — POST /admin/refresh-calendar tests (mocked CalendarService)
- `backend/tests/test_api_admin_backfill.py` — POST /admin/backfill tests (mocked ExtractionService)
- `backend/tests/test_series_next_release.py` — verifies `next_release_at` populated from releases table

### Backend — edit
- `backend/src/api_extractor/routers/admin.py` — add `/admin/refresh-calendar`, `/admin/backfill`
- `backend/src/api_extractor/schemas/admin.py` — add `CalendarRefreshResult`, `BackfillItemResult`, `BackfillResult`
- `backend/src/api_extractor/schemas/series.py` — add optional `next_release_at`
- `backend/src/api_extractor/routers/series.py` — populate `next_release_at` from ReleaseRepo
- `backend/src/api_extractor/repos/release_repo.py` — add `next_for(code)` helper (min(scheduled_for) where date >= today)
- `backend/src/api_extractor/schemas/common.py` — add `sync_at` to HealthResponse
- `backend/src/api_extractor/routers/health.py` — populate `sync_at` (min last_success_at)

### Frontend — create
- `frontend/src/components/SyncIndicator/index.tsx` + `SyncIndicator.module.css` + `SyncIndicator.test.tsx`
- `frontend/src/components/RefreshButton/index.tsx` + `RefreshButton.module.css` + `RefreshButton.test.tsx`
- `frontend/src/hooks/useAdmin.ts` — `useBackfill`, `useRefreshCalendar`, `useExtractOne`
- `frontend/src/hooks/useHealth.ts` — `useHealth()` with refetchInterval

### Frontend — edit
- `frontend/src/components/Sidebar/index.tsx` — replace static footer with `<SyncIndicator />`
- `frontend/src/pages/Painel.tsx` — add `<RefreshButton />` (backfill-all)
- `frontend/src/pages/Metadados.tsx` — wire `useAddRecent(code)` on selection; render `next_release_at`
- `frontend/src/api/schema.ts` — regen from updated OpenAPI
- `frontend/package.json` — split codegen scripts (host + ci)

### Repo root — edit
- `README.md` — add backfill/refresh-calendar/test sections, smoke instructions

## Interfaces
- **Consumes:** ExtractionService, CalendarService, ReleaseRepo, SeriesRepo
- **Produces:** BackfillService (sync method for admin route); new schemas; FE hooks

## Test strategy
- Backend: admin_refresh, admin_backfill, series_next_release (mocked adapters/services to avoid live HTTP)
- Frontend: SyncIndicator (relative time + dot color), RefreshButton (mock fetch → mutation invoked)
- E2E manual smoke: backfill via curl, refresh calendar via curl, verify counts via /health and /releases

## Acceptance criteria mapped
- AC-1 25 series ingested → /admin/backfill triggers all
- AC-4 calendar visible → /admin/refresh-calendar populates releases
- AC-5 transform applied → unchanged from W4
- AC-6 stale shown → /health surfaces, SyncIndicator renders red
- AC-7 empty state → unchanged
- NFR-5 pt-BR → SyncIndicator uses pt-BR strings
- FR-9 manual refresh → RefreshButton wires POST /admin/extract/{code} and /admin/backfill

## Risks + mitigations
- Live BCB/IBGE/Yahoo from inside Docker may rate-limit during backfill → semaphore=3, sleep 250ms between calls per source. Service still tolerates per-series failures.
- Codegen requires running API on localhost:8000 → already up.
- Frontend tests must mock fetch; reuse existing api_client mocking patterns.

## Background services needed
- postgres, redis, api, web — all running.

## Deviations
- Scheduler stays deferred (W6).
- No new colors; reuse tokens.css.
- pt-BR text in UI; English in code.
