"""Pytest fixtures for Phase 1 data layer tests.

Strategy:
- Each test gets a function-scoped async engine + session.
- Tests that commit data clean up after themselves using explicit DELETE
  in autouse fixtures (also committed). This avoids relying on rollback
  to undo committed transactions.
- Tests that never commit (pure read tests) rely on the session rollback
  at fixture teardown.

DATABASE_URL env var: inside Docker Compose api container → postgres:5432.
"""

import os

import pytest
import pytest_asyncio
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

# ── Test DATABASE_URL ─────────────────────────────────────────────────────────
_DEFAULT_URL = "postgresql+asyncpg://postgres:postgres@postgres:5432/api_extractor"

TEST_DATABASE_URL = os.environ.get(
    "TEST_DATABASE_URL",
    os.environ.get("DATABASE_URL", _DEFAULT_URL),
)


def _make_factory(engine):
    return async_sessionmaker(
        bind=engine,
        class_=AsyncSession,
        expire_on_commit=False,
        autoflush=False,
        autocommit=False,
    )


# ── Engine (function-scoped) ──────────────────────────────────────────────────
@pytest_asyncio.fixture()
async def engine():
    """Function-scoped async engine — avoids pytest-asyncio event_loop scope issues."""
    _engine = create_async_engine(
        TEST_DATABASE_URL,
        echo=False,
        pool_pre_ping=True,
        pool_size=2,
        max_overflow=2,
    )
    yield _engine
    await _engine.dispose()


# ── Session (function-scoped) ─────────────────────────────────────────────────
@pytest_asyncio.fixture()
async def session(engine) -> AsyncSession:
    """Function-scoped AsyncSession.

    Does NOT auto-rollback on teardown — tests are responsible for cleanup.
    """
    factory = _make_factory(engine)
    async with factory() as _session:
        yield _session


# ── Repo fixtures ─────────────────────────────────────────────────────────────
@pytest.fixture()
def series_repo(session: AsyncSession):
    """SeriesRepo bound to the test session."""
    from api_extractor.repos.series_repo import SeriesRepo

    return SeriesRepo(session)


@pytest.fixture()
def observation_repo(session: AsyncSession):
    """ObservationRepo bound to the test session."""
    from api_extractor.repos.observation_repo import ObservationRepo

    return ObservationRepo(session)


@pytest.fixture()
def release_repo(session: AsyncSession):
    """ReleaseRepo bound to the test session."""
    from api_extractor.repos.release_repo import ReleaseRepo

    return ReleaseRepo(session)


@pytest.fixture()
def user_prefs_repo(session: AsyncSession):
    """UserPrefsRepo bound to the test session."""
    from api_extractor.repos.user_prefs_repo import UserPrefsRepo

    return UserPrefsRepo(session)
