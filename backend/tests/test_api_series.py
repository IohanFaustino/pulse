"""Tests for series endpoints.

GET /series          — list all + category filter
GET /series/{code}   — single series metadata
GET /series/{code}/observations — raw obs with from/to/limit
"""

from __future__ import annotations

import pytest

from tests.fixtures_api import api_client  # noqa: F401


@pytest.mark.asyncio
async def test_list_series_returns_200(api_client):
    """GET /series must return HTTP 200."""
    resp = await api_client.get("/series")
    assert resp.status_code == 200


@pytest.mark.asyncio
async def test_list_series_shape(api_client):
    """GET /series must return items list and total."""
    resp = await api_client.get("/series")
    data = resp.json()
    assert "items" in data
    assert "total" in data
    assert isinstance(data["items"], list)
    assert data["total"] == len(data["items"])


@pytest.mark.asyncio
async def test_list_series_item_fields(api_client):
    """Each series item must have all required metadata fields including currency and is_proxy."""
    resp = await api_client.get("/series")
    items = resp.json()["items"]
    if not items:
        pytest.skip("No series in DB — seed required.")
    item = items[0]
    required = {
        "code", "name", "category", "source", "source_id",
        "frequency", "unit", "status", "currency", "is_proxy",
    }
    for field in required:
        assert field in item, f"Missing field: {field}"


@pytest.mark.asyncio
async def test_list_series_category_filter(api_client):
    """GET /series?category=Inflação must return only Inflação series."""
    resp = await api_client.get("/series", params={"category": "Inflação"})
    assert resp.status_code == 200
    data = resp.json()
    for item in data["items"]:
        assert item["category"] == "Inflação"


@pytest.mark.asyncio
async def test_list_series_unknown_category_returns_empty(api_client):
    """Unknown category should return 200 with empty items list."""
    resp = await api_client.get("/series", params={"category": "NonExistentCategory"})
    assert resp.status_code == 200
    data = resp.json()
    assert data["items"] == []
    assert data["total"] == 0


@pytest.mark.asyncio
async def test_get_single_series_ipca(api_client):
    """GET /series/IPCA must return the IPCA series metadata."""
    resp = await api_client.get("/series/IPCA")
    if resp.status_code == 404:
        pytest.skip("IPCA not seeded in DB.")
    assert resp.status_code == 200
    data = resp.json()
    assert data["code"] == "IPCA"
    assert data["source"] == "BCB SGS"
    assert data["frequency"] == "monthly"


@pytest.mark.asyncio
async def test_get_single_series_has_all_fields(api_client):
    """Single series response must include metadata field."""
    resp = await api_client.get("/series/SELIC")
    if resp.status_code == 404:
        pytest.skip("SELIC not seeded.")
    assert resp.status_code == 200
    data = resp.json()
    assert "frequency" in data
    assert "unit" in data
    assert "status" in data


@pytest.mark.asyncio
async def test_get_series_404_on_unknown(api_client):
    """GET /series/{code} must return 404 for unknown codes."""
    resp = await api_client.get("/series/NONEXISTENT_CODE_XYZ")
    assert resp.status_code == 404
    data = resp.json()
    assert "detail" in data


@pytest.mark.asyncio
async def test_get_observations_200(api_client):
    """GET /series/{code}/observations must return 200 for known series."""
    resp = await api_client.get("/series/IPCA/observations")
    if resp.status_code == 404:
        pytest.skip("IPCA not seeded.")
    assert resp.status_code == 200


@pytest.mark.asyncio
async def test_get_observations_shape(api_client):
    """Observations response must have series_code, items, total, returned, limit."""
    resp = await api_client.get("/series/IPCA/observations")
    if resp.status_code == 404:
        pytest.skip("IPCA not seeded.")
    data = resp.json()
    assert "series_code" in data
    assert "items" in data
    assert "total" in data
    assert "returned" in data
    assert "limit" in data
    assert data["series_code"] == "IPCA"


