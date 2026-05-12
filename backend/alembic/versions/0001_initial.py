"""Initial schema: 7 tables + TimescaleDB hypertable.

Revision ID: 0001
Revises:
Create Date: 2026-05-11

Creates:
- series
- observations (TimescaleDB hypertable on observed_at)
- revisions
- releases
- user_prefs
- pin
- card_transform

All raw SQL for TimescaleDB extension and hypertable creation is idempotent:
- CREATE EXTENSION IF NOT EXISTS timescaledb
- create_hypertable(..., if_not_exists => TRUE)
"""

from collections.abc import Sequence
from typing import Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "0001"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Create all tables, hypertable, and indexes."""

    # ── TimescaleDB extension ─────────────────────────────────────────────────
    op.execute("CREATE EXTENSION IF NOT EXISTS timescaledb CASCADE;")

    # ── series ────────────────────────────────────────────────────────────────
    op.create_table(
        "series",
        sa.Column("code", sa.String(64), primary_key=True, nullable=False),
        sa.Column("name", sa.Text(), nullable=False),
        sa.Column("category", sa.String(64), nullable=False),
        sa.Column("source", sa.String(64), nullable=False),
        sa.Column("source_id", sa.String(64), nullable=False),
        sa.Column("frequency", sa.String(16), nullable=False),
        sa.Column("unit", sa.String(32), nullable=False),
        sa.Column("first_observation", sa.Date(), nullable=True),
        sa.Column("last_extraction_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_success_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "status",
            sa.String(16),
            nullable=False,
            server_default=sa.text("'fresh'"),
        ),
        sa.Column("metadata", postgresql.JSONB(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
    )
    op.create_index("ix_series_category", "series", ["category"])
    op.create_index("ix_series_source", "series", ["source"])
    op.create_index("ix_series_status", "series", ["status"])

    # ── observations (will become hypertable) ─────────────────────────────────
    op.create_table(
        "observations",
        sa.Column("series_code", sa.String(64), nullable=False),
        sa.Column("observed_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("value", sa.Numeric(precision=20, scale=6), nullable=False),
        sa.Column(
            "ingested_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.ForeignKeyConstraint(
            ["series_code"],
            ["series.code"],
            ondelete="CASCADE",
            name="fk_observations_series_code",
        ),
        sa.PrimaryKeyConstraint("series_code", "observed_at", name="pk_observations"),
        sa.UniqueConstraint(
            "series_code", "observed_at", name="uq_observations_series_date"
        ),
    )
    # Compound index for sparkline/range reads: filter by series, sort by date DESC.
    op.create_index(
        "ix_observations_series_date_desc",
        "observations",
        ["series_code", "observed_at"],
    )

    # ── Convert observations to TimescaleDB hypertable ────────────────────────
    # chunk_time_interval = 1 month (INTERVAL '1 month')
    # if_not_exists => TRUE makes this idempotent on re-run.
    op.execute(
        """
        SELECT create_hypertable(
            'observations',
            'observed_at',
            chunk_time_interval => INTERVAL '1 month',
            if_not_exists => TRUE
        );
        """
    )

    # ── revisions ─────────────────────────────────────────────────────────────
    op.create_table(
        "revisions",
        sa.Column(
            "id",
            sa.BigInteger(),
            primary_key=True,
            autoincrement=True,
            nullable=False,
        ),
        sa.Column("series_code", sa.String(64), nullable=False),
        sa.Column("observed_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("old_value", sa.Numeric(precision=20, scale=6), nullable=False),
        sa.Column("new_value", sa.Numeric(precision=20, scale=6), nullable=False),
        sa.Column(
            "revised_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.ForeignKeyConstraint(
            ["series_code"],
            ["series.code"],
            ondelete="CASCADE",
            name="fk_revisions_series_code",
        ),
    )
    op.create_index("ix_revisions_series_date", "revisions", ["series_code", "observed_at"])

    # ── releases ──────────────────────────────────────────────────────────────
    op.create_table(
        "releases",
        sa.Column(
            "id",
            sa.BigInteger(),
            primary_key=True,
            autoincrement=True,
            nullable=False,
        ),
        sa.Column("series_code", sa.String(64), nullable=False),
        sa.Column("scheduled_for", sa.Date(), nullable=False),
        sa.Column(
            "status",
            sa.String(16),
            nullable=False,
            server_default=sa.text("'expected'"),
        ),
        sa.Column(
            "source_type",
            sa.String(16),
            nullable=False,
            server_default=sa.text("'hardcoded'"),
        ),
        sa.ForeignKeyConstraint(
            ["series_code"],
            ["series.code"],
            ondelete="CASCADE",
            name="fk_releases_series_code",
        ),
    )
    op.create_index("ix_releases_series_code", "releases", ["series_code"])
    op.create_index("ix_releases_scheduled_for", "releases", ["scheduled_for"])

    # ── user_prefs ────────────────────────────────────────────────────────────
    op.create_table(
        "user_prefs",
        sa.Column(
            "id",
            sa.Integer(),
            primary_key=True,
            autoincrement=True,
            nullable=False,
        ),
        sa.Column("recents", postgresql.JSONB(), nullable=True),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
    )

    # ── pin ───────────────────────────────────────────────────────────────────
    op.create_table(
        "pin",
        sa.Column("user_prefs_id", sa.Integer(), nullable=False),
        sa.Column("series_code", sa.String(64), nullable=False),
        sa.Column("order", sa.Integer(), nullable=False, server_default=sa.text("0")),
        sa.ForeignKeyConstraint(
            ["user_prefs_id"],
            ["user_prefs.id"],
            ondelete="CASCADE",
            name="fk_pin_user_prefs_id",
        ),
        sa.ForeignKeyConstraint(
            ["series_code"],
            ["series.code"],
            ondelete="CASCADE",
            name="fk_pin_series_code",
        ),
        sa.PrimaryKeyConstraint("user_prefs_id", "series_code", name="pk_pin"),
        sa.UniqueConstraint(
            "user_prefs_id", "series_code", name="uq_pin_user_series"
        ),
    )
    op.create_index("ix_pin_user_prefs_id", "pin", ["user_prefs_id"])

    # ── card_transform ────────────────────────────────────────────────────────
    op.create_table(
        "card_transform",
        sa.Column("user_prefs_id", sa.Integer(), nullable=False),
        sa.Column("series_code", sa.String(64), nullable=False),
        sa.Column("transform_spec", postgresql.JSONB(), nullable=False),
        sa.ForeignKeyConstraint(
            ["user_prefs_id"],
            ["user_prefs.id"],
            ondelete="CASCADE",
            name="fk_card_transform_user_prefs_id",
        ),
        sa.ForeignKeyConstraint(
            ["series_code"],
            ["series.code"],
            ondelete="CASCADE",
            name="fk_card_transform_series_code",
        ),
        sa.PrimaryKeyConstraint(
            "user_prefs_id", "series_code", name="pk_card_transform"
        ),
    )
    op.create_index(
        "ix_card_transform_user_prefs_id", "card_transform", ["user_prefs_id"]
    )


def downgrade() -> None:
    """Drop all tables in reverse dependency order."""
    op.drop_table("card_transform")
    op.drop_table("pin")
    op.drop_table("user_prefs")
    op.drop_table("releases")
    op.drop_table("revisions")
    op.drop_table("observations")
    op.drop_table("series")
