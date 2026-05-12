# Phase 1: Data Layer

**Agent:** python-pro  **Wave:** W1  **Skills:** python-pro, postgres-pro, sql-pro

---

## Files owned

### Create (new files)

| Path | Purpose |
|---|---|
| `docker-compose.yml` | Edit only: pin postgres image to `timescale/timescaledb:2.26.4-pg16` |
| `backend/src/api_extractor/config.py` | Pydantic-settings: DATABASE_URL, REDIS_URL |
| `backend/src/api_extractor/db.py` | Async engine, session factory, DeclarativeBase |
| `backend/src/api_extractor/models/__init__.py` | Re-export all models |
| `backend/src/api_extractor/models/series.py` | Series ORM model |
| `backend/src/api_extractor/models/observation.py` | Observation ORM model (hypertable) |
| `backend/src/api_extractor/models/revision.py` | Revision ORM model |
| `backend/src/api_extractor/models/release.py` | Release ORM model |
| `backend/src/api_extractor/models/user_prefs.py` | UserPrefs, Pin, CardTransform ORM models |
| `backend/src/api_extractor/repos/__init__.py` | Re-export repos |
| `backend/src/api_extractor/repos/base.py` | BaseRepo with async session injection |
| `backend/src/api_extractor/repos/series_repo.py` | SeriesRepo: get, list, upsert, update_status |
| `backend/src/api_extractor/repos/observation_repo.py` | ObservationRepo: bulk_upsert, get_range, get_latest_n |
| `backend/src/api_extractor/repos/release_repo.py` | ReleaseRepo: get, list_by_month, upsert |
| `backend/src/api_extractor/repos/user_prefs_repo.py` | UserPrefsRepo: get_or_create, pin, unpin, set_transform |
| `backend/alembic.ini` | Alembic config pointing to env var DATABASE_URL |
| `backend/alembic/env.py` | Async Alembic env with target_metadata |
| `backend/alembic/script.py.mako` | Migration template |
| `backend/alembic/versions/0001_initial.py` | DDL: 7 tables + hypertable + indexes |
| `backend/data/series.seed.json` | 25 series seed records |
| `backend/src/api_extractor/seed.py` | CLI: upsert series.seed.json into series table |
| `backend/tests/conftest.py` | Pytest fixtures: async engine, session, repos |
| `backend/tests/test_repos_series.py` | CRUD round-trip on SeriesRepo |
| `backend/tests/test_repos_observation.py` | Upsert, range query, latest N, revision on change |
| `backend/tests/test_migration_hypertable.py` | Verify observations is TimescaleDB hypertable |
| `backend/tests/test_seed.py` | Load seed, verify 25 rows in series table |

### Edit (existing files)

| Path | Change |
|---|---|
| `docker-compose.yml` | Pin postgres image; add alembic + data volume mounts to api service |

### Do NOT touch

- `backend/src/api_extractor/main.py`
- `backend/src/api_extractor/extractors/`
- `backend/src/api_extractor/transforms/`
- `backend/src/api_extractor/scheduler.py` (does not exist yet)

---

## Interfaces

### Consumed (from Phase 0)
- `docker-compose` services: `postgres` (port 5432 internal, 5433 host), `redis` (6379)
- `DATABASE_URL=postgresql+asyncpg://postgres:postgres@postgres:5432/api_extractor`
- `pyproject.toml` deps: sqlalchemy, asyncpg, alembic, pydantic-settings (all pinned)
- `backend/src/api_extractor/main.py` (do not modify)

### Produced (consumed by Phase 2+)

