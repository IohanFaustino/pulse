"""High-level transform orchestrator.

``TransformService.run`` is the single entry point consumed by the API layer.
It implements the cache-aside pattern:

1. Load observations (passed in by caller from ``ObservationRepo``).
2. Build a ``pd.Series`` from them.
3. Compute the Redis cache key (series_code + spec hash + latest_observed_at).
4. Check Redis → on hit, return decompressed result immediately.
5. On miss: apply the transform, build the result dict, compress + store.
6. If Redis is down: log WARN and compute fresh (graceful degradation).

Result shape::

    {
        "values": [{"date": "2026-01-01", "value": 0.42}, ...],
        "metadata": {
            "gaps": [{"date": "...", "reason": "missing_upstream"}],
            "stub": False,
            "op": "yoy",
            "params": {},
            "cached": True | False,
        }
    }
"""

from __future__ import annotations

import datetime
import logging
from decimal import Decimal
from typing import Any

import pandas as pd

from api_extractor.transforms.cache import RedisCache
from api_extractor.transforms.registry import apply as registry_apply
from api_extractor.transforms.spec import TransformSpec

logger = logging.getLogger(__name__)


class TransformService:
    """Orchestrates transform computation and Redis caching.

    Attributes:
        _cache: ``RedisCache`` wrapper (may be ``None`` if Redis is unavailable).
    """

    def __init__(self, cache: RedisCache) -> None:
        """Initialise with a ``RedisCache`` instance.

        Args:
            cache: Configured ``RedisCache`` wrapping an async Redis client.
        """
        self._cache = cache

    async def run(
        self,
        series_code: str,
        spec: TransformSpec,
        frequency: str,
        observations: list[dict[str, Any]],
    ) -> dict[str, Any]:
        """Compute a transform for the given observations, with caching.

        Args:
            series_code: Series code string (e.g. ``"IPCA"``).
            spec: Validated ``TransformSpec`` describing the operation.
            frequency: Canonical frequency string (``"daily"``, ``"monthly"``,
                ``"quarterly"``). Used for TTL selection and frequency-aware ops.
            observations: List of dicts with keys:
                - ``"observed_at"``: ``datetime.datetime`` (timezone-aware UTC)
                - ``"value"``: ``Decimal`` or float-compatible numeric.
                Must be ordered by ``observed_at`` ascending.

        Returns:
            Result dict with ``"values"`` and ``"metadata"`` keys. See module
            docstring for the full shape.
        """
        if not observations:
            return {
                "values": [],
                "metadata": {
                    "gaps": [],
                    "stub": False,
                    "op": spec.op,
                    "params": spec.params,
                    "cached": False,
                },
            }

        # Build pd.Series from observations list.
        raw_series, latest_observed_at = _build_series(observations)

        # Attempt cache lookup.
        cache_key = RedisCache.build_key(series_code, spec.hash(), latest_observed_at)
        cached_result = await self._try_cache_get(cache_key)
        if cached_result is not None:
            cached_result["metadata"]["cached"] = True
            return cached_result

        # Cache miss — compute the transform.
        transformed, metadata = registry_apply(spec, raw_series, frequency=frequency)

        # Serialise to result dict.
        result = _build_result(transformed, metadata)

        # Store in cache (fire-and-forget on Redis errors).
        ttl = RedisCache.ttl_for(frequency)
        await self._try_cache_set(cache_key, result, ttl)

        result["metadata"]["cached"] = False
        return result

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    async def _try_cache_get(self, key: str) -> dict[str, Any] | None:
        """Attempt a Redis GET, returning None on any error.

        If Redis is unavailable, logs a WARN and returns None so the caller
        falls through to fresh computation.
        """
        try:
            raw = await self._cache.get(key)
            if raw is None:
                return None
            return RedisCache.decompress(raw)  # type: ignore[return-value]
        except Exception as exc:  # noqa: BLE001
            logger.warning(
                "Redis GET failed for key=%s, computing fresh: %s",
                key,
                exc,
            )
            return None

    async def _try_cache_set(
        self,
        key: str,
        result: dict[str, Any],
        ttl: int,
    ) -> None:
        """Attempt a Redis SET, logging WARN on any error (never raises)."""
        try:
            compressed = RedisCache.compress(result)
            await self._cache.set(key, compressed, ttl)
        except Exception as exc:  # noqa: BLE001
            logger.warning(
                "Redis SET failed for key=%s, result not cached: %s",
                key,
                exc,
            )


# ---------------------------------------------------------------------------
# Module-level helpers (pure, no I/O)
# ---------------------------------------------------------------------------


def _build_series(
    observations: list[dict[str, Any]],
) -> tuple[pd.Series, datetime.datetime]:
    """Convert observation dicts to a ``pd.Series`` with ``DatetimeIndex``.

    Decimal values are converted to float64 at this boundary. The series is
    sorted ascending by observed_at.

    Args:
        observations: List of ``{"observed_at": datetime, "value": Decimal}`` dicts.

    Returns:
        Tuple of:
        - ``pd.Series``: float64 values indexed by UTC datetimes.
        - ``datetime.datetime``: The maximum ``observed_at`` (latest observation).
    """
    dates = []
    values = []
    for obs in observations:
        dt = obs["observed_at"]
        if isinstance(dt, datetime.datetime) and dt.tzinfo is None:
            dt = dt.replace(tzinfo=datetime.timezone.utc)
        dates.append(dt)
        val = obs["value"]
        if isinstance(val, Decimal):
            values.append(float(val))
        else:
            values.append(float(val) if val is not None else float("nan"))

    index = pd.DatetimeIndex(dates, tz=datetime.timezone.utc)
    series = pd.Series(values, index=index, dtype=float, name="value")
    series = series.sort_index()

    latest_observed_at = max(dates)
    if not isinstance(latest_observed_at, datetime.datetime):
        latest_observed_at = pd.Timestamp(latest_observed_at).to_pydatetime()
    if latest_observed_at.tzinfo is None:
        latest_observed_at = latest_observed_at.replace(tzinfo=datetime.timezone.utc)

    return series, latest_observed_at


def _build_result(
    transformed: pd.Series,
    metadata: dict[str, Any],
) -> dict[str, Any]:
    """Serialise a transformed series to the API result shape.

    NaN values are represented as ``None`` in the output list so they
    serialise to JSON ``null`` cleanly.

    Args:
        transformed: Output series from ``registry.apply``.
        metadata: Metadata dict from ``registry.apply``.

    Returns:
        Dict with ``"values"`` (list of date+value dicts) and ``"metadata"``.
    """
    values: list[dict[str, Any]] = []
    for ts, val in transformed.items():
        date_str = pd.Timestamp(ts).date().isoformat()
        values.append(
            {
                "date": date_str,
                "value": None if (val is None or (isinstance(val, float) and pd.isna(val))) else float(val),
            }
        )
    return {"values": values, "metadata": metadata}
