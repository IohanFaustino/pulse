"""Phase 10 end-to-end acceptance criteria tests.

Codifies the three acceptance criteria that were NOT yet covered by
``tests/test_api_acceptance.py``:

- AC-1: Full backfill coverage — every series has at least one observation.
- AC-4: Extraction failure marks series stale and is logged structurally.
- AC-5: Calendar releases are filterable by month and return data for current
        and next month.

AC-2, AC-3, AC-6, AC-7 are already covered in ``test_api_acceptance.py`` and
are NOT re-implemented here (would be duplicate evidence).

These tests run live against the seeded test database; they do not perform
upstream network I/O — failure injection is done via FastAPI dependency
override.
"""

from __future__ import annotations

import datetime as dt

import pytest
import pytest_asyncio
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from api_extractor.extractors.base import (
    ExtractionError,
    ExtractionResult,
    SourceAdapter,
)
from api_extractor.models.series import Series
from api_extractor.repos.series_repo import SeriesRepo
from api_extractor.services.extraction_service import ExtractionService
from tests.fixtures_api import api_client  # noqa: F401

_DB_URL = "postgresql+asyncpg://postgres:postgres@postgres:5432/api_extractor"


# ── AC-1 ──────────────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_ac1_full_backfill_coverage():
    """AC-1: All seeded series with existing adapters should have observations after backfill.

    Reads current DB state — no upstream calls.
    Wave A (Phase 20) adds 25 new series that have no adapters yet (Wave B/C);
    those will have 0 observations by design and are excluded from the check.
    Only the original 25 legacy series are asserted here.
    """
    # Legacy series codes that must have observations (adapters exist).
    legacy_codes = {
        "IPCA", "IPCA-15", "IGP-M", "IGP-DI", "INPC",
        "SELIC", "SELIC_meta", "CDI", "TR",
        "PTAX_USD", "PTAX_EUR",
        "Ibovespa", "IFIX",
        "PIB", "IBC-Br", "Prod_Industrial", "Vendas_Varejo",
        "Desemprego", "Rendimento_Medio", "CAGED",
        "Resultado_Primario", "Divida_Bruta",
        "Balanca_Comercial", "Reservas_Internacionais", "Conta_Corrente",
    }

    engine = create_async_engine(_DB_URL, pool_pre_ping=True)
    factory = async_sessionmaker(bind=engine, class_=AsyncSession, expire_on_commit=False)
    try:
        async with factory() as session:
            from api_extractor.models.observation import Observation

            series_rows = (await session.execute(select(Series.code))).scalars().all()
            # Phase 20 Wave A added 25 new series (no adapters yet) → total is now 50.
            assert len(series_rows) >= 25, f"Expected at least 25 seeded series, got {len(series_rows)}"

            missing: list[str] = []
            for code in series_rows:
                if code not in legacy_codes:
                    # New Wave A series — adapters built in Wave B/C; skip observation check.
                    continue
                count = (
                    await session.execute(
                        select(Observation).where(Observation.series_code == code).limit(1)
                    )
                ).first()
                if count is None:
                    missing.append(code)

            assert not missing, (
                f"AC-1 FAIL: {len(missing)} of 25 legacy series have zero observations: {missing}. "
                "Full-history backfill is incomplete."
            )
    finally:
        await engine.dispose()


# ── AC-4 ──────────────────────────────────────────────────────────────────────


class _AlwaysFailingAdapter(SourceAdapter):
    """SourceAdapter stub that always raises ExtractionError on fetch.

    Simulates the BCB SGS upstream being unreachable after all retries
    have been exhausted by the adapter's tenacity decorator.
    """

    source = "test_failing"

    async def fetch(
        self,
        series: Series,
        since: dt.date | None = None,
    ) -> ExtractionResult:
        raise ExtractionError(
            source=self.source,
            series_code=series.code,
            message="Simulated upstream outage after 3 retries.",
        )


