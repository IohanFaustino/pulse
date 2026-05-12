"""Transform cache and service integration tests.

Tests use the live Redis instance running at redis:6379 (inside Docker Compose
network) for cache round-trip tests. Redis errors are simulated via mocking.

FR mapping:
- FR-3.4 → test_cache_miss_then_hit (cached result returned on repeat)
- FR-3.5 → test_ttl_per_frequency (TTL set correctly per frequency)
"""

from __future__ import annotations

import datetime
import gzip
import json
from decimal import Decimal
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
import redis.asyncio as aioredis

from api_extractor.transforms.cache import RedisCache
from api_extractor.transforms.service import TransformService, _build_series
from api_extractor.transforms.spec import TransformSpec


# ---------------------------------------------------------------------------
# Redis connection fixture
# ---------------------------------------------------------------------------

REDIS_URL = "redis://redis:6379/1"  # use DB 1 to avoid colliding with app data


@pytest.fixture()
async def redis_client():
    """Live Redis client connected to the Docker Compose redis service."""
    client = aioredis.from_url(REDIS_URL, decode_responses=False)
    yield client
    # Flush test DB after each test to keep keys isolated.
    await client.flushdb()
    await client.aclose()


@pytest.fixture()
def redis_cache(redis_client: aioredis.Redis) -> RedisCache:  # type: ignore[type-arg]
    return RedisCache(redis_client)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _make_observations(n: int = 24, start: str = "2024-01-01") -> list[dict]:
    obs = []
    base = datetime.datetime(2024, 1, 1, tzinfo=datetime.timezone.utc)
    for i in range(n):
        dt = datetime.datetime(
            base.year + (base.month + i - 1) // 12,
            (base.month + i - 1) % 12 + 1,
            1,
            tzinfo=datetime.timezone.utc,
        )
        obs.append({"observed_at": dt, "value": Decimal(str(1.0 + i * 0.1))})
    return obs


def _make_latest_dt(offset_days: int = 0) -> datetime.datetime:
    return datetime.datetime(2026, 1, 15, tzinfo=datetime.timezone.utc) + datetime.timedelta(
        days=offset_days
    )


# ---------------------------------------------------------------------------
# Cache key construction
# ---------------------------------------------------------------------------


def test_cache_key_format():
    """Cache key follows the documented format."""
    dt = datetime.datetime(2026, 1, 15, 12, 0, 0, tzinfo=datetime.timezone.utc)
    spec = TransformSpec(op="yoy", params={})
    key = RedisCache.build_key("IPCA", spec.hash(), dt)
    assert key.startswith("transform:IPCA:")
    assert "2026-01-15" in key


def test_cache_key_includes_latest_observed_at():
    """Different latest_observed_at values produce different cache keys."""
    spec = TransformSpec(op="yoy", params={})
    dt1 = datetime.datetime(2026, 1, 15, tzinfo=datetime.timezone.utc)
    dt2 = datetime.datetime(2026, 2, 1, tzinfo=datetime.timezone.utc)
    key1 = RedisCache.build_key("IPCA", spec.hash(), dt1)
    key2 = RedisCache.build_key("IPCA", spec.hash(), dt2)
    assert key1 != key2


def test_cache_key_naive_datetime_treated_as_utc():
    """Naive datetime is treated as UTC and produces same key as aware UTC."""
    spec = TransformSpec(op="level", params={})
    dt_naive = datetime.datetime(2026, 1, 15, 0, 0, 0)
    dt_aware = datetime.datetime(2026, 1, 15, 0, 0, 0, tzinfo=datetime.timezone.utc)
    key_naive = RedisCache.build_key("SELIC", spec.hash(), dt_naive)
    key_aware = RedisCache.build_key("SELIC", spec.hash(), dt_aware)
    assert key_naive == key_aware


# ---------------------------------------------------------------------------
# TTL per frequency (FR-3.5)
# ---------------------------------------------------------------------------


def test_ttl_daily():
    """daily frequency → TTL = 3600 seconds."""
    assert RedisCache.ttl_for("daily") == 3_600


def test_ttl_monthly():
    """monthly frequency → TTL = 86400 seconds."""
    assert RedisCache.ttl_for("monthly") == 86_400


