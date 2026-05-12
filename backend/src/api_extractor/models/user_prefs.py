"""SQLAlchemy ORM models for user preference tables.

Three tables manage user state for the single-user deployment:
- `user_prefs`: singleton row holding recents list and update timestamp.
- `pin`: ordered list of pinned series for Painel.
- `card_transform`: per-card transform spec stored per pinned series.

The schema is shaped for future multi-user expansion (id PK, FK relationships)
but currently holds a single row with id=1 per system-design §10.
"""

import datetime
from typing import Any

from sqlalchemy import DateTime, ForeignKey, Index, Integer, String, Text, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from api_extractor.db import Base


class UserPrefs(Base):
    """Singleton user preferences row (id=1 for the default user).

    Attributes:
        id: PK. Always 1 for the single user in v1.
        recents: Ordered list of recently viewed series codes (max 3).
        updated_at: Auto-updated timestamp on any modification.
    """

    __tablename__ = "user_prefs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    recents: Mapped[list[str] | None] = mapped_column(JSONB, nullable=True, default=list)
    updated_at: Mapped[datetime.datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )


class Pin(Base):
    """A pinned series for the Painel dashboard.

    Composite PK `(user_prefs_id, series_code)` ensures each series is pinned
    at most once per user. `order` controls display order in the Painel grid.

    Attributes:
        user_prefs_id: FK to `user_prefs.id`.
        series_code: FK to `series.code`.
        order: Display order (0-based, ascending).
    """

    __tablename__ = "pin"
    __table_args__ = (
        Index("ix_pin_user_prefs_id", "user_prefs_id"),
        UniqueConstraint("user_prefs_id", "series_code", name="uq_pin_user_series"),
    )

    user_prefs_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("user_prefs.id", ondelete="CASCADE"),
        primary_key=True,
    )
    series_code: Mapped[str] = mapped_column(
        String(64),
        ForeignKey("series.code", ondelete="CASCADE"),
        primary_key=True,
    )
    order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)


class CardTransform(Base):
    """Per-card transform specification stored for Painel small-multiples.

    Composite PK `(user_prefs_id, series_code)` ensures at most one active
    transform per pinned card. The transform spec is stored as JSONB to mirror
    the TransformSpec schema defined in the API layer (Phase 5).

    Attributes:
        user_prefs_id: FK to `user_prefs.id`.
        series_code: FK to `series.code`.
        transform_spec: TransformSpec dict, e.g. ``{"op": "yoy", "params": {}}``.
    """

    __tablename__ = "card_transform"
    __table_args__ = (
        Index("ix_card_transform_user_prefs_id", "user_prefs_id"),
    )

    user_prefs_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("user_prefs.id", ondelete="CASCADE"),
        primary_key=True,
    )
    series_code: Mapped[str] = mapped_column(
        String(64),
        ForeignKey("series.code", ondelete="CASCADE"),
        primary_key=True,
    )
    transform_spec: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False)
