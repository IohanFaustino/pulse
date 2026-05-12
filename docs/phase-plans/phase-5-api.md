# Phase 5: REST API Routers + OpenAPI Export + Extraction Orchestration

**Agent:** fastapi-developer  **Wave:** W3  **Skills:** fastapi-expert, api-designer, secure-code-guardian

---

## Files owned

### Create
- `backend/src/api_extractor/schemas/__init__.py`
- `backend/src/api_extractor/schemas/common.py`      — HealthResponse, ErrorResponse, PaginationMeta
- `backend/src/api_extractor/schemas/series.py`      — SeriesRead, SeriesListResponse
- `backend/src/api_extractor/schemas/observation.py` — ObservationRead, ObservationListResponse
- `backend/src/api_extractor/schemas/transform.py`   — TransformRequest, TransformResponse
- `backend/src/api_extractor/schemas/release.py`     — ReleaseRead, ReleaseListResponse
- `backend/src/api_extractor/schemas/user_prefs.py`  — UserPrefsRead, UserPrefsUpdate
- `backend/src/api_extractor/schemas/admin.py`       — ExtractionResultResponse
- `backend/src/api_extractor/deps.py`                — FastAPI dependency functions
- `backend/src/api_extractor/extractors/registry.py` — get_adapter(source) -> SourceAdapter
- `backend/src/api_extractor/services/__init__.py`
- `backend/src/api_extractor/services/extraction_service.py`
- `backend/src/api_extractor/routers/__init__.py`
- `backend/src/api_extractor/routers/health.py`
- `backend/src/api_extractor/routers/series.py`
- `backend/src/api_extractor/routers/transform.py`
- `backend/src/api_extractor/routers/release.py`
- `backend/src/api_extractor/routers/user_prefs.py`
- `backend/src/api_extractor/routers/admin.py`
- `backend/src/api_extractor/openapi_export.py`
- `backend/tests/test_api_health.py`
- `backend/tests/test_api_series.py`
- `backend/tests/test_api_transform.py`
- `backend/tests/test_api_release.py`
- `backend/tests/test_api_user_prefs.py`
- `backend/tests/test_api_admin_extract.py`
- `backend/tests/test_openapi_schema.py`
- `backend/tests/test_api_acceptance.py`

### Edit
- `backend/src/api_extractor/main.py` — lifespan, router includes, CORS, exception handlers, OpenAPI metadata

### Do NOT touch
- `models/`, `repos/`, `extractors/{base,bcb_sgs,ibge_sidra,b3_yahoo}.py`
- `transforms/`, `calendar_scraper/`, `alembic/`, `seed.py`, `docker-compose.yml`
- Any existing test file (conftest.py, test_transforms.py, test_extractor_*.py, etc.)

---

## Interfaces

### Consumed (from prior phases)
- `SeriesRepo` — `get(code)`, `list_all()`, `list_by_category(category)`, `update_status(...)`
- `ObservationRepo` — `get_range(code, from_dt, to_dt)`, `get_latest_n(code, n)`, `bulk_upsert(code, rows)`
- `ReleaseRepo` — `list_by_month(year, month)`, `list_by_series(code)`
- `UserPrefsRepo` — `get_or_create()`, `list_pins()`, `pin(code)`, `unpin(code)`, `list_transforms()`, `set_transform(code, spec)`, `remove_transform(code)`, `update_recents(code)`
- `TransformService.run(series_code, spec, frequency, observations)` → dict
- `TransformSpec` from `transforms.spec`
- `BCBSGSAdapter`, `IBGESidraAdapter`, `B3YahooAdapter` from extractors
- `SourceAdapter`, `ExtractionError` from `extractors.base`
- `async_session_factory` from `db.py`
- Redis asyncio client (opened in lifespan)

### Produced (for downstream — Phase 8 frontend)
- HTTP REST endpoints at top-level paths (no `/api/v1` prefix)
- `/openapi.json` — valid OpenAPI 3.x schema
- All routes have `tags`, `summary`, `response_model`, `responses` for clean codegen
- `openapi_export.py` CLI writes `backend/openapi.json`

---

## API surface

| Method | Path | Tags | Response model |
|---|---|---|---|
| GET | `/health` | health | HealthResponse |
| GET | `/series` | series | SeriesListResponse |
| GET | `/series/{code}` | series | SeriesRead |
| GET | `/series/{code}/observations` | series | ObservationListResponse |
| POST | `/series/{code}/transform` | transform | TransformResponse |
| GET | `/releases` | releases | ReleaseListResponse |
| GET | `/user_prefs` | user_prefs | UserPrefsRead |
| PATCH | `/user_prefs` | user_prefs | UserPrefsRead |
| POST | `/admin/extract/{code}` | admin | ExtractionResultResponse |

---

## Routing decision: no /api/v1 prefix

Top-level paths match the Vite proxy config (`/api → http://localhost:8000`) — confirmed in docker-compose.yml. All routes mount at root. Frontend proxy strips no prefix, so `/series` on the backend matches `/series` in the browser via proxy.

---

## PATCH /user_prefs contract

Body `UserPrefsUpdate` contains optional fields:
- `add_pins: list[str] | None` — codes to pin (idempotent)
- `remove_pins: list[str] | None` — codes to unpin
- `card_transforms: dict[str, TransformSpec | None] | None` — map code → spec; `null` removes
- `recents: list[str] | None` — full replacement of recents list (max 3)

