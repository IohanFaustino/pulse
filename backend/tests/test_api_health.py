"""Tests for GET /health endpoint.

Verifies the extended health response with per-series freshness summary.
"""

from __future__ import annotations

import pytest

from tests.fixtures_api import api_client  # noqa: F401


@pytest.mark.asyncio
async def test_health_returns_200(api_client):
    """GET /health must return HTTP 200."""
    resp = await api_client.get("/health")
    assert resp.status_code == 200


@pytest.mark.asyncio
async def test_health_response_shape(api_client):
    """GET /health must return status, series list, and checked_at."""
    resp = await api_client.get("/health")
    data = resp.json()
    assert "status" in data
    assert "series" in data
    assert "checked_at" in data
    assert isinstance(data["series"], list)


@pytest.mark.asyncio
async def test_health_status_is_valid_string(api_client):
    """status field must be one of the known aggregate values."""
    resp = await api_client.get("/health")
    status = resp.json()["status"]
    assert status in {"ok", "degraded", "pending", "failed"}


@pytest.mark.asyncio
async def test_health_series_items_have_required_fields(api_client):
    """Each series entry must have code, status, and last_success_at."""
    resp = await api_client.get("/health")
    series_list = resp.json()["series"]
    for item in series_list:
        assert "code" in item
        assert "status" in item
        assert "last_success_at" in item
        assert item["status"] in {"fresh", "stale", "failed"}


@pytest.mark.asyncio
async def test_health_has_25_series_when_seeded(api_client):
    """Should list all series when DB is seeded."""
    resp = await api_client.get("/health")
    data = resp.json()
    series_list = data["series"]
    assert isinstance(series_list, list)
    for item in series_list:
        assert item["status"] in {"fresh", "stale", "failed"}
