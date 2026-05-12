"""Unit tests for jobs.py.

All tests mock service dependencies — no real DB or network I/O.
Tests verify that each job function calls the correct service with the
correct arguments and handles exceptions without propagating them.
"""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch

import pytest


# ── extract_daily_batch_job ────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_extract_daily_batch_job_calls_backfill_service() -> None:
    """extract_daily_batch_job must call BackfillService.run with daily+event codes."""
    mock_report = MagicMock()
    mock_report.total = 2
    mock_report.success = 2
    mock_report.failed = 0

    mock_svc = AsyncMock()
    mock_svc.run.return_value = mock_report

    # Mock the DB query returning daily+event codes.
    mock_result = MagicMock()
    mock_result.all.return_value = [("SELIC",), ("SELIC_meta",)]

    mock_session = AsyncMock()
    mock_session.execute.return_value = mock_result
    mock_session.__aenter__ = AsyncMock(return_value=mock_session)
    mock_session.__aexit__ = AsyncMock(return_value=False)

    mock_factory = MagicMock()
    mock_factory.return_value = mock_session

    # BackfillService is imported locally inside the job function — patch at source.
    with (
        patch("api_extractor.jobs.async_session_factory", mock_factory),
        patch(
            "api_extractor.services.backfill_service.BackfillService",
            return_value=mock_svc,
        ),
    ):
        from api_extractor.jobs import extract_daily_batch_job

        await extract_daily_batch_job()

    mock_svc.run.assert_awaited_once_with(codes=["SELIC", "SELIC_meta"])


@pytest.mark.asyncio
async def test_extract_daily_batch_job_no_op_when_no_codes() -> None:
    """extract_daily_batch_job must not call BackfillService when no codes found."""
    mock_result = MagicMock()
    mock_result.all.return_value = []

    mock_session = AsyncMock()
    mock_session.execute.return_value = mock_result
    mock_session.__aenter__ = AsyncMock(return_value=mock_session)
    mock_session.__aexit__ = AsyncMock(return_value=False)

    mock_factory = MagicMock()
    mock_factory.return_value = mock_session

    mock_svc_cls = MagicMock()

    with (
        patch("api_extractor.jobs.async_session_factory", mock_factory),
        patch(
            "api_extractor.services.backfill_service.BackfillService",
            mock_svc_cls,
        ),
    ):
        from api_extractor.jobs import extract_daily_batch_job

        await extract_daily_batch_job()

    # BackfillService should not have been instantiated.
    mock_svc_cls.assert_not_called()


@pytest.mark.asyncio
async def test_extract_daily_batch_job_does_not_propagate_exception() -> None:
    """extract_daily_batch_job must catch exceptions and not re-raise them."""
    mock_session = AsyncMock()
    mock_session.execute.side_effect = RuntimeError("DB exploded")
    mock_session.__aenter__ = AsyncMock(return_value=mock_session)
    mock_session.__aexit__ = AsyncMock(return_value=False)

    mock_factory = MagicMock()
    mock_factory.return_value = mock_session

    with patch("api_extractor.jobs.async_session_factory", mock_factory):
        from api_extractor.jobs import extract_daily_batch_job

        # Must not raise.
        await extract_daily_batch_job()


# ── extract_periodic_batch_job ─────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_extract_periodic_batch_job_calls_backfill_service() -> None:
    """extract_periodic_batch_job must call BackfillService.run with monthly+quarterly codes."""
    mock_report = MagicMock()
    mock_report.total = 3
    mock_report.success = 3
    mock_report.failed = 0

    mock_svc = AsyncMock()
    mock_svc.run.return_value = mock_report

    mock_result = MagicMock()
    mock_result.all.return_value = [("IPCA",), ("PIB",), ("Desemprego",)]

    mock_session = AsyncMock()
    mock_session.execute.return_value = mock_result
    mock_session.__aenter__ = AsyncMock(return_value=mock_session)
    mock_session.__aexit__ = AsyncMock(return_value=False)

    mock_factory = MagicMock()
    mock_factory.return_value = mock_session

    with (
        patch("api_extractor.jobs.async_session_factory", mock_factory),
        patch(
            "api_extractor.services.backfill_service.BackfillService",
            return_value=mock_svc,
        ),
    ):
        from api_extractor.jobs import extract_periodic_batch_job

        await extract_periodic_batch_job()

    mock_svc.run.assert_awaited_once_with(codes=["IPCA", "PIB", "Desemprego"])