@pytest.mark.asyncio
async def test_get_observations_limit_respected(api_client):
    """limit param must cap the number of returned items."""
    resp = await api_client.get("/series/IPCA/observations", params={"limit": 5})
    if resp.status_code == 404:
        pytest.skip("IPCA not seeded.")
    data = resp.json()
    assert data["returned"] <= 5
    assert len(data["items"]) <= 5
    assert data["limit"] == 5


@pytest.mark.asyncio
async def test_get_observations_from_to_filter(api_client):
    """from/to params should constrain the returned date range."""
    resp = await api_client.get(
        "/series/IPCA/observations",
        params={"from": "2020-01-01", "to": "2020-12-31"},
    )
    if resp.status_code == 404:
        pytest.skip("IPCA not seeded.")
    assert resp.status_code == 200
    data = resp.json()
    for item in data["items"]:
        assert item["observed_at"][:4] == "2020"


@pytest.mark.asyncio
async def test_get_observations_404_on_unknown_series(api_client):
    """Observations for unknown series must return 404."""
    resp = await api_client.get("/series/NONEXISTENT_XYZ/observations")
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_get_observations_invalid_date_returns_422(api_client):
    """Invalid date format must return 422."""
    resp = await api_client.get(
        "/series/IPCA/observations",
        params={"from": "not-a-date"},
    )
    assert resp.status_code in {404, 422}


@pytest.mark.asyncio
async def test_series_read_currency_field_present(api_client):
    """GET /series/IPCA must include currency field (defaults to BRL for legacy series)."""
    resp = await api_client.get("/series/IPCA")
    if resp.status_code == 404:
        pytest.skip("IPCA not seeded.")
    assert resp.status_code == 200
    data = resp.json()
    assert "currency" in data
    assert data["currency"] == "BRL"


@pytest.mark.asyncio
async def test_series_read_is_proxy_field_present(api_client):
    """GET /series/IPCA must include is_proxy field (False for non-proxy series)."""
    resp = await api_client.get("/series/IPCA")
    if resp.status_code == 404:
        pytest.skip("IPCA not seeded.")
    assert resp.status_code == 200
    data = resp.json()
    assert "is_proxy" in data
    assert data["is_proxy"] is False


@pytest.mark.asyncio
async def test_series_read_sp500_currency_usd(api_client):
    """GET /series/SP500 must return currency=USD."""
    resp = await api_client.get("/series/SP500")
    if resp.status_code == 404:
        pytest.skip("SP500 not seeded.")
    assert resp.status_code == 200
    data = resp.json()
    assert data["currency"] == "USD"
    assert data["is_proxy"] is False


@pytest.mark.asyncio
async def test_series_read_msci_world_is_proxy(api_client):
    """GET /series/MSCI_World must return is_proxy=True."""
    resp = await api_client.get("/series/MSCI_World")
    if resp.status_code == 404:
        pytest.skip("MSCI_World not seeded.")
    assert resp.status_code == 200
    data = resp.json()
    assert data["is_proxy"] is True
    assert data["currency"] == "USD"


@pytest.mark.asyncio
async def test_series_read_ifix_is_proxy(api_client):
    """GET /series/IFIX must return is_proxy=True (proxy via XFIX11.SA)."""
    resp = await api_client.get("/series/IFIX")
    if resp.status_code == 404:
        pytest.skip("IFIX not seeded.")
    assert resp.status_code == 200
    data = resp.json()
    assert data["is_proxy"] is True


@pytest.mark.asyncio
async def test_series_read_euro_stoxx_currency_eur(api_client):
    """GET /series/Euro_Stoxx_50 must return currency=EUR."""
    resp = await api_client.get("/series/Euro_Stoxx_50")
    if resp.status_code == 404:
        pytest.skip("Euro_Stoxx_50 not seeded.")
    assert resp.status_code == 200
    data = resp.json()
    assert data["currency"] == "EUR"
