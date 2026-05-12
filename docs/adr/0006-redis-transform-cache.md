# ADR-0006: Redis cache for transform results

## Status
Accepted — 2026-05-11

## Context
Transforms recomputed per request can take 50–800ms (depending on series length + op). Painel renders N pinned cards concurrently — without cache, every page load fans out to N transforms. Repeat visits with same pin set + transform spec should be instant.

## Decision
Cache transform results in Redis 7. Key: `transform:{series_code}:{sha256(spec)}:{latest_observed_at}`. Value: gzip-compressed JSON of `{values, metadata}`. TTL per frequency: daily=1h, monthly=24h, quarterly=7d.

## Alternatives Considered
- **No cache** — Acceptable correctness, fails latency NFR on warm Painel loads.
- **In-memory LRU in FastAPI process** — Lost on restart, no cross-process sharing (matters if scaled). Redis cost is one container.
- **Postgres materialized view** — SQL-native, but awkward for parametric transforms (every spec = new view).

## Consequences
- **Positive:** sub-50ms warm reads. Key includes `latest_observed_at` so invalidation is implicit on new ingestion.
- **Negative:** one more service to run. Mitigated by `cache-aside` pattern — if Redis is down, compute fresh + log WARN.

## Trade-offs
Latency win > infra cost. Eviction handled by TTL + Redis maxmemory `allkeys-lru`.

## Cache key strategy
```
key = f"transform:{series_code}:{spec_hash}:{latest_observed_at.isoformat()}"
```
New observation → new `latest_observed_at` → new key → old key TTLs out naturally. No invalidation logic needed.
