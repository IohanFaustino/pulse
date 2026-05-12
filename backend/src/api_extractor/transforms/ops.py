"""Pure transform operation functions.

Each function accepts a ``pd.Series`` with a ``DatetimeIndex`` and a params
dict, and returns a new ``pd.Series`` (same index, float64 dtype). Functions
are stateless and have no side effects — they are safe to call concurrently.

Frequency inference
-------------------
Several transforms (``yoy``, ``qoq``, ``annualized``) are frequency-aware.
The ``periods_per_year`` helper infers the cadence from the series' frequency
string (passed separately) and falls back to median-diff inference from the
index when the string is unknown.

NaN handling
------------
All pandas operations propagate NaN naturally. Gaps in the raw input become
NaN in the output. The caller (registry) detects and reports these gaps.

Stub operations
---------------
``sa`` and ``calendar_adj`` are v1 stubs: they return the input series
unchanged. Callers should check metadata for ``"stub": True``.
"""

from __future__ import annotations

import warnings
from typing import Any

import numpy as np
import pandas as pd


# ---------------------------------------------------------------------------
# Frequency helpers
# ---------------------------------------------------------------------------

_FREQ_PPY: dict[str, int] = {
    "daily": 252,
    "monthly": 12,
    "quarterly": 4,
    "annual": 1,
    "yearly": 1,
    "event": 1,
    "weekly": 52,
}


def periods_per_year(series: pd.Series, frequency: str | None = None) -> int:
    """Infer trading/calendar periods per year for a series.

    Uses the explicit ``frequency`` string first (BCB/IBGE canonical values:
    ``"daily"``, ``"monthly"``, ``"quarterly"``). Falls back to inferring the
    median gap between observations if the frequency string is not recognised.

    Args:
        series: Time series with a ``DatetimeIndex``.
        frequency: Canonical frequency string from ``Series.frequency`` column.
            If ``None`` or not in the known mapping, the index gap is used.

    Returns:
        Integer number of periods per year (trading days: 252, months: 12,
        quarters: 4, or 1 for event/unknown).
    """
    if frequency is not None:
        known = _FREQ_PPY.get(frequency.lower().strip())
        if known is not None:
            return known

    # Index-based inference: compute median gap in days.
    if len(series) < 2:
        return 1
    idx = series.index
    if not isinstance(idx, pd.DatetimeIndex):
        return 1
    gaps_days = pd.Series(idx).diff().dt.days.dropna()
    if gaps_days.empty:
        return 1
    median_gap = gaps_days.median()
    if median_gap <= 2:  # daily (including weekends in raw data)
        return 252
    if 25 <= median_gap <= 35:
        return 12
    if 80 <= median_gap <= 100:
        return 4
    return 1


# ---------------------------------------------------------------------------
# Original group
# ---------------------------------------------------------------------------


def op_level(series: pd.Series, params: dict[str, Any]) -> pd.Series:
    """Return the series unchanged (level/raw values).

    Args:
        series: Input time series.
        params: Ignored.

    Returns:
        Input series cast to float64.
    """
    return series.astype(float)


def op_sa(series: pd.Series, params: dict[str, Any]) -> pd.Series:
    """Seasonal adjustment stub — returns series unchanged.

    v1 stub: proper seasonal adjustment (e.g. X-13ARIMA-SEATS) is deferred.
    Callers should read ``metadata["stub"]`` to surface a UI warning.

    Args:
        series: Input time series.
        params: Ignored.

    Returns:
        Input series cast to float64 (unchanged).
    """
    warnings.warn(
        "op='sa' is a v1 stub — series returned unchanged. "
        "Seasonal adjustment not yet implemented.",
        stacklevel=2,
    )
    return series.astype(float)


def op_calendar_adj(series: pd.Series, params: dict[str, Any]) -> pd.Series:
    """Calendar adjustment stub — returns series unchanged.

    v1 stub: calendar adjustment (business day normalisation) is deferred.
    Callers should read ``metadata["stub"]`` to surface a UI warning.

    Args:
        series: Input time series.
        params: Ignored.

    Returns:
        Input series cast to float64 (unchanged).
    """
    warnings.warn(
        "op='calendar_adj' is a v1 stub — series returned unchanged. "
        "Calendar adjustment not yet implemented.",
        stacklevel=2,
    )
    return series.astype(float)


