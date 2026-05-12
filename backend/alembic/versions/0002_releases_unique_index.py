"""releases: unique index on (series_code, scheduled_for)

Revision ID: 0002
Revises: 0001
Create Date: 2026-05-11

Prevents duplicate release entries from concurrent calendar refreshes
(scraper + hardcoded fallback may overlap). Required before scheduler
(Phase 3) wires periodic refresh.
"""

from __future__ import annotations

from collections.abc import Sequence
from typing import Union

from alembic import op

revision: str = "0002"
down_revision: Union[str, None] = "0001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_index(
        "uq_releases_series_scheduled",
        "releases",
        ["series_code", "scheduled_for"],
        unique=True,
    )


def downgrade() -> None:
    op.drop_index("uq_releases_series_scheduled", table_name="releases")
