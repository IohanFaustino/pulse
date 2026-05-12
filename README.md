<p align="left">
  <img src="docs/assets/pulse-icon.svg" alt="Pulse" width="96" height="32" />
</p>

# Pulse — economic indicators workspace

Personal local workspace for tracking **72 Brazilian and international economic indicators** in one place. Pulls live data from official sources (BCB, IBGE, ANBIMA, B3, Yahoo Finance), stores time series locally with full revision history, computes statistical transforms on demand, and renders everything in a pt-BR React dashboard with full EN/PT toggle.

> Built as a single-user local app — no cloud bill, no account, no telemetry.
> *App UI is pt-BR by default with an EN toggle. Docs and README in English.*

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Python 3.12](https://img.shields.io/badge/python-3.12-3776AB.svg?logo=python&logoColor=white)](https://www.python.org/)
[![Node 20](https://img.shields.io/badge/node-20-339933.svg?logo=node.js&logoColor=white)](https://nodejs.org/)
[![FastAPI](https://img.shields.io/badge/FastAPI-009688.svg?logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com/)
[![React 18](https://img.shields.io/badge/React-18-61DAFB.svg?logo=react&logoColor=black)](https://react.dev/)
[![TimescaleDB](https://img.shields.io/badge/TimescaleDB-Postgres%2016-FDB515.svg?logo=postgresql&logoColor=white)](https://www.timescale.com/)
[![Docker Compose](https://img.shields.io/badge/Docker%20Compose-v2-2496ED.svg?logo=docker&logoColor=white)](https://docs.docker.com/compose/)
[![Tests: 293 backend / 316 frontend](https://img.shields.io/badge/tests-609%20passing-2EA44F.svg)](#tests)

> [!WARNING]
> **Local single-user deployment only.** This project ships **without authentication** and is intentionally scoped to your own laptop on `localhost` only. `/admin/*` endpoints are unauthenticated. **Do not expose this to the internet as-is.** See [Security](#security) below.

---

## Table of contents

- [Features](#features)
- [Requirements](#requirements)
- [Quickstart](#quickstart)
- [UI snapshots](#ui-snapshots)
- [Stack](#stack)
- [Architecture](#architecture)
- [How to extend](#how-to-extend)
- [Make targets](#make-targets)
- [API endpoints](#api-endpoints)
- [Tests](#tests)
- [Documentation index](#documentation-index)
- [Security](#security)
- [Contributing](#contributing)
- [License](#license)

---

## Features

- **72 economic indicators**, 5 official sources, 12 thematic categories — see [docs/series.md](docs/series.md)
- **Daily auto-extraction** of 54 daily/event series Mon–Fri at 18:00 BRT (APScheduler)
- **17 statistical transforms** on demand (MoM, QoQ, YoY, annualized, log-diff, MA, EWMA, accumulated 12m, z-score, rebase=100, percentile) — pandas/numpy server-side, Redis-cached
- **Animated React dashboard**: 4 pages (Painel · Indices · Calendário · Metadados), pinning, per-card transforms, recent-history sparklines
- **True dark mode** with high-contrast grayscale surfaces, AAA text contrast, accent-blue interactive elements only
- **Plotly-style hover tooltips** on every chart and sparkline (date + value + unit)
- **Tinted sparklines** colour-coded per economic category for instant trend recognition
- **Animated chip toggles** with spring physics (respects `prefers-reduced-motion`)
- **pt-BR / EN i18n** — full app surface translates via a single sidebar toggle
- **Release calendar** scraped from IBGE + BCB (with hardcoded fallback)
- **Personal dossier** per series — methodology, source, frequency, current value, sparkline, pin/analysis actions
- **Time-series storage** in Postgres + TimescaleDB hypertable with full revision history
- **OpenAPI** schema + TypeScript codegen → frontend types stay in sync with backend

---

## Requirements

| Tool                | Min version | Notes                                                         |
|---------------------|-------------|----------------------------------------------------------------|
| **Docker Engine**   | 24.x        | Linux / macOS / Windows (WSL2)                                 |
| **Docker Compose**  | v2.20+      | Bundled with Docker Desktop; on Linux: `docker-compose-plugin` |
| **Disk**            | ~2 GB       | Postgres + Redis volumes + dependency caches                   |
| **RAM**             | 2 GB free   | 4 GB recommended for parallel test runs                        |
| **CPU**             | 2 cores     | Anything modern works                                          |
| **Network (first run)** | — | Outbound HTTPS to BCB, IBGE, ANBIMA, B3, Yahoo Finance to backfill |
| **Make**            | any GNU make | Optional but every workflow is one-line via `make`            |
| **Browser**         | Chromium 100+ / Firefox 100+ / Safari 16+ | For the React UI at `localhost:5174`        |

**No host-side Python or Node toolchain needed for runtime** — everything runs inside containers. (Local Python 3.12 + Node 20 only required if you want to run `make ci-local` outside Docker.)

---

## Quickstart

```bash
git clone git@github.com:IohanFaustino/pulse.git
cd pulse
cp .env.example .env

make up                                              # boot 4-service stack
sleep 10                                             # wait for postgres healthcheck
make migrate && make seed                            # schema + 72 series metadata
curl -X POST http://localhost:8000/admin/backfill    # ~3-5 min full history backfill
open http://localhost:5174                           # → dashboard
```

That's it. Everything runs locally on Docker.

---

## UI snapshots

> Add screenshots / GIFs to `docs/assets/` and reference them here once captured.

| Page | Description |
|------|-------------|
| `docs/assets/painel.png` | **Painel** — pinned series in a dense card grid with sparklines + delta badges |
| `docs/assets/indices.png` | **Indices** — full catalog grouped by category, each card colour-coded |
| `docs/assets/calendario.png` | **Calendário** — monthly grid of upcoming/past releases with category chips |
| `docs/assets/metadados.png` | **Metadados** — per-series dossier with hero value, tinted sparkline, action chips |
| `docs/assets/analysis.gif` | **Analysis panel** — chip-pop animation when picking a transform |

---

## Stack

| Layer | Tech |
|---|---|
| Frontend | Vite + React 18 + TypeScript + TanStack Query + Zustand |
| Backend | FastAPI + Pydantic v2 + SQLAlchemy 2.x async |
| Database | Postgres 16 + TimescaleDB hypertable (ADR-0002) |
| Cache | Redis 7 (transform results) |
| Scheduler | APScheduler — 3 cron jobs persisted in Postgres (ADR-0005) |
| Transforms | pandas + numpy, server-side (ADR-0003) |
| Deploy | Docker Compose, 4 services, single host |

---

## Architecture

**Modular monolith** (ADR-0001). Layered: `routers → services → repos → models`. Pydantic schemas at boundaries.

**Extraction flow:**
1. `scheduler.py` (APScheduler) fires `daily_batch` Mon–Fri 18:00 BRT plus monthly + calendar jobs.
2. Job → `services/extraction` → `extractors/registry.py` dispatches by source slug to a `SourceAdapter` subclass (BCB SGS · IBGE SIDRA · B3 portal · Yahoo · ANBIMA bulk XLSX).
3. Adapter returns normalised observations → `repos` upserts into the TimescaleDB hypertable. Revisions are kept (history table) — never overwrite blindly.

**Read + transform flow:**
1. `GET /series/{code}/observations` → repo query on the hypertable.
2. `POST /series/{code}/transform` with a `TransformSpec` → `transforms/registry.py` resolves the op in `transforms/ops.py` (17 ops) → result cached in Redis (ADR-0006), invalidated when new data arrives.

**Frontend:** types are codegen'd from `/openapi.json` into `frontend/src/api/schema.ts` (ADR-0004) — the backend is the source of truth, never hand-edit.

<details>
<summary><strong>Full project layout</strong></summary>

```
pulse/
├── README.md                ← this file
├── docker-compose.yml       ← 4-service stack
├── Makefile                 ← `make up | down | test | seed | migrate`
├── .env.example             ← env contract
├── LICENSE                  ← MIT
├── SECURITY.md              ← responsible disclosure policy
│
├── backend/                 ← FastAPI app
│   ├── pyproject.toml
│   ├── Dockerfile           ← multi-stage
│   ├── alembic/             ← migrations 0001..0004
│   ├── data/
│   │   ├── series.seed.json ← 72 series metadata
│   │   └── calendar.json    ← release calendar hardcoded fallback
│   ├── src/api_extractor/
│   │   ├── main.py          ← FastAPI app + lifespan
│   │   ├── config.py
│   │   ├── db.py
│   │   ├── models/          ← SQLAlchemy: series, observation, revision, release, user_prefs
│   │   ├── schemas/         ← Pydantic request/response
│   │   ├── repos/           ← async data access
│   │   ├── services/        ← extraction, backfill, transforms
│   │   ├── routers/         ← /series /transform /releases /user_prefs /admin /health
│   │   ├── extractors/      ← 5 adapters (BCB, IBGE, B3 portal, Yahoo, ANBIMA bulk)
│   │   ├── transforms/      ← 17 ops + Redis cache
│   │   ├── calendar_scraper/← IBGE + BCB scrape + hardcoded fallback
│   │   ├── scheduler.py     ← APScheduler
│   │   ├── jobs.py          ← daily_batch / periodic_batch / calendar_refresh
│   │   └── scripts/         ← one-shot tools (backfill)
│   └── tests/               ← 293 pytest tests + fixtures per source
│
├── frontend/                ← Vite app
│   ├── package.json
│   ├── vite.config.ts
│   └── src/
│       ├── pages/           ← Painel · Indices · Calendario · Metadados
│       ├── components/      ← Sidebar, Card, SmallMultiple, AnalysisPanel,
│       │                     Chart, TransformModal, DailyRow, DailyTable,
│       │                     DayDetailModal, Sparkline, DeltaBadge, ...
│       ├── hooks/           ← TanStack Query wrappers
│       ├── lib/             ← formatPtBR, categoryColor, deltaSemantics
│       ├── stores/          ← Zustand UI state
│       ├── styles/          ← design tokens (tokens.css)
│       └── api/             ← schema.ts (openapi-typescript codegen)
│
├── docs/                    ← all documentation
│   ├── PLAN.md              ← phased build log
│   ├── USER-GUIDE.md        ← operational manual
│   ├── series.md            ← full 72-series catalog
│   ├── roadmap.md           ← upcoming series + ideas
│   ├── architecture/        ← system design + diagrams
│   ├── adr/                 ← 8 architecture decision records
│   ├── data-sources/        ← per-source API contracts
│   └── assets/              ← logo + screenshots
│
├── infra/postgres/init.sql  ← timescaledb extension bootstrap
└── .github/                 ← workflows · issue templates · PR template · CODEOWNERS
```

</details>

---

## How to extend

1. **Add a new series**:
   - Append entry to `backend/data/series.seed.json` with `code`, `name`, `category`, `source`, `source_id`, `frequency`, `unit`, `currency`, `is_proxy`, `first_observation`.
   - If `source = "IBGE SIDRA"`: also add to `IBGE_VARIABLE_MAP` in `backend/src/api_extractor/extractors/ibge_sidra.py`.
   - Run `make seed` then `curl -X POST http://localhost:8000/admin/extract/{code}`.

2. **Add a new source**:
   - Subclass `SourceAdapter` in `backend/src/api_extractor/extractors/base.py`.
   - Register in `backend/src/api_extractor/extractors/registry.py` (`_SOURCE_SLUG_MAP` + `_ADAPTERS`).
   - Document in `docs/data-sources/{slug}.md` (endpoint + auth + response shape).
   - Add tests + fixture.

3. **Add a new transform**:
   - Add the function to `backend/src/api_extractor/transforms/ops.py`.
   - Register in `transforms/registry.py::TRANSFORMS`.
   - Extend the `TransformSpec.op` Literal in `transforms/spec.py`.
   - Add a chip in `frontend/src/components/AnalysisPanel/`.
   - Add a unit test in `backend/tests/test_transforms.py`.

---

## Make targets

```
make up           # start all 4 containers
make down         # stop (volumes preserved)
make logs         # stream all logs (service=api for one)
make migrate      # alembic upgrade head
make seed         # load 72 series metadata
make test         # backend pytest suite
make lint         # ruff check
make fmt          # black format
make typecheck    # mypy
make ci-local     # replicate CI checks locally
make secrets-scan # gitleaks against working tree
make shell-api    # bash in api container
make shell-db     # psql in postgres
```

---

## API endpoints

| Method | Path | Purpose |
|---|---|---|
| GET | `/series` | List all 72 + status |
| GET | `/series/{code}` | Single series metadata |
| GET | `/series/{code}/observations?from=&to=&limit=` | Raw observations |
| POST | `/series/{code}/transform` | Apply a transform spec |
| GET | `/releases?month=YYYY-MM&category=` | Calendar events |
| GET/PATCH | `/user_prefs` | Pins + transforms + recents |
| POST | `/admin/extract/{code}` | Manual extract one series |
| POST | `/admin/backfill` | Manual backfill all series |
| POST | `/admin/refresh-calendar` | Refresh release calendar |
| GET/POST | `/admin/scheduler/...` | List + trigger scheduler jobs |
| GET | `/health` | Status + per-series freshness |

Example transform request:

```bash
curl -X POST http://localhost:8000/series/IPCA/transform \
  -H "Content-Type: application/json" \
  -d '{"op":"yoy"}'
```

Full interactive docs: `http://localhost:8000/docs` (Swagger) · `/redoc` · `/openapi.json`.

---

## Tests

- **Backend** (pytest): **293 pass / 2 skip** — adapter contracts, transforms, repos, API routes, acceptance criteria
- **Frontend** (vitest): **316 pass / 0 TS errors** — components, hooks, pages, integration

```bash
make test                                 # backend
docker compose exec web npm run test      # frontend
docker compose exec web npm run typecheck # frontend types
```

CI runs both on every push/PR via `.github/workflows/ci.yml`.

---

## Documentation index

| File | Purpose |
|---|---|
| [docs/USER-GUIDE.md](docs/USER-GUIDE.md) | Operational manual (services, endpoints, troubleshooting) |
| [docs/series.md](docs/series.md) | Full 72-series catalog grouped by theme |
| [docs/roadmap.md](docs/roadmap.md) | Upcoming series + ideas |
| [docs/PLAN.md](docs/PLAN.md) | Full build log: 22 phases, agent matrix, deviation tracking |
| [docs/architecture/system-design.md](docs/architecture/system-design.md) | System diagrams + data model |
| [docs/adr/](docs/adr/) | 8 architecture decision records |
| [docs/data-sources/](docs/data-sources/) | Per-source API contracts (BCB, IBGE, B3 portal, Yahoo, ANBIMA, calendar) |
| [docs/SECURITY-AUDIT-PREGITHUB.md](docs/SECURITY-AUDIT-PREGITHUB.md) | Pre-push security findings |
| [specs/api-extractor.spec.md](specs/api-extractor.spec.md) | EARS specification + acceptance criteria |

---

## Security

This project ships **without authentication** and is intentionally scoped to a **local, single-user, trusted-network deployment** (your own laptop, behind your own firewall, on `localhost` ports only).

**Do NOT expose this to the internet as-is.** Specifically:

- `/admin/*` endpoints are unauthenticated and let any caller trigger backfills, refresh the calendar, fire scheduler jobs, and overwrite user prefs.
- Postgres defaults to `postgres / postgres` from `.env.example`. Replace before any non-local deploy.
- Redis is published without auth on `localhost:6379`. Do not bind to public interfaces.
- The FastAPI service listens on `0.0.0.0:8000` inside the container. Map only to `127.0.0.1:8000` if you publish ports.
- CORS allows the dev frontend origin. Tighten or remove for any non-local deploy.

If you want to deploy to a VPS or share with others:

1. Add an auth layer (FastAPI Users / OAuth2 reverse proxy / Cloudflare Access).
2. Strengthen `.env` (rotate Postgres + Redis credentials).
3. Move secrets out of `.env` into a secret manager (Vault, AWS Secrets Manager, Doppler).
4. Bind containers to loopback or place behind a reverse proxy (Caddy, nginx, Traefik) with TLS.
5. Review [docs/SECURITY-AUDIT-PREGITHUB.md](docs/SECURITY-AUDIT-PREGITHUB.md) Section E (production-deployment caveats).

For local personal use as intended, none of this matters.

To report a vulnerability privately, see [SECURITY.md](SECURITY.md).

---

## Contributing

Issues and PRs welcome. See [.github/ISSUE_TEMPLATE/](.github/ISSUE_TEMPLATE/) and [.github/PULL_REQUEST_TEMPLATE.md](.github/PULL_REQUEST_TEMPLATE.md) to get started.

Before opening a PR:

```bash
make ci-local       # replicate CI: ruff + pytest + tsc + prettier
make secrets-scan   # gitleaks against working tree
```

---

## License

MIT — see [LICENSE](LICENSE). Permissive: use freely, modify, redistribute. No warranty.

Brand assets / official names of indices (IPCA, IBOVESPA, IMA, etc.) belong to their respective publishers (IBGE, BCB, B3, ANBIMA, S&P, MSCI, FTSE, etc.). This project pulls publicly available data via documented endpoints and does not redistribute it independently.
