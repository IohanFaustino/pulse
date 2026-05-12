"""currency_proxy: add currency and is_proxy columns to series.

Revision ID: 0004
Revises: 0003
Create Date: 2026-05-11

Schema changes
--------------
series
  ADD COLUMN currency TEXT NOT NULL DEFAULT 'BRL'
  ADD COLUMN is_proxy BOOLEAN NOT NULL DEFAULT FALSE

Backwards-compatibility guarantee
----------------------------------
Both columns carry NOT NULL server defaults so existing rows receive
'BRL' / FALSE without any explicit UPDATE or table rewrite.
On PG 16 a constant-default ADD COLUMN is a metadata-only operation
(no heap scan), keeping downtime zero even on large tables.

Downgrade
---------
DROP COLUMN both columns.  Safe because Wave A does not store any data
in these columns beyond their defaults; adapters that write non-default
values come in Wave B/C.
"""

from __future__ import annotations

from collections.abc import Sequence
from typing import Union

import sqlalchemy as sa
from alembic import op

revision: str = "0004"
down_revision: Union[str, None] = "0003"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Add currency and is_proxy columns to the series table."""

    # Metadata-only ADD COLUMN on PG 16 for constant defaults.
    op.add_column(
        "series",
        sa.Column(
            "currency",
            sa.Text(),
            nullable=False,
            server_default=sa.text("'BRL'"),
        ),
    )

    op.add_column(
        "series",
        sa.Column(
            "is_proxy",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("FALSE"),
        ),
    )


def downgrade() -> None:
    """Remove currency and is_proxy columns from the series table."""
    op.drop_column("series", "is_proxy")
    op.drop_column("series", "currency")
