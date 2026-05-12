# Phase 0: Bootstrap

**Agent:** devops-engineer  **Wave:** W0  **Skills:** devops-engineer, update-config

---

## Files owned

### Create (new files)

| Path | Purpose |
|---|---|
| `docker-compose.yml` | Four-service stack: api, postgres, redis, web |
| `.env.example` | Environment variable contract for all services |
| `Makefile` | Developer workflow targets |
| `.pre-commit-config.yaml` | Code quality hooks config (not installed — no git yet) |
| `.gitignore` | Python + Node + Docker + editor exclusions |
| `README.md` | Quickstart: make up |
| `infra/postgres/init.sql` | CREATE EXTENSION timescaledb; for automatic init |
| `backend/Dockerfile` | Multi-stage: deps layer + slim runtime |
| `backend/pyproject.toml` | Python project + all runtime + dev dependencies |
| `backend/src/api_extractor/__init__.py` | Package marker |
| `backend/src/api_extractor/main.py` | FastAPI app stub with /health endpoint |
| `backend/tests/__init__.py` | Test package marker |
| `docs/phase-plans/phase-0-bootstrap.md` | This file |

### Directory skeleton (mkdir only, no files)

```
backend/src/api_extractor/models/
backend/src/api_extractor/schemas/
backend/src/api_extractor/repos/
backend/src/api_extractor/services/
backend/src/api_extractor/routers/
backend/src/api_extractor/extractors/
backend/src/api_extractor/transforms/
backend/src/api_extractor/calendar_scraper/
backend/data/
backend/alembic/versions/
frontend/src/
frontend/public/
infra/postgres/
infra/redis/
```

---

## Interfaces

### Consumed
- None (Wave W0 is the root).

### Produced (consumed by downstream phases)

| Interface | Consumer | Description |
|---|---|---|
| `docker-compose` service names: `api`, `postgres`, `redis`, `web` | All phases | Service DNS names used in DATABASE_URL, REDIS_URL |
| `DATABASE_URL=postgresql+asyncpg://...` | Phase 1 (SQLAlchemy async engine) | Async DSN format |
| `REDIS_URL=redis://redis:6379/0` | Phase 4 (transform cache) | Standard Redis URL |
| FastAPI app at `http://localhost:8000` | Phase 5 (API contract tests) | Base URL |
| `GET /health` → `{"status": "ok"}` | Phase 3 (health enhancement), Phase 9 (sync indicator) | Baseline health contract |
| `backend/pyproject.toml` dep list | All backend phases | Single source of truth for Python deps |
| `Makefile` targets: up, down, logs, migrate, seed, test, fmt, lint, typecheck | All phases | Workflow entry points |

---

## Test strategy

| Verification | Command | Expected result |
|---|---|---|
| Compose stack up | `docker compose ps` | api, postgres, redis containers present and running |
| TimescaleDB extension | `docker compose exec postgres psql -U postgres -d api_extractor -c "SELECT extversion FROM pg_extension WHERE extname='timescaledb'"` | Returns a version string (e.g., `2.17.2`) |
| Redis connectivity | `docker compose exec redis redis-cli PING` | `PONG` |
| Health endpoint | `curl -s http://localhost:8000/health` | `{"status":"ok"}` with HTTP 200 |
| Lint passes | `make lint` | ruff exits 0 on backend/src/ |

---

## Risks + mitigations

| Risk | Mitigation |
|---|---|
| `timescale/timescaledb:latest-pg16` tag drifts | Use latest-pg16 as per ADR-0002 spec; document pinned digest in README. Switch to semver tag in Phase 1 if breakage occurs. |
| TimescaleDB extension not auto-enabled | `infra/postgres/init.sql` runs at container first-start via `/docker-entrypoint-initdb.d/` mount; explicitly `CREATE EXTENSION IF NOT EXISTS timescaledb CASCADE;` |
| Port conflicts on developer machine (5432, 6379, 8000, 5173) | Document in README. No fix in Phase 0 — operator adjusts if needed. |
| `web` service has no Vite project yet | Use `node:20-alpine` with `tail -f /dev/null` placeholder command; real Vite scaffold in Phase 7. Service exists so Docker Compose network is complete. |
| `yfinance` not in original dep list in spec instruction | Add to pyproject.toml — mentioned in system-design §3.4 and PLAN §8. Required for B3/Yahoo adapter in Phase 2. |
| Multi-stage Dockerfile cache busting on dep changes | Copy pyproject.toml before src/ so pip install layer caches independently of code changes. |

---

## Background services after this phase

| Service | Starts in | How to check | Tear down |
|---|---|---|---|
| postgres | `make up` or `docker compose up -d postgres` | `docker compose ps` → healthy | `make down` |
| redis | `make up` or `docker compose up -d redis` | `docker compose exec redis redis-cli PING` | `make down` |
| api | `docker compose up -d api` | `curl http://localhost:8000/health` | `make down` |
| web | placeholder only in Phase 0 | `docker compose ps` | `make down` |

---

## Success criteria (mapped to spec)

| Spec item | Verified by |
|---|---|
| PLAN §6 Phase 0 checklist — all 5 items | File existence checks + docker compose ps |
| system-design §9 topology — 4 containers | `docker compose ps` shows 4 services |
| ADR-0002 TimescaleDB | `SELECT extversion FROM pg_extension WHERE extname='timescaledb'` returns row |
| NFR-2 `/health` endpoint exists | `curl http://localhost:8000/health` → 200 `{"status":"ok"}` |
