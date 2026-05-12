# ADR-0005: APScheduler in-process for extraction

## Status
Accepted — 2026-05-11

## Context
25 series with daily/monthly/quarterly cadence. v1 = single-user local. Need scheduled jobs without standing up worker infra.

## Decision
Use `AsyncIOScheduler` from APScheduler running inside the FastAPI process. Register jobs at startup from `series` table metadata. Persist next-run state in DB (`SQLAlchemyJobStore`) so missed runs survive restart.

## Alternatives Considered
- **Celery + Redis beat** — Separate worker container, retry queues, monitoring. Overkill for 25 jobs in local deploy.
- **Cron in host crontab** — Couples scheduling to host, not portable, no in-process retry/observability.
- **Manual CLI trigger only** — User must remember to refresh. Defeats automation goal.

## Consequences
- **Positive:** one container, one log stream. `misfire_grace_time` handles brief downtime.
- **Negative:** API restart restarts scheduler — but jobs are idempotent (upsert observations) so re-runs are safe.
- **Negative:** scheduler shares event loop with HTTP. If extractor blocks, API suffers. Mitigation: all extractor I/O via `httpx.AsyncClient`.

## Trade-offs
Operational simplicity > scheduling isolation. Migration to Celery is mechanical when needed.

## Job design
- Idempotent (upsert on `(series_code, observed_at)`)
- Wrapped in `tenacity` retry 3x exp backoff
- On final fail: mark `series.status = 'stale'`, log structured error
