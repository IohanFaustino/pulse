"""Tests for GET /releases endpoint."""

from __future__ import annotations

import pytest

from tests.fixtures_api import api_client  # noqa: F401


@pytest.mark.asyncio
async def test_releases_returns_200(api_client):
    """GET /releases must return HTTP 200."""
    resp = await api_client.get("/releases")
    assert resp.status_code == 200


@pytest.mark.asyncio
async def test_releases_response_shape(api_client):
    """GET /releases must return items list, total, month, category."""
    resp = await api_client.get("/releases")
    data = resp.json()
    assert "items" in data
    assert "total" in data
    assert "month" in data
    assert "category" in data
    assert isinstance(data["items"], list)
    assert data["total"] == len(data["items"])


@pytest.mark.asyncio
async def test_releases_item_fields(api_client):
    """Each release item must have required fields."""
    resp = await api_client.get("/releases")
    items = resp.json()["items"]
    if not items:
        pytest.skip("No releases in DB.")
    item = items[0]
    for field in {"id", "series_code", "scheduled_for", "status", "source_type"}:
        assert field in item, f"Missing field: {field}"


@pytest.mark.asyncio
async def test_releases_filter_by_month(api_client):
    """?month=YYYY-MM filter must work and set month field in response."""
    resp = await api_client.get("/releases", params={"month": "2026-05"})
    assert resp.status_code == 200
    data = resp.json()
    assert data["month"] == "2026-05"
    for item in data["items"]:
        assert item["scheduled_for"][:7] == "2026-05"


@pytest.mark.asyncio
async def test_releases_invalid_month_format_returns_422(api_client):
    """Invalid month format must return 422."""
    resp = await api_client.get("/releases", params={"month": "2026/05"})
    assert resp.status_code == 422

    resp2 = await api_client.get("/releases", params={"month": "May 2026"})
    assert resp2.status_code == 422


@pytest.mark.asyncio
async def test_releases_filter_by_category(api_client):
    """?category= filter must return releases for that category."""
    resp = await api_client.get("/releases", params={"category": "Inflação"})
    assert resp.status_code == 200
    data = resp.json()
    assert data["category"] == "Inflação"


@pytest.mark.asyncio
async def test_releases_future_month_returns_200(api_client):
    """Far-future month with no events must return 200 with empty items."""
    resp = await api_client.get("/releases", params={"month": "2099-12"})
    assert resp.status_code == 200
    data = resp.json()
    assert data["items"] == []
    assert data["total"] == 0


@pytest.mark.asyncio
async def test_releases_month_category_combined(api_client):
    """Combined month + category filter must respect both constraints."""
    resp = await api_client.get(
        "/releases", params={"month": "2026-05", "category": "Inflação"}
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["month"] == "2026-05"
    assert data["category"] == "Inflação"
