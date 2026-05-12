"""Base repository providing async session management.

All concrete repos inherit from `BaseRepo` to receive an injected
`AsyncSession` and access to shared utility methods.
"""

from sqlalchemy.ext.asyncio import AsyncSession


class BaseRepo:
    """Abstract base for all repository classes.

    Args:
        session: An active ``AsyncSession`` from ``async_session_factory``.
            The caller (FastAPI dependency, service, or test) is responsible
            for managing the session lifecycle (commit, rollback, close).
    """

    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    @property
    def session(self) -> AsyncSession:
        """Expose the underlying session for ad-hoc queries."""
        return self._session
