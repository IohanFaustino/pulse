# Phase 3: APScheduler In-Process Scheduler
**Agent:** python-pro  **Wave:** W6  **Skills:** python-pro, fastapi-expert, monitoring-expert

## Files owned

### Create
- `backend/src/api_extractor/scheduler.py` — AsyncIOScheduler factory, job registration, start/stop
- `backend/src/api_extractor/jobs.py` — job functions (daily batch, periodic batch, calendar refresh)
- `backend/tests/test_scheduler.py` — unit tests for scheduler wiring
- `backend/tests/test_jobs.py` — unit tests for job functions
- `backend/tests/test_api_admin_scheduler.py` — API contract tests for scheduler endpoints

### Edit
- `backend/src/api_extractor/config.py` — add SCHEDULER_ENABLED, SCHEDULER_TZ
- `backend/src/api_extractor/main.py` — wire scheduler in lifespan
- `backend/src/api_extractor/routers/admin.py` — add GET /admin/scheduler/jobs + POST /admin/scheduler/trigger/{job_id}
- `backend/src/api_extractor/schemas/admin.py` — add SchedulerJobInfo, SchedulerJobsResponse, SchedulerTriggerResponse

## Interfaces

### Consumes
- `BackfillService` from `services/backfill_service.py` — run batch extraction
- `ExtractionService` from `services/extraction_service.py` — single-series extraction (within jobs)
- `CalendarService` from `calendar_scraper/service.py` — calendar refresh
- `async_session_factory` from `db.py` — sessions for jobs
- `settings` from `config.py` — DATABASE_URL, SCHEDULER_ENABLED, SCHEDULER_TZ

### Produces
- `AsyncIOScheduler` instance accessible via `app.state.scheduler`
- `GET /admin/scheduler/jobs` — list jobs with next_run_at
- `POST /admin/scheduler/trigger/{job_id}` — fire job immediately

## Schedules

| Job ID | Trigger | Timezone | misfire_grace_time |
|---|---|---|---|
| `daily_batch` | CronTrigger mon-fri 18:00 | America/Sao_Paulo | 3600s |
| `periodic_batch` | CronTrigger daily 09:00 | America/Sao_Paulo | 3600s |
| `calendar_refresh` | CronTrigger sunday 03:00 | America/Sao_Paulo | 3600s |

## Test strategy

### test_scheduler.py (unit — no DB, mocked)
- `test_build_scheduler_returns_asyncio_scheduler` — verify type
- `test_register_jobs_adds_3_jobs` — mock scheduler, assert 3 add_job calls
- `test_misfire_grace_time_is_3600` — inspect job config
- `test_timezone_is_brt` — inspect CronTrigger timezone

### test_jobs.py (unit — mock services + session)
- `test_extract_daily_batch_job_calls_backfill_service` — mock BackfillService, assert run called
- `test_extract_periodic_batch_job_calls_backfill_service` — same for periodic codes
- `test_refresh_calendar_job_calls_calendar_service` — mock CalendarService, assert refresh_all called
- `test_job_exception_does_not_propagate` — service raises, job catches and logs

### test_api_admin_scheduler.py (API contract — SCHEDULER_ENABLED=True, scheduler mocked on app.state)
- `test_list_scheduler_jobs_returns_3` — GET /admin/scheduler/jobs → 200, 3 items
- `test_list_jobs_response_shape` — verify job_id, next_run_at, trigger fields
- `test_trigger_job_fires_immediately` — POST /admin/scheduler/trigger/calendar_refresh → 202
- `test_trigger_unknown_job_returns_404` — POST /admin/scheduler/trigger/nonexistent → 404

## Acceptance criteria mapped

- FR-1.6 → `test_register_jobs_adds_3_jobs`, `test_build_scheduler_returns_asyncio_scheduler`
- FR-1.7 → `test_misfire_grace_time_is_3600`, `test_timezone_is_brt`
- NFR-2 → `test_job_exception_does_not_propagate` (reliability: one failure doesn't kill scheduler)

## Risks + mitigations

| Risk | Mitigation |
|---|---|
| `psycopg2` not installed → SQLAlchemyJobStore fails | Try import; fall back to MemoryJobStore with WARNING log |
| Scheduler starts during pytest → spurious jobs fire | `SCHEDULER_ENABLED=false` in test environment; fixtures_api does not start scheduler |
| Manual trigger blocks HTTP for long jobs | Use `scheduler.add_job(func, 'date', run_date=now)` — non-blocking fire, returns immediately |
| CalendarService.refresh_all needs AsyncSession | Job constructs its own session via async_session_factory |
| APScheduler async job wrapping | All job functions are `async def`; AsyncIOScheduler natively handles coroutines |

## JobStore design

APScheduler 3.x `SQLAlchemyJobStore` requires sync URL. Build sync URL by:
1. Replace `+asyncpg` with `+psycopg2` in DATABASE_URL.
2. If `psycopg2` import fails, fallback to `MemoryJobStore` (jobs survive only in-process).
3. Log which jobstore is active at startup.

## Background services needed

- postgres (up from W0)
- redis (up from W0)
- api container (start/restart after implementation)

## Success criteria

1. `pytest tests/test_scheduler.py tests/test_jobs.py tests/test_api_admin_scheduler.py -v` — all green
2. `pytest tests/ -q` — 208+ green (no regression)
3. Live: `curl http://localhost:8000/admin/scheduler/jobs | jq` → 3 jobs with `next_run_at`
4. Live: `psql -c "SELECT id, next_run_time FROM apscheduler_jobs;"` → 3 rows (when psycopg2 available)
5. Live: `POST /admin/scheduler/trigger/calendar_refresh` → 202, logs show execution
