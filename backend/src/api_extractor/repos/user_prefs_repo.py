"""Repository for `user_prefs`, `pin`, and `card_transform` tables.

Single-user design: always works with the user_prefs row at id=1, creating
it on first access (get_or_create). Phase 5 routers use this repo for all
pin/unpin and transform persistence operations.
"""

from typing import Any

from sqlalchemy import delete, select
from sqlalchemy.dialects.postgresql import insert as pg_insert

from api_extractor.models.user_prefs import CardTransform, Pin, UserPrefs
from api_extractor.repos.base import BaseRepo

_DEFAULT_USER_ID = 1


class UserPrefsRepo(BaseRepo):
    """Data access layer for user preferences, pins, and card transforms."""

    async def get_or_create(self) -> UserPrefs:
        """Fetch the single user_prefs row, creating it if absent.

        Always uses ``id=1``. Idempotent: subsequent calls return the same row.

        Returns:
            The UserPrefs row.
        """
        result = await self._session.execute(
            select(UserPrefs).where(UserPrefs.id == _DEFAULT_USER_ID)
        )
        prefs = result.scalar_one_or_none()
        if prefs is None:
            prefs = UserPrefs(id=_DEFAULT_USER_ID, recents=[])
            self._session.add(prefs)
            await self._session.flush()
        return prefs

    async def update_recents(self, series_code: str, max_recents: int = 3) -> UserPrefs:
        """Prepend series_code to recents list, trimming to max_recents.

        Args:
            series_code: Code of the recently viewed series.
            max_recents: Maximum list length (default 3).

        Returns:
            Updated UserPrefs row.
        """
        prefs = await self.get_or_create()
        recents: list[str] = list(prefs.recents or [])
        # Remove existing occurrence to avoid duplicates before prepending.
        recents = [c for c in recents if c != series_code]
        recents.insert(0, series_code)
        prefs.recents = recents[:max_recents]
        await self._session.flush()
        return prefs

    # ── Pin operations ────────────────────────────────────────────────────────

    async def list_pins(self) -> list[Pin]:
        """Return all pins for the default user ordered by display order.

        Returns:
            List of Pin objects.
        """
        result = await self._session.execute(
            select(Pin)
            .where(Pin.user_prefs_id == _DEFAULT_USER_ID)
            .order_by(Pin.order.asc())
        )
        return list(result.scalars().all())

    async def pin(self, series_code: str) -> Pin:
        """Add a series to the pinned list (idempotent).

        The new pin is appended at the end (max existing order + 1).
        If already pinned, returns the existing Pin unchanged.

        Args:
            series_code: Series code to pin.

        Returns:
            The Pin row (new or existing).
        """
        # Ensure user_prefs row exists.
        await self.get_or_create()

        # Check if already pinned.
        existing = await self._session.execute(
            select(Pin)
            .where(Pin.user_prefs_id == _DEFAULT_USER_ID)
            .where(Pin.series_code == series_code)
        )
        pin_row = existing.scalar_one_or_none()
        if pin_row is not None:
            return pin_row

        # Determine next order index.
        current_pins = await self.list_pins()
        next_order = len(current_pins)

        pin_row = Pin(
            user_prefs_id=_DEFAULT_USER_ID,
            series_code=series_code,
            order=next_order,
        )
        self._session.add(pin_row)
        await self._session.flush()
        return pin_row

    async def unpin(self, series_code: str) -> bool:
        """Remove a series from the pinned list.

        Args:
            series_code: Series code to unpin.

        Returns:
            ``True`` if a row was deleted, ``False`` if it was not pinned.
        """
        result = await self._session.execute(
            delete(Pin)
            .where(Pin.user_prefs_id == _DEFAULT_USER_ID)
            .where(Pin.series_code == series_code)
        )
        await self._session.flush()
        return (result.rowcount or 0) > 0

    async def is_pinned(self, series_code: str) -> bool:
        """Check whether a series is currently pinned.

        Args:
            series_code: Series code to check.

        Returns:
            ``True`` if pinned.
        """
        result = await self._session.execute(
            select(Pin)
            .where(Pin.user_prefs_id == _DEFAULT_USER_ID)
            .where(Pin.series_code == series_code)
        )
        return result.scalar_one_or_none() is not None

    # ── Card transform operations ─────────────────────────────────────────────

    async def get_transform(self, series_code: str) -> CardTransform | None:
        """Fetch the active transform spec for a pinned card.

        Args:
            series_code: Series code.

        Returns:
            CardTransform row or ``None`` if no transform is set.
        """
        result = await self._session.execute(
            select(CardTransform)
            .where(CardTransform.user_prefs_id == _DEFAULT_USER_ID)
            .where(CardTransform.series_code == series_code)
        )
        return result.scalar_one_or_none()

    async def set_transform(
        self, series_code: str, transform_spec: dict[str, Any]
    ) -> CardTransform:
        """Persist (or replace) a card transform spec for a series.

        Args:
            series_code: Series code for the pinned card.
            transform_spec: TransformSpec dict (e.g., ``{"op": "yoy", "params": {}}``).

        Returns:
            The inserted or updated CardTransform row.
        """
        await self.get_or_create()
        stmt = (
            pg_insert(CardTransform)
            .values(
                user_prefs_id=_DEFAULT_USER_ID,
                series_code=series_code,
                transform_spec=transform_spec,
            )
            .on_conflict_do_update(
                constraint="pk_card_transform",
                set_={"transform_spec": transform_spec},
            )
            .returning(CardTransform)
        )
        result = await self._session.execute(stmt)
        await self._session.flush()
        return result.scalar_one()

    async def remove_transform(self, series_code: str) -> bool:
        """Remove the transform spec for a card (revert to level).

        Args:
            series_code: Series code.

        Returns:
            ``True`` if a transform was removed.
        """
        result = await self._session.execute(
            delete(CardTransform)
            .where(CardTransform.user_prefs_id == _DEFAULT_USER_ID)
            .where(CardTransform.series_code == series_code)
        )
        await self._session.flush()
        return (result.rowcount or 0) > 0

    async def list_transforms(self) -> list[CardTransform]:
        """Return all card transforms for the default user.

        Returns:
            List of CardTransform objects.
        """
        result = await self._session.execute(
            select(CardTransform).where(
                CardTransform.user_prefs_id == _DEFAULT_USER_ID
            )
        )
        return list(result.scalars().all())
