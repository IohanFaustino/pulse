"""User preferences router.

GET  /user_prefs  — Return full user prefs (pins, card transforms, recents).
PATCH /user_prefs  — Partial update: add/remove pins, set card transforms, set recents.

Single-user design: always operates on user_prefs row id=1.
"""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from api_extractor.deps import get_session
from api_extractor.repos.series_repo import SeriesRepo
from api_extractor.repos.user_prefs_repo import UserPrefsRepo
from api_extractor.schemas.user_prefs import (
    CardTransformRead,
    PinRead,
    UserPrefsRead,
    UserPrefsUpdate,
)

router = APIRouter(tags=["user_prefs"])


async def _build_user_prefs_read(repo: UserPrefsRepo) -> UserPrefsRead:
    """Fetch user prefs and assemble the full UserPrefsRead response."""
    prefs = await repo.get_or_create()
    pins = await repo.list_pins()
    transforms = await repo.list_transforms()

    return UserPrefsRead(
        id=prefs.id,
        pins=[PinRead(series_code=p.series_code, order=p.order) for p in pins],
        card_transforms=[
            CardTransformRead(
                series_code=ct.series_code,
                transform_spec=ct.transform_spec,
            )
            for ct in transforms
        ],
        recents=list(prefs.recents or []),
        updated_at=prefs.updated_at,
    )


@router.get(
    "/user_prefs",
    response_model=UserPrefsRead,
    summary="Get user preferences",
    description=(
        "Returns the current user preferences including pinned series, "
        "per-card transform specs, and recently viewed series codes. "
        "In single-user v1, always returns the default user row (id=1). "
        "Returns an empty state (no pins, no transforms, empty recents) on first call."
    ),
    responses={200: {"description": "User preferences returned."}},
)
async def get_user_prefs(
    session: Annotated[AsyncSession, Depends(get_session)],
) -> UserPrefsRead:
    """Return full user preferences including pins, transforms, and recents."""
    repo = UserPrefsRepo(session)
    return await _build_user_prefs_read(repo)


@router.patch(
    "/user_prefs",
    response_model=UserPrefsRead,
    summary="Update user preferences (partial)",
    description=(
        "Partial update of user preferences. All body fields are optional — "
        "omitting a field leaves it unchanged.\n\n"
        "**Pin management:** Use `add_pins` and `remove_pins` lists. "
        "add_pins is idempotent (already-pinned series are ignored). "
        "Removing a pin also removes its card_transform.\n\n"
        "**card_transforms:** Map of series_code → TransformSpec dict. "
        "Set value to null to remove the transform and revert to 'level'. "
        "Only listed series_codes are updated.\n\n"
        "**recents:** Full replacement list (max 3 entries kept).\n\n"
        "Returns the complete updated UserPrefsRead after applying all changes."
    ),
    responses={
        200: {"description": "User preferences updated and returned."},
        404: {"description": "One or more series codes in add_pins not found."},
        422: {"description": "Invalid body shape."},
    },
)
async def update_user_prefs(
    body: UserPrefsUpdate,
    session: Annotated[AsyncSession, Depends(get_session)],
) -> UserPrefsRead:
    """Apply partial update to user preferences and return updated state."""
    repo = UserPrefsRepo(session)
    series_repo = SeriesRepo(session)

    # Validate that any series being pinned actually exist.
    if body.add_pins:
        for code in body.add_pins:
            exists = await series_repo.get(code)
            if exists is None:
                raise HTTPException(
                    status_code=404,
                    detail=f"Cannot pin series {code!r}: series not found.",
                )

    # Apply add_pins.
    if body.add_pins:
        for code in body.add_pins:
            await repo.pin(code)

    # Apply remove_pins — also remove associated card transforms.
    if body.remove_pins:
        for code in body.remove_pins:
            await repo.unpin(code)
            await repo.remove_transform(code)

    # Apply card_transforms updates.
    if body.card_transforms is not None:
        for code, spec_dict in body.card_transforms.items():
            if spec_dict is None:
                # Remove transform → revert to level.
                await repo.remove_transform(code)
            else:
                await repo.set_transform(code, spec_dict)

    # Apply recents replacement.
    if body.recents is not None:
        prefs = await repo.get_or_create()
        prefs.recents = body.recents[:3]
        await session.flush()

    return await _build_user_prefs_read(repo)