class _FailingExtractionService(ExtractionService):
    """ExtractionService variant whose adapter is hard-coded to fail.

    Avoids touching the global adapter registry. The router calls
    ``run_for(series_code=...)`` without an adapter override; our subclass
    intercepts and injects ``_AlwaysFailingAdapter``.
    """

    async def run_for(  # type: ignore[override]
        self,
        series_code: str,
        adapter=None,
    ):
        return await super().run_for(
            series_code=series_code,
            adapter=_AlwaysFailingAdapter(),
        )


@pytest.mark.asyncio
async def test_ac4_extraction_failure_marks_stale(api_client):  # noqa: F811
    """AC-4: After upstream failure, series.status='stale' and response.status='failed'.

    Uses a FastAPI dependency override that injects a failing adapter. Restores
    SELIC.status to 'fresh' in teardown so other tests / live system are not
    polluted.
    """
    from api_extractor.deps import get_extraction_service, get_session
    from api_extractor.main import app

    code = "SELIC"

    # Snapshot original status to restore after the test.
    engine = create_async_engine(_DB_URL, pool_pre_ping=True)
    factory = async_sessionmaker(bind=engine, class_=AsyncSession, expire_on_commit=False)
    async with factory() as session:
        repo = SeriesRepo(session)
        original = await repo.get(code)
        if original is None:
            await engine.dispose()
            pytest.skip(f"{code} not seeded — AC-4 requires SELIC in DB.")
        original_status = original.status
        original_last_success = original.last_success_at

    # Build the failing service using the api_client's overridden session factory.
    # The api_client fixture already overrides get_session — we want to nest a
    # second override on top of it that uses the SAME session to construct
    # _FailingExtractionService.
    session_override = app.dependency_overrides.get(get_session)
    assert session_override is not None, "api_client fixture must override get_session"

    async def _get_failing_service():
        async for sess in session_override():
            yield _FailingExtractionService(sess)

    app.dependency_overrides[get_extraction_service] = _get_failing_service

    try:
        resp = await api_client.post(f"/admin/extract/{code}")
        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert body["status"] == "failed", f"Expected status=failed, got {body['status']}"
        assert body["error"] is not None and "Simulated" in body["error"]

        # Verify series row was marked stale.
        get_resp = await api_client.get(f"/series/{code}")
        assert get_resp.status_code == 200
        series_body = get_resp.json()
        assert series_body["status"] == "stale", (
            f"Expected series.status=stale, got {series_body['status']}"
        )
    finally:
        app.dependency_overrides.pop(get_extraction_service, None)
        # Restore SELIC.status to original value.
        async with factory() as session:
            repo = SeriesRepo(session)
            await repo.update_status(
                code=code,
                status=original_status,
                last_success_at=original_last_success,
            )
            await session.commit()
        await engine.dispose()


# ── AC-5 ──────────────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_ac5_releases_filterable_by_month(api_client):  # noqa: F811
    """AC-5: GET /releases?month=YYYY-MM returns items for current + next month.

    Asserts the endpoint accepts the month filter and that the seeded
    release calendar covers at least the current and next month.
    """
    today = dt.date.today()
    cur_month = today.strftime("%Y-%m")
    if today.month == 12:
        next_month_dt = dt.date(today.year + 1, 1, 1)
    else:
        next_month_dt = dt.date(today.year, today.month + 1, 1)
    next_month = next_month_dt.strftime("%Y-%m")

    for month in (cur_month, next_month):
        resp = await api_client.get(f"/releases?month={month}")
        assert resp.status_code == 200, f"Expected 200 for month={month}, got {resp.status_code}"
        body = resp.json()
        items = body.get("items", body) if isinstance(body, dict) else body
        assert isinstance(items, list)
        assert len(items) >= 1, (
            f"AC-5 FAIL: month={month} returned 0 releases — calendar coverage <2 months."
        )
        # Verify each item's scheduled_for falls in the requested month.
        for item in items:
            scheduled = item.get("scheduled_for") or item.get("date")
            if scheduled is not None:
                assert scheduled.startswith(month), (
                    f"Release scheduled_for={scheduled} not in month={month}"
                )
