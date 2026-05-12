"""Transform registry — maps op strings to callable implementations.

The registry is a plain dict for O(1) dispatch. Each entry is a callable
with the signature::

    fn(series: pd.Series, params: dict, frequency: str | None) -> pd.Series

Operations that are frequency-unaware ignore the ``frequency`` argument.
Operations that ARE frequency-aware (``yoy``, ``qoq``, ``annualized``) receive
it and forward it to the appropriate helper.

Usage::

    from api_extractor.transforms.registry import apply
    from api_extractor.transforms.spec import TransformSpec

    spec = TransformSpec(op="yoy", params={})
    result_series, metadata = apply(spec, raw_series, frequency="monthly")
"""

from __future__ import annotations

import datetime
from typing import Any, Callable

import pandas as pd

from api_extractor.transforms.ops import (
    op_accum12,
    op_annualized,
    op_calendar_adj,
    op_diff,
    op_ewma,
    op_level,
    op_log_diff,
    op_ma,
    op_mom,
    op_percentile,
    op_pp,
    op_qoq,
    op_rebase,
    op_sa,
    op_stddev12,
    op_yoy,
    op_zscore,
)
from api_extractor.transforms.spec import TransformSpec

# ---------------------------------------------------------------------------
# Registry type: (series, params, frequency) -> pd.Series
# ---------------------------------------------------------------------------

_OpFn = Callable[[pd.Series, dict[str, Any], str | None], pd.Series]

# Wrap frequency-unaware ops so they all share the same 3-arg signature.
def _wrap(fn: Callable[[pd.Series, dict[str, Any]], pd.Series]) -> _OpFn:
    def _inner(s: pd.Series, p: dict[str, Any], freq: str | None) -> pd.Series:
        return fn(s, p)
    return _inner


def _wrap_freq(
    fn: Callable[[pd.Series, dict[str, Any]], pd.Series],
) -> _OpFn:
    """Wrap frequency-aware ops (yoy, qoq, annualized)."""
    def _inner(s: pd.Series, p: dict[str, Any], freq: str | None) -> pd.Series:
        return fn(s, p, frequency=freq)  # type: ignore[call-arg]
    return _inner


TRANSFORMS: dict[str, _OpFn] = {
    # Original
    "level": _wrap(op_level),
    "sa": _wrap(op_sa),
    "calendar_adj": _wrap(op_calendar_adj),
    # Variation
    "mom": _wrap(op_mom),
    "qoq": _wrap(op_qoq),  # always pct_change(4); not frequency-aware
    "yoy": _wrap_freq(op_yoy),
    "annualized": _wrap_freq(op_annualized),
    "diff": _wrap(op_diff),
    "log_diff": _wrap(op_log_diff),
    "pp": _wrap(op_pp),
    # Smoothing
    "ma": _wrap(op_ma),
    "ewma": _wrap(op_ewma),
    # Windows
    "accum12": _wrap(op_accum12),
    "stddev12": _wrap(op_stddev12),
    # Normalization
    "rebase": _wrap(op_rebase),
    "zscore": _wrap(op_zscore),
    "percentile": _wrap(op_percentile),
}

# Ops that are v1 stubs (passthrough + warning in metadata).
_STUB_OPS: frozenset[str] = frozenset({"sa", "calendar_adj"})


def _detect_gaps(
    raw: pd.Series,
    transformed: pd.Series,
) -> list[dict[str, str]]:
    """Collect NaN positions from the transformed series.

    A gap is any index position where ``transformed`` is NaN but ``raw`` was
    also NaN (missing upstream data). Leading NaN introduced by rolling windows
    are reported as ``"window_warmup"``; gaps in the middle of the raw series
    are reported as ``"missing_upstream"``.

    Args:
        raw: Original input series before transformation.
        transformed: Output series after transformation.

    Returns:
        List of ``{"date": ISO-date-string, "reason": str}`` dicts.
    """
    gaps: list[dict[str, str]] = []
    nan_mask = transformed.isna()
    if not nan_mask.any():
        return gaps

    raw_nan = raw.isna()

    for ts, is_nan in nan_mask.items():
        if not is_nan:
            continue
        date_str: str
        if isinstance(ts, (datetime.datetime, pd.Timestamp)):
            date_str = pd.Timestamp(ts).date().isoformat()
        else:
            date_str = str(ts)

        # Classify the gap reason.
        if raw_nan.get(ts, False):
            reason = "missing_upstream"
        else:
            reason = "window_warmup"

        gaps.append({"date": date_str, "reason": reason})

    return gaps


def apply(
    spec: TransformSpec,
    series: pd.Series,
    frequency: str | None = None,
) -> tuple[pd.Series, dict[str, Any]]:
    """Dispatch a transform spec to the correct op and compute metadata.

    Args:
        spec: Validated ``TransformSpec`` (op + params).
        series: Raw time series (``DatetimeIndex``, float-compatible values).
        frequency: Canonical series frequency string (``"daily"``,
            ``"monthly"``, ``"quarterly"``). Used by frequency-aware ops.

    Returns:
        A tuple of:
        - ``pd.Series``: Transformed series (same index, float64).
        - ``dict``: Metadata with keys:
          - ``"gaps"``: list of ``{"date", "reason"}`` dicts
          - ``"stub"``: ``True`` if the op is a v1 stub (``sa``, ``calendar_adj``)
          - ``"op"``: the op string
          - ``"params"``: the params dict

    Raises:
        ValueError: If ``spec.op`` is not registered (should not happen for
            validated specs, but guarded defensively).
    """
    op_key = spec.op
    fn = TRANSFORMS.get(op_key)
    if fn is None:
        raise ValueError(
            f"Unknown transform op '{op_key}'. "
            f"Registered ops: {sorted(TRANSFORMS)}"
        )

    raw = series.astype(float)
    transformed = fn(raw, spec.params, frequency)

    gaps = _detect_gaps(raw, transformed)
    metadata: dict[str, Any] = {
        "gaps": gaps,
        "stub": op_key in _STUB_OPS,
        "op": op_key,
        "params": spec.params,
    }

    return transformed, metadata
