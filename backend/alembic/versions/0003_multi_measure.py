"""multi-measure: measures JSONB on series, measure_key on observations + revisions.

Revision ID: 0003
Revises: 0002
Create Date: 2026-05-11

Schema changes
--------------
series
  ADD COLUMN measures JSONB NOT NULL DEFAULT '[]'::jsonb

observations
  ADD COLUMN measure_key TEXT NOT NULL DEFAULT 'default'
  DROP CONSTRAINT pk_observations
  ADD CONSTRAINT pk_observations PRIMARY KEY (series_code, measure_key, observed_at)
  DROP INDEX ix_observations_series_date_desc
  CREATE INDEX ix_observations_series_measure_date_desc (series_code, measure_key, observed_at)

revisions
  ADD COLUMN measure_key TEXT NOT NULL DEFAULT 'default'
  DROP INDEX ix_revisions_series_date
  CREATE INDEX ix_revisions_series_measure_date (series_code, measure_key, observed_at)

Backwards-compatibility guarantee
----------------------------------
All existing observation and revision rows receive measure_key = 'default' via
the column DEFAULT — no explicit UPDATE is required and no chunk rewrite occurs
(PG 16 constant-default ADD COLUMN is metadata-only).

The PK swap (DROP + ADD inside a single transaction) is safe on TimescaleDB
2.x hypertables as long as the partition column (observed_at) remains part of
the new PK, which it does.

Downgrade guard
---------------
The downgrade raises if any observation row has measure_key <> 'default',
preventing silent data loss.  Operators must purge non-default measure rows
before rolling back.
"""

from __future__ import annotations

from collections.abc import Sequence
from typing import Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0003"
down_revision: Union[str, None] = "0002"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Apply multi-measure schema changes."""

    # ── series.measures ───────────────────────────────────────────────────────
    # Metadata-only ADD COLUMN for constant default on PG 16.
    op.add_column(
        "series",
        sa.Column(
            "measures",
            postgresql.JSONB(),
            nullable=False,
            server_default=sa.text("'[]'::jsonb"),
        ),
    )

    # ── observations.measure_key ──────────────────────────────────────────────
    # Constant DEFAULT → metadata-only on PG 16; no chunk rewrite on hypertable.
    op.add_column(
        "observations",
        sa.Column(
            "measure_key",
            sa.Text(),
            nullable=False,
            server_default=sa.text("'default'"),
        ),
    )

    # Drop the old compound index before altering the PK.
    op.drop_index("ix_observations_series_date_desc", table_name="observations")

    # Drop and recreate the PK to include measure_key.
    # TimescaleDB 2.x supports this as long as the partition column (observed_at)
    # remains in the PK.  Both operations run in the same transaction.
    op.execute("ALTER TABLE observations DROP CONSTRAINT pk_observations")
    op.execute(
        "ALTER TABLE observations "
        "ADD CONSTRAINT pk_observations "
        "PRIMARY KEY (series_code, measure_key, observed_at)"
    )

    # New compound index for the three-column query pattern.
    op.create_index(
        "ix_observations_series_measure_date_desc",
        "observations",
        ["series_code", "measure_key", "observed_at"],
    )

    # ── revisions.measure_key ─────────────────────────────────────────────────
    op.add_column(
        "revisions",
        sa.Column(
            "measure_key",
            sa.Text(),
            nullable=False,
            server_default=sa.text("'default'"),
        ),
    )

    op.drop_index("ix_revisions_series_date", table_name="revisions")
    op.create_index(
        "ix_revisions_series_measure_date",
        "revisions",
        ["series_code", "measure_key", "observed_at"],
    )


def downgrade() -> None:
    """Reverse multi-measure schema changes.

    Raises:
        RuntimeError: If non-default measure_key rows exist in observations.
            Operator must purge them before downgrading.
    """
    conn = op.get_bind()

    # Guard: refuse downgrade if non-default measure rows would be lost.
    result = conn.execute(
        sa.text(
            "SELECT EXISTS ("
            "  SELECT 1 FROM observations WHERE measure_key <> 'default' LIMIT 1"
            ")"
        )
    )
    has_non_default: bool = result.scalar()
    if has_non_default:
        raise RuntimeError(
            "Downgrade refused: observations table contains rows with "
            "measure_key <> 'default'.  Purge non-default measure rows "
            "before rolling back migration 0003."
        )

    # ── revisions ─────────────────────────────────────────────────────────────
    op.drop_index("ix_revisions_series_measure_date", table_name="revisions")
    op.create_index(
        "ix_revisions_series_date",
        "revisions",
        ["series_code", "observed_at"],
    )
    op.drop_column("revisions", "measure_key")

    # ── observations ──────────────────────────────────────────────────────────
    op.drop_index("ix_observations_series_measure_date_desc", table_name="observations")

    # Restore the original two-column PK.
    op.execute("ALTER TABLE observations DROP CONSTRAINT pk_observations")
    op.execute(
        "ALTER TABLE observations "
        "ADD CONSTRAINT pk_observations "
        "PRIMARY KEY (series_code, observed_at)"
    )

    op.create_index(
        "ix_observations_series_date_desc",
        "observations",
        ["series_code", "observed_at"],
    )
    op.drop_column("observations", "measure_key")

    # ── series ────────────────────────────────────────────────────────────────
    op.drop_column("series", "measures")