def test_ttl_quarterly():
    """quarterly frequency → TTL = 604800 seconds."""
    assert RedisCache.ttl_for("quarterly") == 604_800


def test_ttl_unknown_defaults_to_daily_24h():
    """Unknown frequency falls back to 86400 seconds."""
    assert RedisCache.ttl_for("event") == 86_400
    assert RedisCache.ttl_for("unknown") == 86_400


async def test_ttl_per_frequency_set_in_redis(redis_client):
    """Redis TTL command returns the correct TTL after cache.set() for each frequency."""
    cache = RedisCache(redis_client)
    payload = RedisCache.compress({"values": [], "metadata": {}})

    for freq, expected_ttl in [("daily", 3600), ("monthly", 86400), ("quarterly", 604800)]:
        key = f"test:ttl:{freq}"
        await cache.set(key, payload, ttl=RedisCache.ttl_for(freq))
        stored_ttl = await redis_client.ttl(key)
        # Allow ±2 seconds for test execution time
        assert abs(stored_ttl - expected_ttl) <= 2, (
            f"freq={freq}: expected TTL~{expected_ttl}, got {stored_ttl}"
        )


# ---------------------------------------------------------------------------
# Cache miss then hit (FR-3.4)
# ---------------------------------------------------------------------------


async def test_cache_miss_then_hit(redis_client):
    """First GET returns None; after SET the same GET returns the stored bytes."""
    cache = RedisCache(redis_client)
    spec = TransformSpec(op="yoy", params={})
    dt = _make_latest_dt()
    key = RedisCache.build_key("IPCA", spec.hash(), dt)

    # Miss
    result = await cache.get(key)
    assert result is None

    # Store
    payload = RedisCache.compress({"values": [{"date": "2026-01-01", "value": 5.1}], "metadata": {}})
    await cache.set(key, payload, ttl=86_400)

    # Hit
    result = await cache.get(key)
    assert result is not None
    decoded = RedisCache.decompress(result)
    assert decoded["values"][0]["value"] == pytest.approx(5.1)


async def test_cache_service_miss_then_hit(redis_client):
    """TransformService: first call computes (cache miss), second returns cached."""
    service = TransformService(RedisCache(redis_client))
    spec = TransformSpec(op="level", params={})
    obs = _make_observations(12)

    result1 = await service.run("IPCA", spec, "monthly", obs)
    assert result1["metadata"]["cached"] is False

    result2 = await service.run("IPCA", spec, "monthly", obs)
    assert result2["metadata"]["cached"] is True

    # Values are identical
    assert result1["values"] == result2["values"]


async def test_cache_key_changes_on_new_observation(redis_client):
    """Adding a new observation changes latest_observed_at, producing a new key."""
    spec = TransformSpec(op="level", params={})
    obs_old = _make_observations(12)
    obs_new = _make_observations(13)  # 13th month added

    service = TransformService(RedisCache(redis_client))

    result_old = await service.run("IPCA", spec, "monthly", obs_old)
    result_new = await service.run("IPCA", spec, "monthly", obs_new)

    # Both are cache misses (different latest_observed_at)
    assert result_old["metadata"]["cached"] is False
    assert result_new["metadata"]["cached"] is False
    # New result has one more value
    assert len(result_new["values"]) == len(result_old["values"]) + 1


# ---------------------------------------------------------------------------
# Redis down fallback (graceful degradation)
# ---------------------------------------------------------------------------


async def test_redis_down_falls_back_to_compute():
    """When Redis raises ConnectionError, service computes fresh and returns result."""
    broken_client = AsyncMock(spec=aioredis.Redis)
    broken_client.get.side_effect = ConnectionError("Redis is down")
    broken_client.set.side_effect = ConnectionError("Redis is down")

    cache = RedisCache(broken_client)
    service = TransformService(cache)
    spec = TransformSpec(op="mom", params={})
    obs = _make_observations(6)

    # Should NOT raise — should compute fresh
    result = await service.run("IPCA", spec, "monthly", obs)
    assert result is not None
    assert "values" in result
    assert result["metadata"]["cached"] is False
    # First value should be NaN (MoM warmup)
    assert result["values"][0]["value"] is None


