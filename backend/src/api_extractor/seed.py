"""Seed CLI: load series.seed.json into the `series` table.

Usage:
    python -m api_extractor.seed [--data-file PATH]

The seed is fully idempotent — running it multiple times is safe.
Existing rows are updated via ON CONFLICT DO UPDATE. Missing rows are inserted.

The data file defaults to ``/app/data/series.seed.json`` (Docker Compose path)
with fallback to a path relative to this file's location.
"""

import argparse
import asyncio
import datetime
import json
import pathlib
import sys
from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager
from typing import Any

from loguru import logger
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from api_extractor.repos.series_repo import SeriesRepo

# ── Default data file paths ───────────────────────────────────────────────────
_DOCKER_PATH = pathlib.Path("/app/data/series.seed.json")
_LOCAL_PATH = pathlib.Path(__file__).parent.parent.parent.parent / "data" / "series.seed.json"


def _resolve_data_file(override: str | None = None) -> pathlib.Path:
    """Resolve the seed data file path.

    Args:
        override: Explicit path from CLI arg (highest priority).

    Returns:
        Resolved Path object.

    Raises:
        SystemExit: If no valid path is found.
    """
    if override:
        path = pathlib.Path(override)
        if not path.exists():
            logger.error(f"Data file not found: {path}")
            sys.exit(1)
        return path

    for candidate in (_DOCKER_PATH, _LOCAL_PATH):
        if candidate.exists():
            return candidate

    logger.error(
        "Could not locate series.seed.json. "
        "Expected at /app/data/series.seed.json (container) or "
        f"{_LOCAL_PATH} (host). Use --data-file to specify a path."
    )
    sys.exit(1)


def _parse_seed_row(raw: dict[str, Any]) -> dict[str, Any]:
    """Convert a raw JSON row to the dict format expected by SeriesRepo.upsert.

    Args:
        raw: Dict loaded directly from JSON.

    Returns:
        Dict with Python-typed values (e.g., date parsed).
    """
    row = dict(raw)
    if row.get("first_observation"):
        row["first_observation"] = datetime.date.fromisoformat(row["first_observation"])
    # Rename metadata key if present (ORM uses metadata_ to avoid collision).
    if "metadata" in row:
        row["metadata_"] = row.pop("metadata")
    return row


async def seed(
    data_file: pathlib.Path,
    session_factory: async_sessionmaker[AsyncSession] | None = None,
) -> int:
    """Load seed file and upsert all rows into the series table.

    Args:
        data_file: Path to series.seed.json.
        session_factory: Optional session factory for dependency injection
            (used in tests to avoid event loop conflicts with the module-level engine).
            If None, creates a fresh engine from DATABASE_URL env var.

    Returns:
        Number of rows processed.
    """
    logger.info(f"Loading seed data from {data_file}")
    raw_rows: list[dict[str, Any]] = json.loads(data_file.read_text(encoding="utf-8"))
    logger.info(f"Found {len(raw_rows)} series in seed file")

    # Create a fresh engine+factory if none provided (avoids event loop conflicts).
    _engine = None
    if session_factory is None:
        import os
        db_url = os.environ.get(
            "DATABASE_URL",
            "postgresql+asyncpg://postgres:postgres@postgres:5432/api_extractor",
        )
        _engine = create_async_engine(db_url, echo=False)
        session_factory = async_sessionmaker(
            bind=_engine, class_=AsyncSession, expire_on_commit=False
        )

    try:
        async with session_factory() as session:
            repo = SeriesRepo(session)
            upserted = 0
            for raw in raw_rows:
                row = _parse_seed_row(raw)
                code = row.get("code", "?")
                try:
                    await repo.upsert(row)
                    upserted += 1
                    logger.debug(f"Upserted: {code}")
                except Exception as exc:
                    logger.error(f"Failed to upsert {code}: {exc}")
                    raise
            await session.commit()
    finally:
        if _engine is not None:
            await _engine.dispose()

    logger.info(f"Seed complete. {upserted}/{len(raw_rows)} series upserted.")
    return upserted


def main() -> None:
    """CLI entry point."""
    parser = argparse.ArgumentParser(
        description="Seed the series table from series.seed.json."
    )
    parser.add_argument(
        "--data-file",
        metavar="PATH",
        help="Path to series.seed.json (default: auto-detect)",
    )
    args = parser.parse_args()

    data_file = _resolve_data_file(args.data_file)
    asyncio.run(seed(data_file))


if __name__ == "__main__":
    main()
