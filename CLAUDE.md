# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

**Pulse / api-extractor** — single-user local app tracking 72 Brazilian + international economic indicators. FastAPI + Postgres/TimescaleDB + Redis + Vite/React, all in Docker Compose. pt-BR UI. No auth (intentional — local trusted-network only).

## Commands

All toolchains run inside containers. `make up` first, then:

```bash
make migrate                    # alembic upgrade head
make seed                       # load 72 series from backend/data/series.seed.json
make test                       # full pytest in api container
make test-unit                  # pytest -m "not integration"
make lint                       # ruff check src/
make fmt                        # black src/ tests/
make typecheck                  # mypy src/
make ci-local                   # ruff + pytest+cov + tsc + prettier (needs local Python 3.12 + Node 20)
make secrets-scan               # gitleaks via docker
make shell-api / shell-db       # bash in api / psql in postgres
```

Single backend test:
```bash
docker compose exec api pytest backend/tests/test_transforms.py::test_yoy -v
```

Frontend (Vite container is `web`):
```bash
docker compose exec web npm run test         # vitest
docker compose exec web npm run typecheck    # tsc --noEmit
docker compose exec web npx prettier --check "src/**/*.{ts,tsx,css}"
```

Manual data ops via API (no auth on `/admin/*`):
```bash
curl -X POST http://localhost:8000/admin/backfill         # full history (~3-5 min)
curl -X POST http://localhost:8000/admin/extract/{code}   # one series
curl -X POST http://localhost:8000/admin/refresh-calendar
```

Service URLs: API `http://localhost:8000` (Swagger `/docs`, `/openapi.json`), Web `http://localhost:5174`, Postgres host port `5433` → container `5432`, Redis `6379`.

## Architecture

**Modular monolith** (ADR-0001). Single FastAPI process orchestrates extraction, storage, transforms, scheduling. Layered: `routers → services → repos → models`. Schemas (Pydantic) at boundaries.

**Data flow** (extraction):
1. `scheduler.py` (APScheduler, jobs persisted in Postgres — ADR-0005) fires `jobs.py::daily_batch` Mon–Fri 18:00 BRT, plus monthly + calendar jobs.
2. Job → `services/extraction` → `extractors/registry.py` dispatches by `source` slug to a `SourceAdapter` subclass (BCB SGS, IBGE SIDRA, B3 portal, Yahoo, ANBIMA bulk XLSX).
3. Adapter returns normalized observations → `repos` upsert into TimescaleDB hypertable. **Revisions kept** (history table) — never overwrite blindly.

**Data flow** (read + transform):
1. `GET /series/{code}/observations` → repo query on hypertable.
2. `POST /series/{code}/transform` with `TransformSpec` → `transforms/registry.py` looks up op in `transforms/ops.py` (17 ops: MoM, QoQ, YoY, annualized, log-diff, MA, EWMA, accum-12m, z-score, rebase=100, percentile, etc — pandas/numpy server-side, ADR-0003).
3. Result cached in Redis (ADR-0006), key derived from `(code, spec, max_observation_ts)` so cache invalidates on new data.

**Calendar** (`calendar_scraper/`): scrapes IBGE + BCB; falls back to hardcoded `backend/data/calendar.json` when scrape fails (ADR-0008).

**Frontend**: Vite + React 18 + TS. TanStack Query hooks call REST. Types codegen'd from `/openapi.json` into `frontend/src/api/schema.ts` (ADR-0004 — backend is source of truth; never hand-edit). Zustand for UI state. 4 pages: Painel · Indices · Calendario · Metadados.

## Adding things

**New series**: append to `backend/data/series.seed.json` (`code`, `name`, `category`, `source`, `source_id`, `frequency`, `unit`, `currency`, `is_proxy`, `first_observation`). If `source = "IBGE SIDRA"`: also add to `IBGE_VARIABLE_MAP` in `extractors/ibge_sidra.py`. Then `make seed` + `POST /admin/extract/{code}`.

**New source**: subclass `SourceAdapter` in `extractors/base.py`, register in `extractors/registry.py` (`_SOURCE_SLUG_MAP` + `_ADAPTERS`), document in `docs/data-sources/{slug}.md`, add fixture + tests.

**New transform**: add fn in `transforms/ops.py`, register in `transforms/registry.py::TRANSFORMS`, extend `TransformSpec.op` Literal in `transforms/spec.py`, add radio in `frontend/src/components/TransformModal/`, test in `backend/tests/test_transforms.py`.

## Conventions / gotchas

- TZ everywhere = `America/Sao_Paulo`. Scheduler crons assume BRT.
- BCB SGS has 10-year window cap → adapter chunks ranges; do not remove chunking.
- Yahoo proxies: IFIX→`XFIX11.SA`, MSCI_World→`URTH`, MSCI_EM→`EEM`. Flagged `is_proxy: true`.
- ANBIMA = bulk XLSX from `data.anbima.com.br` S3 (full history per file), not a query API.
- `/admin/*` is **unauthenticated by design**. Do not add auth scaffolding without checking ADRs / SECURITY.md — single-user local scope.
- Postgres host port is `5433` (avoid conflict). Inside compose network use `postgres:5432`.
- Vite host port is `5174` → container `5173`. `VITE_API_URL=http://api:8000` inside compose.
- Frontend `node_modules` lives in named volume `frontend_node_modules` to avoid host shadowing.

## Reference docs

- `specs/api-extractor.spec.md` — EARS spec + acceptance criteria
- `docs/architecture/system-design.md` — diagrams + data model
- `docs/adr/0001..0008` — architectural decisions (consult before deviating)
- `docs/data-sources/` — per-source endpoint contracts
- `docs/USER-GUIDE.md` — operational manual
- `docs/PLAN.md` — phased build log