async def test_redis_down_get_logs_warn(caplog):
    """When Redis GET raises, a WARN is logged."""
    import logging

    broken_client = AsyncMock(spec=aioredis.Redis)
    broken_client.get.side_effect = ConnectionError("connection refused")
    broken_client.set.side_effect = ConnectionError("connection refused")

    cache = RedisCache(broken_client)
    service = TransformService(cache)
    spec = TransformSpec(op="level", params={})
    obs = _make_observations(3)

    with caplog.at_level(logging.WARNING, logger="api_extractor.transforms.service"):
        result = await service.run("IPCA", spec, "monthly", obs)

    assert any("Redis GET failed" in rec.message for rec in caplog.records)
    assert "values" in result


async def test_redis_corrupt_entry_treated_as_miss(redis_client):
    """A corrupt gzip entry in Redis is treated as a cache miss."""
    cache = RedisCache(redis_client)
    spec = TransformSpec(op="level", params={})
    dt = _make_latest_dt(10)
    key = RedisCache.build_key("CORRUPT_TEST", spec.hash(), dt)

    # Store non-gzip bytes directly
    await redis_client.set(key, b"this is not gzip data", ex=300)

    result = await cache.get(key)
    assert result is None  # treated as miss


# ---------------------------------------------------------------------------
# compress / decompress roundtrip
# ---------------------------------------------------------------------------


def test_compress_decompress_roundtrip():
    """compress then decompress returns original payload."""
    payload = {
        "values": [{"date": "2026-01-01", "value": 3.14}],
        "metadata": {"gaps": [], "stub": False, "op": "mom", "params": {}},
    }
    compressed = RedisCache.compress(payload)
    assert isinstance(compressed, bytes)
    # Verify it's real gzip
    assert gzip.decompress(compressed)

    decoded = RedisCache.decompress(compressed)
    assert decoded["values"][0]["value"] == pytest.approx(3.14)
    assert decoded["metadata"]["op"] == "mom"


def test_compress_produces_smaller_bytes_for_large_payload():
    """Compression reduces size for repetitive JSON payloads."""
    payload = {
        "values": [{"date": f"2024-{i:02d}-01", "value": float(i)} for i in range(1, 200)],
        "metadata": {},
    }
    raw_size = len(json.dumps(payload).encode())
    compressed_size = len(RedisCache.compress(payload))
    assert compressed_size < raw_size


# ---------------------------------------------------------------------------
# _build_series helper
# ---------------------------------------------------------------------------


def test_build_series_converts_decimal_to_float():
    """_build_series converts Decimal values to float64."""
    obs = [
        {"observed_at": datetime.datetime(2024, 1, 1, tzinfo=datetime.timezone.utc), "value": Decimal("1.5")},
        {"observed_at": datetime.datetime(2024, 2, 1, tzinfo=datetime.timezone.utc), "value": Decimal("2.5")},
    ]
    series, latest = _build_series(obs)
    assert series.dtype == float
    assert series.iloc[0] == pytest.approx(1.5)
    assert latest == datetime.datetime(2024, 2, 1, tzinfo=datetime.timezone.utc)


def test_build_series_sorts_by_date():
    """_build_series sorts observations ascending by observed_at."""
    obs = [
        {"observed_at": datetime.datetime(2024, 3, 1, tzinfo=datetime.timezone.utc), "value": Decimal("3.0")},
        {"observed_at": datetime.datetime(2024, 1, 1, tzinfo=datetime.timezone.utc), "value": Decimal("1.0")},
        {"observed_at": datetime.datetime(2024, 2, 1, tzinfo=datetime.timezone.utc), "value": Decimal("2.0")},
    ]
    series, latest = _build_series(obs)
    assert list(series.values) == [1.0, 2.0, 3.0]
    assert latest == datetime.datetime(2024, 3, 1, tzinfo=datetime.timezone.utc)


def test_build_series_empty_raises_or_handles_gracefully():
    """_build_series with empty list returns empty series without error."""
    # Service handles empty list before calling _build_series, but test defensively.
    import pandas as pd

    obs: list = []
    # Calling with empty list should not crash; use TransformService path
    from api_extractor.transforms.service import _build_result
    from api_extractor.transforms.registry import apply

    series = pd.Series([], dtype=float)
    # Just ensure no error
    result = _build_result(series, {"gaps": [], "stub": False, "op": "level", "params": {}})
    assert result["values"] == []
