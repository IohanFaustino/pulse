# ADR-0002: Postgres + TimescaleDB for time-series storage

## Status
Accepted — 2026-05-11

## Context
Need to store time-series observations across 25 indicators with daily/monthly/quarterly frequencies, full history (some series back to 1980s = ~15k monthly points or ~10k daily points each). Need range queries by `(series, date_range)` for sparklines and transforms. Also need relational data: series metadata, user_prefs, revisions, releases.

## Decision
Single Postgres 16 instance with TimescaleDB extension. `observations` as hypertable partitioned by `observed_at`. All other tables vanilla Postgres.

## Alternatives Considered
- **Plain Postgres with b-tree on (series_code, observed_at)** — Fine for 25 series. Loses Timescale's time-bucket functions and partition pruning benefits. Acceptable but Timescale costs little.
- **InfluxDB / TimescaleDB on dedicated server** — Overhead for 25 series. Splits storage from relational data, complicates joins.
- **DuckDB + Parquet** — Excellent analytics, but no live write story. Refresh ergonomics worse.

## Consequences
- **Positive:** SQL-native time-series functions (`time_bucket`, gap-fill), one DB instance for everything, mature tooling.
- **Negative:** TimescaleDB extension upgrade requires care across major versions. Docker image less standard than vanilla Postgres.

## Trade-offs
Single-system simplicity prioritized over best-of-breed isolation. Volume small enough that perf is not a deciding factor.

## Notes
- Image: `timescale/timescaledb:latest-pg16`
- Schema migration: Alembic + raw SQL for `SELECT create_hypertable(...)`
- Backup: `pg_dump` sufficient for v1
