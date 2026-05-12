# Phase 4: Transform Engine

**Agent:** python-pro  **Wave:** W2  **Skills:** python-pro, pandas-pro, test-master

---

## Files owned

### Create
- `backend/src/api_extractor/transforms/__init__.py`
- `backend/src/api_extractor/transforms/spec.py`
- `backend/src/api_extractor/transforms/ops.py`
- `backend/src/api_extractor/transforms/registry.py`
- `backend/src/api_extractor/transforms/cache.py`
- `backend/src/api_extractor/transforms/service.py`
- `backend/tests/test_transforms.py`
- `backend/tests/test_transform_cache.py`

### Do NOT touch
- `extractors/*`, `calendar_scraper/*`, `routers/*`, `scheduler.py`
- `frontend/`, `docker-compose.yml`
- Any existing test file

---

## Interfaces

### Consumed (from Phase 1)
- `api_extractor.models.observation.Observation` — `.observed_at: datetime`, `.value: Decimal`
- `api_extractor.repos.observation_repo.ObservationRepo` — returns `list[Observation]`
- `api_extractor.models.series.Series` — `.frequency: str`
- Redis 7 at `redis://redis:6379` (already running in Docker Compose)

### Produced (for Phase 5 / API layer)
- `TransformSpec` — Pydantic v2 model with `.op` Literal and `.params: dict`
- `TransformService.run(series_code, spec, frequency, observations) -> TransformResult`
- `TransformResult` — `{values: list[{date: str, value: float | None}], metadata: {gaps: list, stub: bool}}`

---

## Transform ops specification

| Op | Group | Computation | Params |
|---|---|---|---|
| `level` | Original | passthrough | — |
| `sa` | Original | stub (passthrough + warning) | — |
| `calendar_adj` | Original | stub (passthrough + warning) | — |
| `mom` | Variation | `pct_change(1) * 100` | — |
| `qoq` | Variation | `pct_change(3)` for quarterly; freq-aware | — |
| `yoy` | Variation | `pct_change(periods_per_year) * 100` | — |
| `annualized` | Variation | `(1 + mom/100)^ppy - 1) * 100` | — |
| `diff` | Variation | `diff(1)` (first difference) | — |
| `log_diff` | Variation | `log(s).diff(1) * 100` | — |
| `pp` | Variation | `diff(1)` (percentage points, same as diff for point series) | — |
| `ma` | Smoothing | `rolling(window).mean()` | `window: int` (default 12) |
| `ewma` | Smoothing | `ewm(span=span).mean()` | `span: int` (default 12) |
| `accum12` | Windows | `((1 + s/100).rolling(12).apply(prod) - 1) * 100` | — |
| `stddev12` | Windows | `rolling(12).std()` | — |
| `rebase` | Normalization | `s / s.first_valid() * base` | `base: float` (default 100) |
| `zscore` | Normalization | `(s - s.mean()) / s.std()` | — |
| `percentile` | Normalization | `s.rank(pct=True) * 100` | — |

### `periods_per_year` inference
- `daily` → 252
- `monthly` → 12
- `quarterly` → 4
- `event` / unknown → 1 (safe fallback)
- Cross-check: infer from index median diff if frequency string unavailable

---

## Cache key strategy (per ADR-0006)
```
key = f"transform:{series_code}:{spec.hash()}:{latest_observed_at.isoformat()}"
```
- `spec.hash()` = SHA-256 of canonical JSON `{"op": ..., "params": {sorted keys}}`
- `latest_observed_at` = UTC isoformat of max `observed_at` in loaded observations
- Value stored = gzip-compressed JSON bytes
- TTL: `daily=3600`, `monthly=86400`, `quarterly=604800`

---

## Test strategy

### `test_transforms.py` — pure pandas, no I/O
All tests use synthetic `pd.Series` with `DatetimeIndex`. No DB, no Redis.

