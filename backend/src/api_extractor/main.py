"""FastAPI application entry point.

Phase 5: Full REST API with routers, lifespan, CORS, and exception handlers.
OpenAPI schema auto-exposed at /openapi.json and /docs.
"""

from __future__ import annotations

from contextlib import asynccontextmanager
from typing import AsyncGenerator

import redis.asyncio as aioredis
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from loguru import logger

from api_extractor.config import settings
from api_extractor.db import engine
from api_extractor.extractors.base import ExtractionError
from api_extractor.routers import admin, health, release, series, transform, user_prefs
from api_extractor.scheduler import build_scheduler, register_jobs


# ── OpenAPI metadata ───────────────────────────────────────────────────────────

_OPENAPI_TAGS = [
    {
        "name": "health",
        "description": "System health and per-series freshness status.",
    },
    {
        "name": "series",
        "description": (
            "Economic indicator series metadata, observations, and raw data access. "
            "25 Brazilian macro indicators: IPCA, SELIC, CDI, PIB, Ibovespa, etc."
        ),
    },
    {
        "name": "transform",
        "description": (
            "On-demand statistical transforms computed server-side via pandas. "
            "Supports 17 ops: level, MoM, YoY, MA, EWMA, z-score, rebase, and more. "
            "Results cached in Redis (TTL per series frequency)."
        ),
    },
    {
        "name": "releases",
        "description": (
            "Economic indicator release calendar. "
            "Upcoming (E) and realized (R) events from IBGE, BCB, and hardcoded schedules."
        ),
    },
    {
        "name": "user_prefs",
        "description": (
            "User preferences: pinned series for Painel, per-card transform specs, "
            "and recently viewed series. Persisted in Postgres (single-user, id=1)."
        ),
    },
    {
        "name": "admin",
        "description": (
            "Administrative operations. Manual extraction trigger (live network call). "
            "No authentication required in v1 single-user deployment."
        ),
    },
]


# ── Lifespan ───────────────────────────────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    """Manage application lifespan: open/close DB engine, Redis client, and scheduler."""
    # Open Redis connection pool.
    redis_client = aioredis.from_url(
        settings.redis_url,
        encoding="utf-8",
        decode_responses=False,  # Keep bytes for gzip payloads.
    )
    app.state.redis = redis_client
    logger.info("Redis client opened: {url}", url=settings.redis_url)

    # Warm up the DB engine (creates the pool).
    async with engine.begin():
        pass
    logger.info("Database engine warmed up.")

    # Start scheduler (if enabled).
    if settings.scheduler_enabled:
        scheduler = build_scheduler()
        register_jobs(scheduler)
        scheduler.start()
        app.state.scheduler = scheduler
        logger.info("Scheduler started with {} jobs.", len(scheduler.get_jobs()))
    else:
        app.state.scheduler = None
        logger.info("Scheduler disabled (SCHEDULER_ENABLED=false).")

    logger.info("Application startup complete.")
    yield

    # Teardown: scheduler first (stops new job fires), then connections.
    if settings.scheduler_enabled and app.state.scheduler is not None:
        app.state.scheduler.shutdown(wait=False)
        logger.info("Scheduler shut down.")

    await redis_client.aclose()
    logger.info("Redis client closed.")
    await engine.dispose()
    logger.info("Database engine disposed.")


# ── App factory ────────────────────────────────────────────────────────────────

app = FastAPI(
    title="API Extractor",
    description=(
        "Brazilian economic indicators extraction, storage, and dashboard API. "
        "25 macro indicators from BCB SGS, IBGE SIDRA, and B3/Yahoo Finance. "
        "Supports on-demand transforms, pinned dashboards, and release calendars."
    ),
    version="0.5.0",
    docs_url="/docs",
    redoc_url="/redoc",
    openapi_tags=_OPENAPI_TAGS,
    servers=[{"url": "http://localhost:8000", "description": "Local development"}],
    lifespan=lifespan,
)

# ── CORS ───────────────────────────────────────────────────────────────────────

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:5174",
        "http://127.0.0.1:5174",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Exception handlers ─────────────────────────────────────────────────────────

@app.exception_handler(ExtractionError)
async def extraction_error_handler(request: Request, exc: ExtractionError) -> JSONResponse:
    """Return 503 Service Unavailable when upstream extraction fails completely."""
    logger.error("ExtractionError on {path}: {err}", path=request.url.path, err=str(exc))
    return JSONResponse(
        status_code=503,
        content={"detail": str(exc), "code": "extraction_failed"},
    )


@app.exception_handler(ValueError)
async def value_error_handler(request: Request, exc: ValueError) -> JSONResponse:
    """Return 404 for domain-level not-found ValueError (e.g. series not found)."""
    return JSONResponse(
        status_code=404,
        content={"detail": str(exc), "code": "not_found"},
    )


# ── Routers ────────────────────────────────────────────────────────────────────
# No /api/v1 prefix — frontend proxy maps /api → http://api:8000 and passes
# the full path through. Top-level paths keep the proxy config simple.

app.include_router(health.router)
app.include_router(series.router)
app.include_router(transform.router)
app.include_router(release.router)
app.include_router(user_prefs.router)
app.include_router(admin.router)
