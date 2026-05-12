"""One-shot ANBIMA full-history backfill.

Run via:
    docker compose exec -d api python -m api_extractor.scripts.backfill_anbima

Estimated runtime: ~16h (9 series × ~6000 business days × 1 rps polite throttle).
Idempotent: re-running picks up where it left off (only fetches dates after
the latest stored observation per series).

Progress is logged to stdout (visible via `docker compose logs api`) and
persists across api container restarts since each series runs to its own
completion before moving to the next.
"""

from __future__ import annotations

import asyncio
import datetime as dt
import time

from loguru import logger

from api_extractor.db import async_session_factory
from api_extractor.services.extraction_service import ExtractionService

ANBIMA_CODES: list[str] = [
    "IMA-Geral",
    "IMA-Geral_ex-C",
    "IMA-B",
    "IMA-B_5",
    "IMA-B_5plus",
    "IRF-M",
    "IRF-M_1",
    "IRF-M_1plus",
    "IMA-S",
]


async def backfill_one(code: str) -> None:
    t0 = time.monotonic()
    logger.info("anbima_backfill.start code={}", code)
    async with async_session_factory() as session:
        svc = ExtractionService(session)
        result = await svc.run_for(series_code=code)
    elapsed = int(time.monotonic() - t0)
    logger.info(
        "anbima_backfill.done code={} status={} count={} elapsed_s={}",
        code,
        result.status,
        result.observations_upserted,
        elapsed,
    )


async def main() -> None:
    logger.info("anbima_backfill.run codes={} start={}", len(ANBIMA_CODES), dt.datetime.now())
    for code in ANBIMA_CODES:
        try:
            await backfill_one(code)
        except Exception:  # noqa: BLE001
            logger.exception("anbima_backfill.error code={}", code)
            continue
    logger.info("anbima_backfill.complete end={}", dt.datetime.now())


if __name__ == "__main__":
    asyncio.run(main())