| Interface | Consumer | Description |
|---|---|---|
| `SeriesRepo.get(code)` | Phase 2 extractors, Phase 5 routers | Fetch single series |
| `SeriesRepo.upsert(data)` | Phase 2 | Create or update series metadata |
| `SeriesRepo.update_status(code, status, ts)` | Phase 2 | Update extraction state |
| `ObservationRepo.bulk_upsert(obs_list)` | Phase 2 | Idempotent batch insert with revision detection |
| `ObservationRepo.get_range(code, from_dt, to_dt)` | Phase 4 transforms, Phase 5 routers | Range query |
| `ObservationRepo.get_latest_n(code, n)` | Phase 5 sparkline endpoint | Last N observations |
| `ReleaseRepo.list_by_month(year, month)` | Phase 6 calendar, Phase 5 releases endpoint | Month calendar |
| `UserPrefsRepo.get_or_create()` | Phase 5 user_prefs endpoint | Single-row user prefs |
| `UserPrefsRepo.pin(series_code)` | Phase 5 | Add pin |
| `UserPrefsRepo.unpin(series_code)` | Phase 5 | Remove pin |
| `UserPrefsRepo.set_transform(series_code, spec)` | Phase 5 | Persist card transform |
| `Base` (DeclarativeBase) | Alembic env.py | Metadata for autogenerate |
| Migration `0001_initial` | CI / make migrate | 7 tables + hypertable |

---

## Test strategy

| Test | File | What it proves |
|---|---|---|
| Series CRUD round-trip | `test_repos_series.py` | get/list/upsert/update_status correct |
| Observation upsert idempotent | `test_repos_observation.py::test_bulk_upsert_idempotent` | ON CONFLICT no error, same value |
| Observation upsert revision | `test_repos_observation.py::test_bulk_upsert_creates_revision` | Changed value → revision row |
| Range query | `test_repos_observation.py::test_get_range` | Returns obs between dates |
| Latest N | `test_repos_observation.py::test_get_latest_n` | Returns N most recent |
| Hypertable exists | `test_migration_hypertable.py` | Query timescaledb_information.hypertables |
| Seed count | `test_seed.py` | 25 rows in series table after seed |

All tests use real Postgres (localhost:5433 from host, or postgres:5432 from within container). No SQLite. A `conftest.py` fixture creates tables via `Base.metadata.create_all` on a test schema or reuses the migration-applied DB.

---

## Acceptance criteria mapped

| Spec item | Test |
|---|---|
| FR-2.1 TimescaleDB hypertable | `test_migration_hypertable.py` |
| FR-2.2 Update on value change only | `test_bulk_upsert_creates_revision` |
| FR-2.3 Revision history | `test_bulk_upsert_creates_revision` |
| NFR-4 UNIQUE(series_code, observed_at) at DB level | `test_bulk_upsert_idempotent` (constraint enforced) |
| NFR-4 FK user_prefs → series | Schema DDL in migration |
| PLAN §6 Phase 1 checklist — all 6 items | Collective test suite green |

---

## Risks + mitigations

| Risk | Mitigation |
|---|---|
| Alembic not mounted in api container | Also mount `./backend/alembic:/app/alembic:ro` and `./backend/alembic.ini:/app/alembic.ini:ro` in docker-compose; run `alembic upgrade head` from host pointing to localhost:5433 as fallback |
| `series.seed.json` not in api container | Mount `./backend/data:/app/data:ro` in docker-compose |
| TimescaleDB rejects PK without partition col | PK is `(series_code, observed_at)` — partition col included, satisfies TimescaleDB requirement |
| `create_hypertable` fails if table has data | Migration runs hypertable creation before any inserts; seed runs after migration |
| `env.py` async support requires `asyncio` runner | Use `asyncio.run(run_async_migrations())` pattern with `AsyncEngine.begin()` in env.py online mode |
| Test isolation — tests pollute production DB | `conftest.py` uses a dedicated test schema or runs against a test DB; use `anyio` or `pytest-asyncio` with function-scoped sessions and rollback |
| `IFIX` source_id — B3 ticker not confirmed | Seed uses best-effort `IFIX.SA` (yfinance convention); flagged as TBD for Phase 2 research |

---

## Background services needed

- `postgres` — started in W0, expected healthy on port 5433 (host)
- `redis` — started in W0, expected healthy (not needed for Phase 1 but must stay healthy)
- `api` — must be rebuilt after docker-compose.yml edit (new mounts); run migrations via `docker compose exec api alembic upgrade head`
