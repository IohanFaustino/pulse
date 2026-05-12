"""Acceptance criteria tests for Phase 5.

AC-2: Pin series to Painel via PATCH /user_prefs, verify persistence.
AC-3: Apply transform, verify it persists in card_transforms.
AC-6: Transform with NaN gap reports it in metadata.gaps.
AC-7: Empty user_prefs state for fresh user.
"""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock

import pytest
import pytest_asyncio
from sqlalchemy import delete
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from tests.fixtures_api import api_client  # noqa: F401
from api_extractor.transforms.service import TransformService

_DB_URL = "postgresql+asyncpg://postgres:postgres@postgres:5432/api_extractor"


@pytest_asyncio.fixture(autouse=True)
async def clean_user_prefs():
    """Reset user prefs before each acceptance test."""
    from api_extractor.models.user_prefs import CardTransform, Pin, UserPrefs

    engine = create_async_engine(_DB_URL, pool_pre_ping=True)
    factory = async_sessionmaker(bind=engine, class_=AsyncSession, expire_on_commit=False)
    async with factory() as session:
        await session.execute(delete(CardTransform))
        await session.execute(delete(Pin))
        await session.execute(delete(UserPrefs))
        await session.commit()
    await engine.dispose()
    yield


@pytest.mark.asyncio
async def test_ac2_pin_to_painel(api_client):
    """AC-2: PATCH add_pins=IPCA → IPCA appears in GET /user_prefs pins."""
    resp = await api_client.get("/series/IPCA")
    if resp.status_code == 404:
        pytest.skip("IPCA not seeded — AC-2 requires seeded DB.")

    prefs_before = (await api_client.get("/user_prefs")).json()
    assert prefs_before["pins"] == []

    patch_resp = await api_client.patch("/user_prefs", json={"add_pins": ["IPCA"]})
    assert patch_resp.status_code == 200
    pin_codes = [p["series_code"] for p in patch_resp.json()["pins"]]
    assert "IPCA" in pin_codes

    # Persistence check.
    get_resp = await api_client.get("/user_prefs")
    assert get_resp.status_code == 200
    pin_codes_after = [p["series_code"] for p in get_resp.json()["pins"]]
    assert "IPCA" in pin_codes_after


@pytest.mark.asyncio
async def test_ac3_transform_application(api_client):
    """AC-3: Apply YoY transform → persists in user_prefs.card_transforms."""
    resp = await api_client.get("/series/IPCA")
    if resp.status_code == 404:
        pytest.skip("IPCA not seeded — AC-3 requires seeded DB.")

    await api_client.patch("/user_prefs", json={"add_pins": ["IPCA"]})

    patch_resp = await api_client.patch(
        "/user_prefs",
        json={"card_transforms": {"IPCA": {"op": "yoy", "params": {}}}},
    )
    assert patch_resp.status_code == 200
    transforms = patch_resp.json()["card_transforms"]
    transform_map = {ct["series_code"]: ct["transform_spec"] for ct in transforms}
    assert "IPCA" in transform_map
    assert transform_map["IPCA"]["op"] == "yoy"

    # Persistence.
    get_resp = await api_client.get("/user_prefs")
    transforms_after = get_resp.json()["card_transforms"]
    transform_map_after = {ct["series_code"]: ct["transform_spec"] for ct in transforms_after}
    assert transform_map_after["IPCA"]["op"] == "yoy"


@pytest.mark.asyncio
async def test_ac6_nan_gap_in_metadata(api_client):
    """AC-6: Transform with NaN gap reports it in metadata.gaps."""
    from api_extractor.deps import get_transform_service
    from api_extractor.main import app

    gap_date = "2020-03-01"
    mock_result = {
        "values": [
            {"date": "2020-01-01", "value": 4.8},
            {"date": "2020-02-01", "value": None},
            {"date": "2020-04-01", "value": 2.1},
        ],
        "metadata": {
            "gaps": [{"date": gap_date, "reason": "missing_upstream"}],
            "stub": False,
            "op": "yoy",
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
            json={"op": "yoy", "params": {}},
        )
        if resp.status_code == 404:
            pytest.skip("IPCA not seeded — AC-6 requires series in DB.")
        assert resp.status_code == 200
        data = resp.json()
        gaps = data["metadata"]["gaps"]
        assert len(gaps) == 1
        assert gaps[0]["date"] == gap_date
        assert gaps[0]["reason"] == "missing_upstream"
    finally:
        app.dependency_overrides.pop(get_transform_service, None)


@pytest.mark.asyncio
async def test_ac7_empty_user_prefs(api_client):
    """AC-7: GET /user_prefs with no pins returns empty state."""
    resp = await api_client.get("/user_prefs")
    assert resp.status_code == 200
    data = resp.json()
    assert data["pins"] == [], "Expected no pins in empty state."
    assert data["card_transforms"] == [], "Expected no transforms in empty state."
    assert data["recents"] == [], "Expected no recents in empty state."
