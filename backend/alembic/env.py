"""Alembic environment configuration — async SQLAlchemy 2.x.

Supports both offline (SQL script generation) and online (live DB) modes.
Online mode uses asyncio + asyncpg via `AsyncEngine.begin()`.

DATABASE_URL is read from the environment (or .env) via `api_extractor.config.settings`.
"""

import asyncio
import os
from logging.config import fileConfig

from alembic import context
from sqlalchemy import pool, text
from sqlalchemy.ext.asyncio import async_engine_from_config

# ── Import models so Base.metadata is populated ───────────────────────────────
# All model modules must be imported before `target_metadata` is set.
from api_extractor.db import Base
import api_extractor.models  # noqa: F401 — registers all models with Base.metadata

# ── Alembic config object ─────────────────────────────────────────────────────
config = context.config

# Override sqlalchemy.url from environment so secrets don't live in alembic.ini.
# The DATABASE_URL env var must use the asyncpg driver scheme.
database_url = os.environ.get("DATABASE_URL")
if database_url:
    config.set_main_option("sqlalchemy.url", database_url)

# Interpret the config file for Python logging.
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

# Metadata for autogenerate support.
target_metadata = Base.metadata


# ── Offline migrations (emit SQL to stdout) ───────────────────────────────────
def run_migrations_offline() -> None:
    """Run migrations without a live DB connection.

    Useful for generating SQL scripts for review or DBA-applied migrations.
    """
    url = config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        compare_type=True,
    )

    with context.begin_transaction():
        context.run_migrations()


# ── Online migrations (apply to live DB via asyncpg) ─────────────────────────
def do_run_migrations(connection: object) -> None:
    """Execute migrations within a synchronous connection context."""
    context.configure(
        connection=connection,  # type: ignore[arg-type]
        target_metadata=target_metadata,
        compare_type=True,
    )
    with context.begin_transaction():
        context.run_migrations()


async def run_async_migrations() -> None:
    """Create an async engine and run migrations inside its connection."""
    connectable = async_engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )

    async with connectable.connect() as connection:
        await connection.run_sync(do_run_migrations)

    await connectable.dispose()


def run_migrations_online() -> None:
    """Entry point for online mode — runs the async migration coroutine."""
    asyncio.run(run_async_migrations())


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
