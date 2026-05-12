"""Redis cache wrapper for transform results.

Implements the cache-aside pattern described in ADR-0006. Results are stored
as gzip-compressed JSON bytes. Keys are constructed to include the series
code, transform spec hash, and the ``latest_observed_at`` timestamp so that
new observations automatically invalidate the cached result without any
explicit purge.

Key format::

    transform:{series_code}:{spec_hash}:{latest_observed_at_isoformat}

TTL by series frequency:
- ``daily``    → 3 600 s   (1 hour)
- ``monthly``  → 86 400 s  (24 hours)
- ``quarterly``→ 604 800 s (7 days)
- unknown      → 86 400 s  (24 hours fallback)

Usage::

    cache = RedisCache(redis_client)
    key = cache.build_key("IPCA", spec.hash(), latest_dt)
    data = await cache.get(key)
    if data is None:
        ...compute...
        await cache.set(key, payload_bytes, ttl=cache.ttl_for("monthly"))
"""

from __future__ import annotations

import datetime
import gzip
import logging
from typing import Any

import redis.asyncio as aioredis

logger = logging.getLogger(__name__)

# TTL mapping: series frequency → seconds.
_TTL_MAP: dict[str, int] = {
    "daily": 3_600,
    "monthly": 86_400,
    "quarterly": 604_800,
}
_DEFAULT_TTL: int = 86_400


class RedisCache:
    """Async Redis wrapper for transform result caching.

    Attributes:
        _client: An ``redis.asyncio.Redis`` client instance.
    """

    def __init__(self, client: aioredis.Redis) -> None:  # type: ignore[type-arg]
        """Initialise the cache wrapper.

        Args:
            client: A connected ``redis.asyncio.Redis`` instance.
        """
        self._client = client

    # ------------------------------------------------------------------
    # Key construction
    # ------------------------------------------------------------------

    @staticmethod
    def build_key(
        series_code: str,
        spec_hash: str,
        latest_observed_at: datetime.datetime,
    ) -> str:
        """Build the Redis cache key for a transform result.

        The key encodes all three dimensions that determine result uniqueness:
        - Which series (``series_code``)
        - Which transform (``spec_hash``, SHA-256 of op+params)
        - How fresh the data is (``latest_observed_at`` in UTC ISO format)

        When a new observation is ingested, ``latest_observed_at`` changes,
        making the old key effectively orphaned (TTL expires it naturally).

        Args:
            series_code: Series code string (e.g. ``"IPCA"``).
            spec_hash: SHA-256 hex digest from ``TransformSpec.hash()``.
            latest_observed_at: Timezone-aware UTC datetime of the most
                recent observation used to compute the transform.

        Returns:
            Cache key string, e.g.
            ``"transform:IPCA:a3f8c1...:2026-01-15T00:00:00+00:00"``.
        """
        # Normalise to UTC and use isoformat for deterministic string.
        if latest_observed_at.tzinfo is None:
            # Treat naive datetimes as UTC.
            ts = latest_observed_at.replace(tzinfo=datetime.timezone.utc)
        else:
            ts = latest_observed_at.astimezone(datetime.timezone.utc)
        return f"transform:{series_code}:{spec_hash}:{ts.isoformat()}"

    # ------------------------------------------------------------------
    # TTL helpers
    # ------------------------------------------------------------------

    @staticmethod
    def ttl_for(frequency: str) -> int:
        """Return the TTL in seconds for the given series frequency.

        Args:
            frequency: Canonical frequency string (``"daily"``, ``"monthly"``,
                ``"quarterly"``). Unknown values fall back to 24 hours.

        Returns:
            TTL in seconds.
        """
        return _TTL_MAP.get(frequency.lower().strip(), _DEFAULT_TTL)

    # ------------------------------------------------------------------
    # Cache operations
    # ------------------------------------------------------------------

    async def get(self, key: str) -> bytes | None:
        """Retrieve a cached value by key.

        Returns ``None`` on a cache miss or if the stored bytes cannot be
        decompressed (treats corrupt entries as a miss and lets them TTL out).

        Args:
            key: Redis key string.

        Returns:
            Raw bytes (gzip-compressed JSON) on hit; ``None`` on miss or error.
        """
        raw: bytes | None = await self._client.get(key)
        if raw is None:
            return None
        try:
            # Validate that the stored bytes are valid gzip (decompress test).
            gzip.decompress(raw)
            return raw
        except (OSError, gzip.BadGzipFile) as exc:
            logger.warning("Cache entry corrupt for key=%s, treating as miss: %s", key, exc)
            return None

    async def set(self, key: str, value: bytes, ttl: int) -> None:
        """Store a value under ``key`` with the given TTL.

        The value should already be gzip-compressed by the caller (``service.py``
        is responsible for encoding).

        Args:
            key: Redis key string.
            value: Gzip-compressed JSON bytes.
            ttl: Time-to-live in seconds.
        """
        await self._client.set(key, value, ex=ttl)

    # ------------------------------------------------------------------
    # Encoding helpers (used by service.py)
    # ------------------------------------------------------------------

    @staticmethod
    def compress(payload: Any) -> bytes:
        """JSON-encode and gzip-compress a payload dict.

        Args:
            payload: JSON-serialisable dict (e.g. ``{values: [...], metadata: ...}``).

        Returns:
            Gzip-compressed JSON bytes.
        """
        import json

        json_bytes = json.dumps(payload, default=str).encode("utf-8")
        return gzip.compress(json_bytes, compresslevel=6)

    @staticmethod
    def decompress(data: bytes) -> Any:
        """Gzip-decompress and JSON-decode cached bytes.

        Args:
            data: Gzip-compressed JSON bytes from Redis.

        Returns:
            Decoded Python object (dict).
        """
        import json

        return json.loads(gzip.decompress(data).decode("utf-8"))
