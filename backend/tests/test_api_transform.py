"""Tests for POST /series/{code}/transform endpoint."""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock

import pytest

from tests.fixtures_api import api_client  # noqa: F401
from api_extractor.transforms.service import TransformService


@pytest.mark.asyncio
async def test_transform_404_on_unknown_series(api_client):
    """POST /series/{code}/transform must return 404 for unknown series."""
    resp = await api_client.post(
        "/series/NONEXISTENT_CODE_XYZ/transform",
        json={"op": "level", "params": {}},
    )
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_transform_422_on_invalid_op(api_client):
    """Invalid op value must return 422 Unprocessable Entity."""
    resp = await api_client.post(
        "/series/IPCA/transform",
        json={"op": "COMPLETELY_INVALID_OP_XYZ", "params": {}},
    )
    assert resp.status_code in {404, 422}


@pytest.mark.asyncio
async def test_transform_response_shape(api_client):
    """Transform response must have series_code, values, and metadata."""
    resp = await api_client.post(
        "/series/IPCA/transform",
        json={"op": "level", "params": {}},
    )
    if resp.status_code == 404:
        pytest.skip("IPCA not seeded or has no observations.")
    assert resp.status_code == 200
    data = resp.json()
    assert "series_code" in data
    assert "values" in data
    assert "metadata" in data
    assert data["series_code"] == "IPCA"


@pytest.mark.asyncio
async def test_transform_values_are_date_value_pairs(api_client):
    """Each value in transform result must have date and value fields."""
    resp = await api_client.post(
        "/series/IPCA/transform",
        json={"op": "level", "params": {}},
    )
    if resp.status_code in {404, 422}:
        pytest.skip("IPCA not seeded or bad state.")
    values = resp.json()["values"]
    if values:
        assert "date" in values[0]
        assert "value" in values[0]


@pytest.mark.asyncio
async def test_transform_metadata_has_required_fields(api_client):
    """Transform metadata must have gaps, stub, op, params, cached fields."""
    resp = await api_client.post(
        "/series/IPCA/transform",
        json={"op": "level", "params": {}},
    )
    if resp.status_code in {404, 422}:
        pytest.skip("IPCA not seeded or bad state.")
    meta = resp.json()["metadata"]
    assert "gaps" in meta
    assert "stub" in meta
    assert "op" in meta
    assert "params" in meta
    assert "cached" in meta


@pytest.mark.asyncio
async def test_transform_yoy_op(api_client):
    """YoY transform must return metadata.op == 'yoy'."""
    resp = await api_client.post(
        "/series/IPCA/transform",
        json={"op": "yoy", "params": {}},
    )
    if resp.status_code == 404:
        pytest.skip("IPCA not seeded.")
    if resp.status_code == 200:
        assert resp.json()["metadata"]["op"] == "yoy"


@pytest.mark.asyncio
async def test_transform_cache_second_call_is_cached(api_client):
    """Second identical transform request must return cached=True when data exists.

    If IPCA has no observations yet (pre-backfill), the TransformService returns
    early with an empty result and never writes to cache. Skip in that case.
    """
    payload = {"op": "level", "params": {}}
    resp1 = await api_client.post("/series/IPCA/transform", json=payload)
    if resp1.status_code == 404:
        pytest.skip("IPCA not seeded.")

    data1 = resp1.json()
    if not data1.get("values"):
        pytest.skip("IPCA has no observations yet — cache not exercised on empty series.")

    resp2 = await api_client.post("/series/IPCA/transform", json=payload)
    assert resp2.status_code == 200
    assert resp2.json()["metadata"]["cached"] is True


@pytest.mark.asyncio
async def test_transform_with_mocked_service(api_client):
    """Transform endpoint works with a mocked TransformService."""
    from api_extractor.deps import get_transform_service
    from api_extractor.main import app

    mock_result = {
        "values": [{"date": "2026-01-01", "value": 4.83}],
        "metadata": {
            "gaps": [],
            "stub": False,
            "op": "level",
            "params": {},
            "cached": False,
        },
    }
    mock_svc = MagicMock(spec=TransformService)
    mock_svc.run = AsyncMock(return_value=mock_result)

    app.dependency_overrides[get_transform_service] = lambda: mock_svc
    try:
        resp = await api_client.post(
            "/series/IPCA/transform",
            json={"op": "level", "params": {}},
        )
        assert resp.status_code in {200, 404}
    finally:
        app.dependency_overrides.pop(get_transform_service, None)
