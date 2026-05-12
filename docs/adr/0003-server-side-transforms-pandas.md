# ADR-0003: Server-side on-demand transforms with pandas

## Status
Accepted — 2026-05-11

## Context
Transform modal in doc §7 offers ~15 transform variants across 5 groups. With 25 series and N transform combinations, materializing all variants on ingestion is rigid and storage-heavy. Frontend computation moves heavy numeric work to browser and ships full raw series over the wire.

## Decision
Compute transforms server-side on demand using pandas. Cache results in Redis keyed by `(series_code, transform_spec, latest_observed_at)`. TTL by series frequency: daily=1h, monthly=24h, quarterly=7d.

## Alternatives Considered
- **Precompute all transforms at ingestion** — Storage explosion, rigid (adding a new transform = full backfill). Wins on read latency only.
- **Client-side transforms in JS** — Ships raw series + reimplements stats in JS. Numeric drift risk vs pandas.
- **Materialized views per transform** — SQL-only solution but awkward for EWMA / log-diff / z-score.

## Consequences
- **Positive:** flexible, single source of truth (raw obs), easy to add new transforms (register fn), small storage footprint.
- **Negative:** cold computation latency. Mitigated by Redis cache + small series sizes (<100k points for 25 series).
- **Negative:** pandas dependency at API tier. Acceptable since extractors also benefit.

## Trade-offs
Flexibility + correctness prioritized over absolute read latency.

## Cache invalidation
Cache key includes `latest_observed_at` of source series. New observation → new key → old key naturally expires. No explicit purge needed.
