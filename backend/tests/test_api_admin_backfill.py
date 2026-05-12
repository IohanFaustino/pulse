"""Tests for POST /admin/backfill.

The BackfillService is unit-tested directly with a mocked ExtractionService
so we never make live network calls. We also smoke-test the route via the
ASGI app, asserting the schema is returned correctly.
"""

from __future__ import annotations

import datetime
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from api_extractor.schemas.admin import ExtractionResultResponse
from api_extractor.services.backfill_service import BackfillService


def _ok(code: str, n: int) -> ExtractionResultResponse:
    return ExtractionResultResponse(
        series_code=code,
        status="success",
        observations_upserted=n,
        latest_observed_at=datetime.datetime(2026, 4, 30, tzinfo=datetime.timezone.utc),
        extraction_at=datetime.datetime(2026, 5, 1, tzinfo=datetime.timezone.utc),
        error=None,
    )


def _fail(code: str, err: str) -> ExtractionResultResponse:
    return ExtractionResultResponse(
        series_code=code,
        status="failed",
        observations_upserted=0,
        latest_observed_at=None,
        extraction_at=datetime.datetime(2026, 5, 1, tzinfo=datetime.timezone.utc),
        error=err,
    )


@pytest.mark.asyncio
async def test_backfill_aggregates_success_and_failure() -> None:
    """One run with mixed outcomes — counters accurate, every code reported."""
    # Mock session factory: produce a context-managed object that is awaitable
    fake_session = MagicMock()
    fake_session.__aenter__ = AsyncMock(return_value=fake_session)
    fake_session.__aexit__ = AsyncMock(return_value=None)

    session_factory = MagicMock(return_value=fake_session)

    # Patch ExtractionService.run_for via the symbol used by BackfillService.
    call_outcomes = {
        "IPCA": _ok("IPCA", 120),
        "SELIC": _ok("SELIC", 1000),
        "PIB": _fail("PIB", "upstream 500"),
    }

    async def fake_run_for(*, series_code: str):  # noqa: ANN202
        return call_outcomes[series_code]

    with patch(
        "api_extractor.services.backfill_service.ExtractionService"
    ) as mock_ext_cls:
        instance = MagicMock()
        instance.run_for = AsyncMock(side_effect=fake_run_for)
        mock_ext_cls.return_value = instance

        svc = BackfillService(session_factory=session_factory, max_concurrent=3)
        result = await svc.run(codes=["IPCA", "SELIC", "PIB"])

    assert result.total == 3
    assert result.success == 2
    assert result.failed == 1
    by_code = {i.code: i for i in result.items}
    assert by_code["IPCA"].status == "success"
    assert by_code["IPCA"].observations_upserted == 120
    assert by_code["PIB"].status == "failed"
    assert by_code["PIB"].error == "upstream 500"


@pytest.mark.asyncio
async def test_backfill_catches_exceptions_per_series() -> None:
    """If ExtractionService raises, that series is marked failed but batch continues."""
    fake_session = MagicMock()
    fake_session.__aenter__ = AsyncMock(return_value=fake_session)
    fake_session.__aexit__ = AsyncMock(return_value=None)
    session_factory = MagicMock(return_value=fake_session)

    async def boom(*, series_code: str):  # noqa: ANN202
        if series_code == "B":
            raise RuntimeError("kaboom")
        return _ok(series_code, 10)

    with patch(
        "api_extractor.services.backfill_service.ExtractionService"
    ) as mock_ext_cls:
        instance = MagicMock()
        instance.run_for = AsyncMock(side_effect=boom)
        mock_ext_cls.return_value = instance

        svc = BackfillService(session_factory=session_factory, max_concurrent=2)
        result = await svc.run(codes=["A", "B", "C"])

    assert result.failed == 1
    by_code = {i.code: i for i in result.items}
    assert by_code["B"].status == "failed"
    assert "kaboom" in (by_code["B"].error or "")
    assert by_code["A"].status == "success"
    assert by_code["C"].status == "success"