# ---------------------------------------------------------------------------
# Variation group
# ---------------------------------------------------------------------------


def op_mom(series: pd.Series, params: dict[str, Any]) -> pd.Series:
    """Month-over-month percent change.

    Computes ``pct_change(1) * 100``. Works on any frequency but is most
    meaningful for monthly data.

    Args:
        series: Input time series.
        params: Ignored.

    Returns:
        Percent change vs previous observation.
    """
    return series.astype(float).pct_change(1, fill_method=None) * 100.0


def op_qoq(series: pd.Series, params: dict[str, Any]) -> pd.Series:
    """Quarter-over-quarter percent change.

    Computes ``pct_change(4) * 100`` — appropriate for quarterly series
    (4 periods per year). For monthly series this would compare to the same
    month 4 months ago, which is semantically incorrect; callers are expected
    to pass quarterly data.

    Args:
        series: Input time series.
        params: Ignored.

    Returns:
        Percent change vs same period one quarter ago (4 observations back).
    """
    return series.astype(float).pct_change(4, fill_method=None) * 100.0


def op_yoy(
    series: pd.Series,
    params: dict[str, Any],
    frequency: str | None = None,
) -> pd.Series:
    """Year-over-year percent change.

    Period count is inferred from ``frequency``:
    - ``"daily"`` → 252 trading days
    - ``"monthly"`` → 12 months
    - ``"quarterly"`` → 4 quarters
    - unknown → 1 (fallback)

    Args:
        series: Input time series.
        params: Ignored.
        frequency: Canonical frequency string. Injected by registry.

    Returns:
        Percent change vs same period one year ago.
    """
    ppy = periods_per_year(series, frequency)
    return series.astype(float).pct_change(ppy, fill_method=None) * 100.0


def op_annualized(
    series: pd.Series,
    params: dict[str, Any],
    frequency: str | None = None,
) -> pd.Series:
    """Annualized rate from period returns.

    Converts a period return series (e.g. MoM in %) to its annualized
    equivalent via compounding:
    ``annualized = ((1 + mom/100) ^ ppy - 1) * 100``

    Suitable for inflation and interest rate series.

    Args:
        series: Period return series (values in percent, e.g. 0.5 = 0.5%).
        params: Ignored.
        frequency: Canonical frequency string for periods-per-year lookup.

    Returns:
        Annualized return series (in percent).
    """
    ppy = periods_per_year(series, frequency)
    s = series.astype(float)
    return ((1.0 + s / 100.0) ** ppy - 1.0) * 100.0


def op_diff(series: pd.Series, params: dict[str, Any]) -> pd.Series:
    """First difference (absolute).

    Computes ``s[t] - s[t-1]``. Useful for non-stationary series.

    Args:
        series: Input time series.
        params: Ignored.

    Returns:
        Absolute difference vs previous observation.
    """
    return series.astype(float).diff(1)


def op_log_diff(series: pd.Series, params: dict[str, Any]) -> pd.Series:
    """Log-difference (log return) × 100.

    Computes ``(log(s[t]) - log(s[t-1])) * 100``, which approximates percent
    change for small values and is additive over time.

    Args:
        series: Input time series (must be strictly positive).
        params: Ignored.

    Returns:
        Log-difference × 100. NaN where input is non-positive.
    """
    s = series.astype(float)
    return np.log(s).diff(1) * 100.0  # type: ignore[return-value]


def op_pp(series: pd.Series, params: dict[str, Any]) -> pd.Series:
    """Percentage-point change (first difference for point/rate series).

    Semantically identical to ``diff`` but communicates that the unit of
    the input is already in percentage points (e.g. SELIC rate).

    Args:
        series: Input time series (values in percentage points).
        params: Ignored.

    Returns:
        Absolute difference in percentage points vs previous observation.
    """
    return series.astype(float).diff(1)


