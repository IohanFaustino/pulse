-- Initialize TimescaleDB extension.
-- This script runs automatically on first container start because it is mounted
-- into /docker-entrypoint-initdb.d/ in the postgres service definition.
-- The extension must be created before any hypertable DDL (Phase 1 Alembic migrations).

CREATE EXTENSION IF NOT EXISTS timescaledb CASCADE;
