"""Database engine, session factory, and declarative base.

All components in this module are async-first (asyncpg driver via SQLAlchemy 2.x).
Import `async_session_factory` for dependency injection in repos and services.
Import `Base` in models so Alembic can discover metadata.
"""

from collections.abc import AsyncGenerator

from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.orm import DeclarativeBase

from api_extractor.config import settings

# ── Engine ────────────────────────────────────────────────────────────────────
engine = create_async_engine(
    settings.database_url,
    echo=settings.app_env == "development",
    pool_pre_ping=True,
    pool_size=5,
    max_overflow=10,
)

# ── Session factory ───────────────────────────────────────────────────────────
async_session_factory = async_sessionmaker(
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autoflush=False,
    autocommit=False,
)


# ── Declarative base ──────────────────────────────────────────────────────────
class Base(DeclarativeBase):
    """Shared declarative base for all ORM models.

    All SQLAlchemy models inherit from this class so Alembic can discover
    the full metadata via `Base.metadata`.
    """


# ── Session dependency (FastAPI / tests) ──────────────────────────────────────
async def get_session() -> AsyncGenerator[AsyncSession, None]:
    """Yield an async database session.

    Intended for use as a FastAPI dependency (``Depends(get_session)``) and
    directly in tests via ``async with`` or ``anext()``.
    """
    async with async_session_factory() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()