# ---------------------------------------------------------------------------
# Smoothing group
# ---------------------------------------------------------------------------


def op_ma(series: pd.Series, params: dict[str, Any]) -> pd.Series:
    """Simple moving average.

    Args:
        series: Input time series.
        params: ``{"window": int}`` — rolling window size. Default 12.

    Returns:
        Rolling mean with ``min_periods=window``.
    """
    window: int = int(params.get("window", 12))
    return series.astype(float).rolling(window=window, min_periods=window).mean()


def op_ewma(series: pd.Series, params: dict[str, Any]) -> pd.Series:
    """Exponentially weighted moving average.

    Args:
        series: Input time series.
        params: ``{"span": int}`` — EWM span parameter. Default 12.

    Returns:
        EWMA series (no leading NaN — EWM initialises from first observation).
    """
    span: int = int(params.get("span", 12))
    return series.astype(float).ewm(span=span, adjust=True).mean()


# ---------------------------------------------------------------------------
# Windows group
# ---------------------------------------------------------------------------


def op_accum12(series: pd.Series, params: dict[str, Any]) -> pd.Series:
    """12-month compounded accumulation.

    Interprets input as period percent returns (e.g. monthly IPCA) and
    computes the compound product over the trailing 12 observations:
    ``((1 + r/100).rolling(12).apply(prod) - 1) * 100``

    Result is NaN for the first 11 observations.

    Args:
        series: Period return series (values in %).
        params: Ignored.

    Returns:
        12-period compound accumulation in %.
    """
    s = series.astype(float)
    # np.prod is faster than a Python lambda for the rolling apply.
    return (
        (1.0 + s / 100.0)
        .rolling(window=12, min_periods=12)
        .apply(np.prod, raw=True)
        - 1.0
    ) * 100.0


def op_stddev12(series: pd.Series, params: dict[str, Any]) -> pd.Series:
    """12-observation rolling standard deviation.

    Uses the sample standard deviation (ddof=1, pandas default).

    Args:
        series: Input time series.
        params: Ignored.

    Returns:
        Rolling 12-period standard deviation. NaN for first 11 observations.
    """
    return series.astype(float).rolling(window=12, min_periods=12).std()


# ---------------------------------------------------------------------------
# Normalization group
# ---------------------------------------------------------------------------


def op_rebase(series: pd.Series, params: dict[str, Any]) -> pd.Series:
    """Rebase series so that the first valid observation equals ``base``.

    Args:
        series: Input time series.
        params: ``{"base": float}`` — target value for the first valid
            observation. Default 100.0.

    Returns:
        Rebased series. NaN observations remain NaN.
    """
    base: float = float(params.get("base", 100.0))
    s = series.astype(float)
    first_valid_idx = s.first_valid_index()
    if first_valid_idx is None:
        return s  # all NaN — return as-is
    first_val = s.loc[first_valid_idx]
    if first_val == 0:
        # Avoid division by zero; return unchanged.
        return s
    return s / first_val * base


def op_zscore(series: pd.Series, params: dict[str, Any]) -> pd.Series:
    """Z-score normalization over the full series.

    Computes ``(s - mean(s)) / std(s)`` using the sample standard deviation
    (ddof=1). NaN values are excluded from mean/std computation.

    Args:
        series: Input time series.
        params: Ignored.

    Returns:
        Z-score normalized series.
    """
    s = series.astype(float)
    mu = s.mean()
    sigma = s.std(ddof=1)
    if sigma == 0 or np.isnan(sigma):
        return s - mu  # all identical values → return zeros
    return (s - mu) / sigma


def op_percentile(series: pd.Series, params: dict[str, Any]) -> pd.Series:
    """Percentile rank (0–100) of each observation relative to the full series.

    Uses pandas ``rank(pct=True)`` scaled to [0, 100]. NaN values get NaN
    rank (``na_option="keep"``).

    Args:
        series: Input time series.
        params: Ignored.

    Returns:
        Percentile rank series with values in [0.0, 100.0].
    """
    s = series.astype(float)
    return s.rank(pct=True, na_option="keep") * 100.0
