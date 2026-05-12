"""Tests for user_prefs endpoints."""

from __future__ import annotations

import pytest
import pytest_asyncio
from sqlalchemy import delete
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from tests.fixtures_api import api_client  # noqa: F401

_DB_URL = "postgresql+asyncpg://postgres:postgres@postgres:5432/api_extractor"


@pytest_asyncio.fixture(autouse=True)
async def clean_user_prefs():
    """Reset user prefs, pins, and card transforms before each test."""
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
async def test_get_user_prefs_returns_200(api_client):
    """GET /user_prefs must return HTTP 200."""
    resp = await api_client.get("/user_prefs")
    assert resp.status_code == 200


@pytest.mark.asyncio
async def test_get_user_prefs_default_shape(api_client):
    """Default user prefs must have id=1, empty pins, transforms, recents."""
    resp = await api_client.get("/user_prefs")
    assert resp.status_code == 200
    data = resp.json()
    assert data["id"] == 1
    assert data["pins"] == []
    assert data["card_transforms"] == []
    assert data["recents"] == []


@pytest.mark.asyncio
async def test_patch_add_pins(api_client):
    """PATCH /user_prefs with add_pins must add those series to pins."""
    resp = await api_client.patch(
        "/user_prefs",
        json={"add_pins": ["IPCA"]},
    )
    if resp.status_code == 404:
        pytest.skip("IPCA not seeded — cannot pin.")
    assert resp.status_code == 200
    data = resp.json()
    pin_codes = [p["series_code"] for p in data["pins"]]
    assert "IPCA" in pin_codes


@pytest.mark.asyncio
async def test_patch_add_pins_idempotent(api_client):
    """Adding the same pin twice must not duplicate it."""
    await api_client.patch("/user_prefs", json={"add_pins": ["IPCA"]})
    resp = await api_client.patch("/user_prefs", json={"add_pins": ["IPCA"]})
    if resp.status_code == 404:
        pytest.skip("IPCA not seeded.")
    data = resp.json()
    pin_codes = [p["series_code"] for p in data["pins"]]
    assert pin_codes.count("IPCA") <= 1


@pytest.mark.asyncio
async def test_patch_remove_pins(api_client):
    """PATCH remove_pins must remove the series from pins."""
    pin_resp = await api_client.patch("/user_prefs", json={"add_pins": ["IPCA"]})
    if pin_resp.status_code == 404:
        pytest.skip("IPCA not seeded.")
    resp = await api_client.patch("/user_prefs", json={"remove_pins": ["IPCA"]})
    assert resp.status_code == 200
    pin_codes = [p["series_code"] for p in resp.json()["pins"]]
    assert "IPCA" not in pin_codes


@pytest.mark.asyncio
async def test_patch_card_transforms(api_client):
    """PATCH card_transforms must persist the transform spec."""
    await api_client.patch("/user_prefs", json={"add_pins": ["IPCA"]})
    resp = await api_client.patch(
        "/user_prefs",
        json={"card_transforms": {"IPCA": {"op": "yoy", "params": {}}}},
    )
    if resp.status_code == 404:
        pytest.skip("IPCA not seeded.")
    assert resp.status_code == 200
    transforms = resp.json()["card_transforms"]
    transform_map = {ct["series_code"]: ct["transform_spec"] for ct in transforms}
    assert "IPCA" in transform_map
    assert transform_map["IPCA"]["op"] == "yoy"


@pytest.mark.asyncio
async def test_patch_card_transforms_null_removes(api_client):
    """Setting card_transforms value to null must remove the transform."""
    await api_client.patch("/user_prefs", json={"add_pins": ["IPCA"]})
    await api_client.patch(
        "/user_prefs",
        json={"card_transforms": {"IPCA": {"op": "yoy", "params": {}}}},
    )
    resp = await api_client.patch(
        "/user_prefs",
        json={"card_transforms": {"IPCA": None}},
    )
    if resp.status_code == 404:
        pytest.skip("IPCA not seeded.")
    assert resp.status_code == 200
    transforms = resp.json()["card_transforms"]
    transform_codes = [ct["series_code"] for ct in transforms]
    assert "IPCA" not in transform_codes


@pytest.mark.asyncio
async def test_patch_recents(api_client):
    """PATCH recents must replace the recents list."""
    resp = await api_client.patch(
        "/user_prefs",
        json={"recents": ["IPCA", "SELIC", "CDI"]},
    )
    assert resp.status_code == 200
    assert resp.json()["recents"] == ["IPCA", "SELIC", "CDI"]


@pytest.mark.asyncio
async def test_patch_recents_truncated_to_3(api_client):
    """Recents list must be capped at 3 entries."""
    resp = await api_client.patch(
        "/user_prefs",
        json={"recents": ["IPCA", "SELIC", "CDI", "PIB", "PTAX_USD"]},
    )
    assert resp.status_code == 200
    assert len(resp.json()["recents"]) <= 3


@pytest.mark.asyncio
async def test_patch_unknown_series_in_add_pins_returns_404(api_client):
    """Pinning a non-existent series must return 404."""
    resp = await api_client.patch(
        "/user_prefs",
        json={"add_pins": ["SERIES_DOES_NOT_EXIST_XYZ"]},
    )
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_patch_empty_body_is_noop(api_client):
    """PATCH with empty body must return current state unchanged."""
    resp = await api_client.patch("/user_prefs", json={})
    assert resp.status_code == 200
    data = resp.json()
    assert data["pins"] == []
    assert data["card_transforms"] == []