@pytest.mark.asyncio
async def test_extract_periodic_batch_job_does_not_propagate_exception() -> None:
    """extract_periodic_batch_job must catch exceptions and not re-raise them."""
    mock_session = AsyncMock()
    mock_session.execute.side_effect = ConnectionError("network down")
    mock_session.__aenter__ = AsyncMock(return_value=mock_session)
    mock_session.__aexit__ = AsyncMock(return_value=False)

    mock_factory = MagicMock()
    mock_factory.return_value = mock_session

    with patch("api_extractor.jobs.async_session_factory", mock_factory):
        from api_extractor.jobs import extract_periodic_batch_job

        await extract_periodic_batch_job()


# ── refresh_calendar_job ───────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_refresh_calendar_job_calls_calendar_service() -> None:
    """refresh_calendar_job must call CalendarService.refresh_all with a session."""
    mock_report = MagicMock()
    mock_report.upserted = 10
    mock_report.scraped_count = 8
    mock_report.hardcoded_count = 5
    mock_report.errors = {}

    mock_svc = AsyncMock()
    mock_svc.refresh_all.return_value = mock_report

    mock_session = AsyncMock()
    mock_session.__aenter__ = AsyncMock(return_value=mock_session)
    mock_session.__aexit__ = AsyncMock(return_value=False)

    mock_factory = MagicMock()
    mock_factory.return_value = mock_session

    with (
        patch("api_extractor.jobs.async_session_factory", mock_factory),
        patch(
            "api_extractor.calendar_scraper.service.CalendarService",
            return_value=mock_svc,
        ),
    ):
        from api_extractor.jobs import refresh_calendar_job

        await refresh_calendar_job()

    mock_svc.refresh_all.assert_awaited_once_with(mock_session)


@pytest.mark.asyncio
async def test_refresh_calendar_job_commits_session() -> None:
    """refresh_calendar_job must commit the session after refresh_all."""
    mock_report = MagicMock()
    mock_report.upserted = 0
    mock_report.scraped_count = 0
    mock_report.hardcoded_count = 0
    mock_report.errors = {}

    mock_svc = AsyncMock()
    mock_svc.refresh_all.return_value = mock_report

    mock_session = AsyncMock()
    mock_session.__aenter__ = AsyncMock(return_value=mock_session)
    mock_session.__aexit__ = AsyncMock(return_value=False)

    mock_factory = MagicMock()
    mock_factory.return_value = mock_session

    with (
        patch("api_extractor.jobs.async_session_factory", mock_factory),
        patch(
            "api_extractor.calendar_scraper.service.CalendarService",
            return_value=mock_svc,
        ),
    ):
        from api_extractor.jobs import refresh_calendar_job

        await refresh_calendar_job()

    mock_session.commit.assert_awaited_once()


@pytest.mark.asyncio
async def test_refresh_calendar_job_does_not_propagate_exception() -> None:
    """refresh_calendar_job must catch exceptions and not re-raise them."""
    mock_session = AsyncMock()
    mock_session.__aenter__ = AsyncMock(return_value=mock_session)
    mock_session.__aexit__ = AsyncMock(return_value=False)

    mock_factory = MagicMock()
    mock_factory.return_value = mock_session

    mock_svc = AsyncMock()
    mock_svc.refresh_all.side_effect = Exception("scraper explosion")

    with (
        patch("api_extractor.jobs.async_session_factory", mock_factory),
        patch(
            "api_extractor.calendar_scraper.service.CalendarService",
            return_value=mock_svc,
        ),
    ):
        from api_extractor.jobs import refresh_calendar_job

        # Must not raise.
        await refresh_calendar_job()
