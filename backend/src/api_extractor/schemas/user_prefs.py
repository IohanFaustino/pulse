"""Pydantic v2 schemas for the user_prefs resource.

Single-user design: always targets the default row (id=1).
PATCH uses add/remove semantics for pins to avoid full-replace footguns.
"""

from __future__ import annotations

import datetime
from typing import Any

from pydantic import BaseModel, Field


class PinRead(BaseModel):
    """A pinned series entry."""

    model_config = {"populate_by_name": True}

    series_code: str = Field(description="Pinned series code.")
    order: int = Field(description="Display order in Painel (0-based ascending).")


class CardTransformRead(BaseModel):
    """Active transform spec for a pinned Painel card."""

    model_config = {"populate_by_name": True}

    series_code: str = Field(description="Series code this transform applies to.")
    transform_spec: dict[str, Any] = Field(
        description="TransformSpec dict, e.g. {\"op\": \"yoy\", \"params\": {}}."
    )


class UserPrefsRead(BaseModel):
    """Full user preferences response.

    Represents the single-user state including pinned series,
    per-card transform specs, and recently viewed series codes.
    """

    model_config = {"populate_by_name": True}

    id: int = Field(description="Always 1 in single-user v1 deployment.")
    pins: list[PinRead] = Field(
        default_factory=list,
        description="Pinned series ordered by display order.",
    )
    card_transforms: list[CardTransformRead] = Field(
        default_factory=list,
        description="Active transform spec per pinned card. Absent entries default to 'level'.",
    )
    recents: list[str] = Field(
        default_factory=list,
        description="Recently viewed series codes, most recent first (max 3).",
    )
    updated_at: datetime.datetime | None = Field(
        default=None,
        description="UTC timestamp of last modification.",
    )


class UserPrefsUpdate(BaseModel):
    """Partial update body for PATCH /user_prefs.

    All fields are optional — unset fields are unchanged.

    Pins use add/remove lists rather than full replacement to prevent
    accidental data loss on concurrent edits.

    card_transforms is a mapping from series_code to TransformSpec dict
    (or null to remove the transform and revert to level).
    """

    model_config = {"populate_by_name": True}

    add_pins: list[str] | None = Field(
        default=None,
        description="Series codes to add to pins (idempotent — already-pinned codes are ignored).",
    )
    remove_pins: list[str] | None = Field(
        default=None,
        description="Series codes to remove from pins. Unpinning also removes the card transform.",
    )
    card_transforms: dict[str, dict[str, Any] | None] | None = Field(
        default=None,
        description=(
            "Map of series_code → TransformSpec dict (or null to remove). "
            "Only listed series are updated; others are unchanged."
        ),
    )
    recents: list[str] | None = Field(
        default=None,
        description="Full replacement of the recents list (max 3 entries kept).",
    )