All fields optional; unset fields are unchanged. Returns full `UserPrefsRead`.

---

## ExtractionService design

`ExtractionService.run_for(series_code, session)`:
1. Fetch Series row via `SeriesRepo.get(code)` — 404 if missing
2. Determine `since`: `series.last_success_at.date()` if set, else `None` (full backfill)
3. Look up adapter via `registry.get_adapter(series.source)`
4. Call `adapter.fetch(series, since)` — raises `ExtractionError` on total failure
5. Bulk upsert via `ObservationRepo.bulk_upsert(code, rows)`
6. Update `series.status`, `last_extraction_at`, `last_success_at` via `SeriesRepo.update_status`
7. Return `ExtractionResultResponse(count, latest_obs, status)`

Advisory lock deferred — single-user local deploy, scheduler not yet running (W6). Safe to skip for W3 manual trigger endpoint.

---

## Adapter registry slug normalization

`Series.source` values → adapter:
- `"BCB SGS"` → `BCBSGSAdapter()`
- `"IBGE SIDRA"` → `IBGESidraAdapter()`
- `"Yahoo Finance"` | `"B3"` → `B3YahooAdapter()`

Normalization: lowercase + replace space with underscore + strip trailing "finance":
```python
_SOURCE_MAP = {
    "bcb sgs": "bcb_sgs",
    "ibge sidra": "ibge_sidra",
    "yahoo finance": "b3_yahoo",
    "b3": "b3_yahoo",
}
```

---

## Test strategy

All API tests use `httpx.AsyncClient(transport=ASGITransport(app=app))` — in-process, no live server needed. DB is the live Docker Compose postgres (same as existing tests). Redis is live Docker Compose redis.

### Dependency overrides for extraction tests
`test_api_admin_extract.py` overrides `get_extraction_service()` with a mock that captures calls, avoiding live network fetches.

### Per-file coverage

| File | Tests |
|---|---|
| `test_api_health.py` | 200 status, `status` field, `series` list with `code`+`status`+`last_success_at` |
| `test_api_series.py` | list all, list by category, get one, get observations with from/to/limit, 404 on unknown |
| `test_api_transform.py` | apply transform, values+metadata shape, cache hit on second call, 422 on bad op, 404 on unknown series |
| `test_api_release.py` | list by month, list by month+category, empty month |
| `test_api_user_prefs.py` | GET default empty, PATCH add_pins, PATCH remove_pins, PATCH card_transforms, PATCH recents, idempotency |
| `test_api_admin_extract.py` | mock adapter → verify count+status, series updated, 404 on unknown |
| `test_openapi_schema.py` | /openapi.json valid 3.x, every path has summary+tags+response model |
| `test_api_acceptance.py` | AC-2 pin via PATCH, AC-3 transform persists, AC-6 NaN gap in metadata, AC-7 empty user_prefs |

---

## Acceptance criteria mapped

| AC | Test |
|---|---|
| AC-2 (pin → Painel) | `test_api_acceptance.py::test_ac2_pin_to_painel` |
| AC-3 (transform persists) | `test_api_acceptance.py::test_ac3_transform_application` |
| AC-6 (NaN gap metadata) | `test_api_acceptance.py::test_ac6_nan_gap_in_metadata` |
| AC-7 (empty user_prefs) | `test_api_acceptance.py::test_ac7_empty_user_prefs` |
| FR-1 (extraction trigger) | `test_api_admin_extract.py` |
| FR-3 (transform compute) | `test_api_transform.py` |
| FR-4 (pin/unpin) | `test_api_user_prefs.py` |
| FR-5 (health freshness) | `test_api_health.py` |
| FR-7 (metadata dossier) | `test_api_series.py::test_get_one_series_metadata` |

---

## Risks + mitigations

| Risk | Mitigation |
|---|---|
| `ObservationRepo.get_range` needs tz-aware datetimes; query params arrive as strings | Parse ISO-8601 date → `datetime(tz=utc)` in router; reject malformed via Pydantic validators |
| `TransformService.run` expects obs as `list[dict]` with `observed_at`+`value`; repo returns ORM objects | Map in transform router: `[{"observed_at": o.observed_at, "value": o.value} for o in obs]` |
| Large observation ranges (SELIC daily since 1986 = ~10k rows) could exceed default limit | Apply `limit` query param with max cap 5000; default 500 |
| `/releases?category=` requires JOIN to series table (releases has no category column) | ReleaseRepo: add `list_by_month_and_category` that joins Series; or filter in service layer |
| `B3YahooAdapter` uses `yfinance` (sync, slow, network) in admin extract | In tests, override `get_extraction_service` dep; in prod, runs fine async via `asyncio.to_thread` |
| No auth in v1 — admin extract endpoint open | Acceptable per spec (single-user local); document in OpenAPI description |
| `UserPrefsRepo.update_recents` takes single code; PATCH recents is full replacement | Implement recents as direct assignment in service layer rather than calling `update_recents` |

---

## Background services needed

- Postgres at `postgres:5432` — running (Docker Compose healthy)
- Redis at `redis:6379` — running (Docker Compose healthy)
- API container runs tests via `docker compose exec api pytest`