| Test | Op | Assertion |
|---|---|---|
| `test_level_passthrough` | level | values unchanged |
| `test_sa_stub_returns_warning` | sa | values unchanged + metadata stub=True |
| `test_calendar_adj_stub` | calendar_adj | same as sa |
| `test_mom_monthly` | mom | pct_change(1)*100 correct |
| `test_yoy_monthly_pct_change_12` | yoy | pct_change(12)*100, freq=monthly |
| `test_yoy_daily_pct_change_252` | yoy | pct_change(252)*100, freq=daily |
| `test_qoq_quarterly` | qoq | pct_change(4)*100 |
| `test_annualized_from_monthly` | annualized | `(1+mom/100)^12-1)*100` |
| `test_diff_first_difference` | diff | diff(1) |
| `test_log_diff` | log_diff | np.log(s).diff(1)*100 |
| `test_pp_equals_diff` | pp | diff(1), same as diff |
| `test_ma_window_3` | ma | rolling(3).mean() |
| `test_ma_window_6` | ma | rolling(6).mean() |
| `test_ma_window_12` | ma | rolling(12).mean() |
| `test_ewma_span` | ewma | ewm(span=6).mean() |
| `test_accum12_compound` | accum12 | synthetic IPCA-style: 1%/month × 12 → ~12.68% |
| `test_stddev12` | stddev12 | rolling(12).std() |
| `test_rebase_base100` | rebase | first value → 100 |
| `test_zscore_mean_zero` | zscore | output.mean() ≈ 0, output.std() ≈ 1 |
| `test_percentile_range` | percentile | all values in [0, 100] |
| `test_nan_gap_in_metadata` | yoy | NaN positions reported in gaps list |
| `test_unknown_op_raises` | "bogus" | raises ValueError |

### `test_transform_cache.py` — live Redis at 6379
| Test | What |
|---|---|
| `test_cache_miss_then_hit` | First call → miss (set), second → hit (same bytes) |
| `test_cache_key_includes_latest_observed_at` | Different `latest_observed_at` → different key |
| `test_redis_down_falls_back_to_compute` | Mock Redis to raise `ConnectionError` → service still returns result |
| `test_ttl_per_frequency` | TTL set to correct value per frequency via Redis `TTL` command |

---

## Acceptance criteria mapped

| FR | Test |
|---|---|
| FR-3.1 (compute from stored obs) | `test_mom_monthly`, `test_yoy_monthly_pct_change_12`, all op tests |
| FR-3.2 (NaN gap flag) | `test_nan_gap_in_metadata` |
| FR-3.3 (all transform groups) | full op matrix above |
| FR-3.4 (cached result on repeat) | `test_cache_miss_then_hit` |
| FR-3.5 (TTL per frequency) | `test_ttl_per_frequency` |
| AC-6 (metadata gaps) | `test_nan_gap_in_metadata` |
| NFR-1 (≤800ms uncached) | not load-tested here; cache-aside ensures warm path sub-50ms |

---

## Risks + mitigations

| Risk | Mitigation |
|---|---|
| NaN propagation creating incorrect gaps list | Test with synthetic series containing explicit NaN at known positions |
| `accum12` off-by-one on prod() | Use `np.prod` explicitly; test with 12 months of 1% → expect 12.68% |
| `periods_per_year` inference wrong for event series | Default to 1; test coverage for all freq strings |
| Redis gzip decode error on stale/corrupt key | Wrap decompress in try/except → treat as miss |
| `annualized` NaN when mom series has NaN | Propagates cleanly; NaN in = NaN out |
| Cache TTL misconfigured | Verify via `test_ttl_per_frequency` using Redis `TTL` command |
| `rebase` on series starting with NaN | Use `first_valid_index()` not `iloc[0]` |

---

## Background services needed
- Redis at `redis:6379` (running in Docker Compose — verified healthy)
- Postgres not needed for transform unit tests (pure pandas)
- Tests run inside `docker compose exec api` container
