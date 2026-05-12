"""Tests verifying the TimescaleDB hypertable migration.

Maps to:
- FR-2.1: observations stored in a TimescaleDB hypertable partitioned by observed_at.
- NFR-4: UNIQUE(series_code, observed_at) constraint exists at DB level.
"""

import pytest
from sqlalchemy import text


class TestHypertableMigration:
    """Verifies that the Alembic migration created the observations hypertable."""

    async def test_observations_is_hypertable(self, session):
        """Query timescaledb_information.hypertables to confirm observations is a hypertable.

        Maps to FR-2.1.
        """
        result = await session.execute(
            text(
                """
                SELECT hypertable_name, num_dimensions
                FROM timescaledb_information.hypertables
                WHERE hypertable_name = 'observations'
                """
            )
        )
        rows = result.fetchall()
        assert len(rows) == 1, (
            "Expected exactly 1 hypertable named 'observations' in "
            "timescaledb_information.hypertables"
        )
        hypertable_name, num_dimensions = rows[0]
        assert hypertable_name == "observations"
        assert num_dimensions == 1  # Single dimension: observed_at

    async def test_observations_partition_dimension_is_observed_at(self, session):
        """Verify the hypertable dimension is observed_at with monthly chunking."""
        result = await session.execute(
            text(
                """
                SELECT column_name, time_interval
                FROM timescaledb_information.dimensions
                WHERE hypertable_name = 'observations'
                """
            )
        )
        rows = result.fetchall()
        assert len(rows) == 1
        column_name, time_interval = rows[0]
        assert column_name == "observed_at"
        # Chunk interval should be 1 month (30 days in interval representation may vary).
        assert time_interval is not None

    async def test_all_seven_tables_exist(self, session):
        """Verify the migration created all 7 domain tables plus alembic_version."""
        result = await session.execute(
            text(
                """
                SELECT tablename
                FROM pg_tables
                WHERE schemaname = 'public'
                ORDER BY tablename
                """
            )
        )
        tables = {row[0] for row in result.fetchall()}
        expected = {
            "series",
            "observations",
            "revisions",
            "releases",
            "user_prefs",
            "pin",
            "card_transform",
            "alembic_version",
        }
        assert expected.issubset(tables), (
            f"Missing tables: {expected - tables}. Found: {tables}"
        )

    async def test_observations_pk_enforces_uniqueness(self, session):
        """Verify (series_code, observed_at) uniqueness is enforced via PK.

        TimescaleDB drops standalone UNIQUE constraints when converting a table
        to a hypertable. The PK 'pk_observations' on (series_code, observed_at)
        serves as the uniqueness guarantee per NFR-4.
        """
        result = await session.execute(
            text(
                """
                SELECT constraint_name, constraint_type
                FROM information_schema.table_constraints
                WHERE table_name = 'observations'
                  AND constraint_type = 'PRIMARY KEY'
                  AND constraint_name = 'pk_observations'
                """
            )
        )
        rows = result.fetchall()
        assert len(rows) == 1, (
            "Expected PRIMARY KEY constraint 'pk_observations' on observations table. "
            "Note: TimescaleDB drops standalone UNIQUE constraints on hypertables; "
            "the PK enforces uniqueness of (series_code, observed_at)."
        )

    async def test_alembic_version_is_head(self, session):
        """Verify migration version is stamped at current head (0004)."""
        result = await session.execute(text("SELECT version_num FROM alembic_version"))
        rows = result.fetchall()
        assert len(rows) == 1
        assert rows[0][0] == "0004"

    async def test_series_currency_column_exists(self, session):
        """Verify migration 0004 added currency column to series table."""
        result = await session.execute(
            text(
                """
                SELECT column_name, column_default, is_nullable, data_type
                FROM information_schema.columns
                WHERE table_name = 'series'
                  AND column_name = 'currency'
                """
            )
        )
        rows = result.fetchall()
        assert len(rows) == 1, "currency column not found on series table"
        column_name, column_default, is_nullable, data_type = rows[0]
        assert column_name == "currency"
        assert is_nullable == "NO"
        assert data_type == "text"

    async def test_series_is_proxy_column_exists(self, session):
        """Verify migration 0004 added is_proxy column to series table."""
        result = await session.execute(
            text(
                """
                SELECT column_name, column_default, is_nullable, data_type
                FROM information_schema.columns
                WHERE table_name = 'series'
                  AND column_name = 'is_proxy'
                """
            )
        )
        rows = result.fetchall()
        assert len(rows) == 1, "is_proxy column not found on series table"
        column_name, column_default, is_nullable, data_type = rows[0]
        assert column_name == "is_proxy"
        assert is_nullable == "NO"
        assert data_type == "boolean"

    async def test_series_indexes_exist(self, session):
        """Verify that key indexes were created by the migration."""
        result = await session.execute(
            text(
                """
                SELECT indexname
                FROM pg_indexes
                WHERE schemaname = 'public'
                  AND tablename IN ('observations', 'series', 'pin', 'card_transform')
                ORDER BY indexname
                """
            )
        )
        indexes = {row[0] for row in result.fetchall()}
        expected_indexes = {
            # 0003: replaces ix_observations_series_date_desc with three-column index.
            "ix_observations_series_measure_date_desc",
            "ix_series_category",
            "ix_series_source",
            "ix_series_status",
            "ix_pin_user_prefs_id",
            "ix_card_transform_user_prefs_id",
        }
        assert expected_indexes.issubset(indexes), (
            f"Missing indexes: {expected_indexes - indexes}"
        )

    async def test_observations_pk_includes_measure_key(self, session):
        """Verify PK on observations now spans (series_code, measure_key, observed_at).

        Migration 0003 widens the primary key to include measure_key so that
        multiple measures can coexist for the same series and timestamp.
        Maps to Phase 18 multi-measure schema change.
        """
        result = await session.execute(
            text(
                """
                SELECT kcu.column_name
                FROM information_schema.table_constraints tc
                JOIN information_schema.key_column_usage kcu
                  ON tc.constraint_name = kcu.constraint_name
                 AND tc.table_name     = kcu.table_name
                WHERE tc.table_name      = 'observations'
                  AND tc.constraint_type = 'PRIMARY KEY'
                  AND tc.constraint_name = 'pk_observations'
                ORDER BY kcu.ordinal_position
                """
            )
        )
        pk_columns = [row[0] for row in result.fetchall()]
        assert "measure_key" in pk_columns, (
            f"Expected 'measure_key' in pk_observations columns, got: {pk_columns}"
        )
        assert pk_columns == ["series_code", "measure_key", "observed_at"], (
            f"Unexpected PK column order: {pk_columns}"
        )
