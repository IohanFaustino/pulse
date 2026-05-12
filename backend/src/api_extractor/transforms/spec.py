"""Pydantic v2 model for transform specifications.

A ``TransformSpec`` encapsulates the operation name and any parameters needed
to execute that operation. The ``hash()`` method produces a stable SHA-256
fingerprint used as part of the Redis cache key, ensuring that different
parameter combinations produce different keys.

Example::

    spec = TransformSpec(op="ma", params={"window": 12})
    key_part = spec.hash()   # e.g. "a3f8c1..."
"""

import hashlib
import json
from typing import Any, Literal

from pydantic import BaseModel, Field


# All supported transform operation identifiers.
TransformOp = Literal[
    # Original
    "level",
    "sa",
    "calendar_adj",
    # Variation
    "mom",
    "qoq",
    "yoy",
    "annualized",
    "diff",
    "log_diff",
    "pp",
    # Smoothing
    "ma",
    "ewma",
    # Windows
    "accum12",
    "stddev12",
    # Normalization
    "rebase",
    "zscore",
    "percentile",
]


class TransformSpec(BaseModel):
    """Specification for a single transform operation.

    Attributes:
        op: The transform operation identifier (one of the 17 supported ops).
        params: Optional parameters for the operation. Keys and values vary
            by op:
            - ``ma``: ``{"window": int}`` (default 12)
            - ``ewma``: ``{"span": int}`` (default 12)
            - ``rebase``: ``{"base": float}`` (default 100.0)
            All other ops ignore params.
    """

    op: TransformOp
    params: dict[str, Any] = Field(default_factory=dict)

    def hash(self) -> str:
        """Produce a stable SHA-256 hex digest of this spec.

        The digest is computed over a canonical JSON representation:
        ``{"op": <op>, "params": {<sorted keys>}}``. Sorting the params
        keys ensures ``{"window": 3}`` and ``{"window": 3}`` always produce
        the same digest regardless of insertion order.

        Returns:
            A 64-character lowercase hex string (SHA-256).
        """
        canonical = json.dumps(
            {"op": self.op, "params": dict(sorted(self.params.items()))},
            sort_keys=True,
            separators=(",", ":"),
        )
        return hashlib.sha256(canonical.encode()).hexdigest()
