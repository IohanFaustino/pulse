"""Pure transform operation tests — no I/O, no Redis, no DB.

Tests cover all 17 ops (including 2 stubs) plus edge cases:
- NaN gap detection in metadata
- Unknown op validation
- Reference value correctness

Reference values used:
- IPCA-style compounding: 1%/month × 12 → (1.01^12 - 1) * 100 = 12.6825...%
- YoY on synthetic monthly: pct_change(12) × 100
- annualized from monthly MoM: (1 + 0.01)^12 - 1 = 12.6825...%

FR mapping:
- FR-3.1 → all op tests (compute from raw obs)
- FR-3.2 → test_nan_gap_detected_in_metadata
- FR-3.3 → full op matrix (all 17 ops covered)
- AC-6   → test_nan_gap_detected_in_metadata
"""

from __future__ import annotations

import datetime
import warnings

import numpy as np
import pandas as pd
import pytest

from api_extractor.transforms.registry import TRANSFORMS, apply
from api_extractor.transforms.spec import TransformSpec


# ---------------------------------------------------------------------------
# Fixtures / helpers
# ---------------------------------------------------------------------------


def _monthly_series(n: int = 24, start: str = "2024-01-01") -> pd.Series:
    """Return a synthetic monthly series with DatetimeIndex."""
    idx = pd.date_range(start=start, periods=n, freq="MS", tz="UTC")
    values = [float(i + 1) for i in range(n)]
    return pd.Series(values, index=idx, dtype=float, name="value")


def _daily_series(n: int = 300, start: str = "2024-01-02") -> pd.Series:
    """Return a synthetic daily series (business days)."""
    idx = pd.bdate_range(start=start, periods=n, tz="UTC")
    values = [float(i + 100) for i in range(n)]
    return pd.Series(values, index=idx, dtype=float, name="value")


def _quarterly_series(n: int = 16, start: str = "2020-01-01") -> pd.Series:
    """Return a synthetic quarterly series."""
    idx = pd.date_range(start=start, periods=n, freq="QS", tz="UTC")
    values = [float(i * 5 + 100) for i in range(n)]
    return pd.Series(values, index=idx, dtype=float, name="value")


def _inflation_series(n: int = 24, monthly_rate: float = 0.01) -> pd.Series:
    """Monthly inflation series in percent (1.0 = 1% per month)."""
    idx = pd.date_range(start="2024-01-01", periods=n, freq="MS", tz="UTC")
    values = [monthly_rate * 100] * n  # 1.0 % per month
    return pd.Series(values, index=idx, dtype=float, name="value")


# ---------------------------------------------------------------------------
# Helpers to call apply()
# ---------------------------------------------------------------------------


def _apply(op: str, series: pd.Series, params: dict | None = None, freq: str | None = None):
    spec = TransformSpec(op=op, params=params or {})
    return apply(spec, series, frequency=freq)


# ---------------------------------------------------------------------------
# Original group
# ---------------------------------------------------------------------------


def test_level_passthrough():
    """level returns the series unchanged (float64)."""
    s = _monthly_series(12)
    out, meta = _apply("level", s)
    pd.testing.assert_series_equal(out, s.astype(float), check_names=False)
    assert meta["stub"] is False
    assert meta["gaps"] == []


def test_sa_stub_returns_series_unchanged():
    """sa is a stub: returns series unchanged and marks stub=True in metadata."""
    s = _monthly_series(6)
    with warnings.catch_warnings(record=True) as w:
        warnings.simplefilter("always")
        out, meta = _apply("sa", s)
    assert meta["stub"] is True
    assert any("stub" in str(warning.message).lower() for warning in w)
    pd.testing.assert_series_equal(out, s.astype(float), check_names=False)


def test_calendar_adj_stub_returns_series_unchanged():
    """calendar_adj is a stub: returns series unchanged and marks stub=True."""
    s = _monthly_series(6)
    with warnings.catch_warnings(record=True) as w:
        warnings.simplefilter("always")
        out, meta = _apply("calendar_adj", s)
    assert meta["stub"] is True
    assert len(w) == 1
    pd.testing.assert_series_equal(out, s.astype(float), check_names=False)


# ---------------------------------------------------------------------------
# Variation group
# ---------------------------------------------------------------------------


def test_mom_monthly_returns_pct_change_1():
    """mom = pct_change(1) * 100."""
    s = _monthly_series(6)
    out, meta = _apply("mom", s, freq="monthly")
    expected = s.astype(float).pct_change(1) * 100.0
    pd.testing.assert_series_equal(out, expected, check_names=False)
    # First observation should be NaN (warmup gap)
    assert np.isnan(out.iloc[0])
    # At least one window_warmup gap reported
    assert any(g["reason"] == "window_warmup" for g in meta["gaps"])


def test_mom_values_correct():
    """Verify MoM values numerically for a known series."""
    # Series: 100, 101, 102.01 → MoM: NaN, 1.0, 1.0
    idx = pd.date_range("2024-01-01", periods=3, freq="MS", tz="UTC")
    s = pd.Series([100.0, 101.0, 102.01], index=idx)
    out, _ = _apply("mom", s)
    assert pytest.approx(out.iloc[1], abs=1e-6) == 1.0
    assert pytest.approx(out.iloc[2], abs=1e-4) == 1.0


def test_yoy_monthly_returns_pct_change_12():
    """yoy on monthly series uses pct_change(12)."""
    s = _monthly_series(24)
    out, meta = _apply("yoy", s, freq="monthly")
    expected = s.astype(float).pct_change(12) * 100.0
    pd.testing.assert_series_equal(out, expected, check_names=False)
    # First 12 are NaN
    assert out.iloc[:12].isna().all()
    assert len(meta["gaps"]) == 12


def test_yoy_daily_returns_pct_change_252():
    """yoy on daily series uses pct_change(252)."""
    s = _daily_series(300)
    out, meta = _apply("yoy", s, freq="daily")
    expected = s.astype(float).pct_change(252) * 100.0
    pd.testing.assert_series_equal(out, expected, check_names=False)
    # First 252 are NaN
    assert out.iloc[:252].isna().all()


def test_qoq_quarterly():
    """qoq on quarterly series uses pct_change(4)."""
    s = _quarterly_series(12)
    out, meta = _apply("qoq", s, freq="quarterly")
    expected = s.astype(float).pct_change(4) * 100.0
    pd.testing.assert_series_equal(out, expected, check_names=False)
    assert out.iloc[:4].isna().all()


def test_annualized_from_monthly():
    """annualized on 1% monthly MoM → (1.01^12 - 1) * 100 = 12.6825...%."""
    idx = pd.date_range("2024-01-01", periods=3, freq="MS", tz="UTC")
    # 1% per month
    s = pd.Series([1.0, 1.0, 1.0], index=idx, dtype=float)
    out, _ = _apply("annualized", s, freq="monthly")
    expected_rate = (1.01**12 - 1) * 100  # ~12.6825%
    for val in out:
        assert pytest.approx(val, abs=1e-4) == expected_rate


def test_diff_first_difference():
    """diff = s[t] - s[t-1], first value NaN."""
    s = _monthly_series(6)
    out, meta = _apply("diff", s)
    expected = s.astype(float).diff(1)
    pd.testing.assert_series_equal(out, expected, check_names=False)
    assert np.isnan(out.iloc[0])


def test_log_diff():
    """log_diff = (log(s[t]) - log(s[t-1])) * 100."""
    idx = pd.date_range("2024-01-01", periods=3, freq="MS", tz="UTC")
    s = pd.Series([100.0, 101.0, 102.01], index=idx)
    out, _ = _apply("log_diff", s)
    expected = np.log(s.astype(float)).diff(1) * 100.0
    pd.testing.assert_series_equal(out, expected, check_names=False, atol=1e-8)


def test_pp_equals_diff():
    """pp is semantically identical to diff for point/rate series."""
    s = _monthly_series(6)
    out_pp, _ = _apply("pp", s)
    out_diff, _ = _apply("diff", s)
    pd.testing.assert_series_equal(out_pp, out_diff, check_names=False)


# ---------------------------------------------------------------------------
# Smoothing group
# ---------------------------------------------------------------------------


def test_ma_window_3():
    """ma with window=3 = rolling(3).mean()."""
    s = _monthly_series(12)
    out, meta = _apply("ma", s, params={"window": 3})
    expected = s.astype(float).rolling(3, min_periods=3).mean()
    pd.testing.assert_series_equal(out, expected, check_names=False)
    # First 2 are NaN (warmup)
    assert out.iloc[:2].isna().all()


def test_ma_window_6():
    """ma with window=6 = rolling(6).mean()."""
    s = _monthly_series(18)
    out, _ = _apply("ma", s, params={"window": 6})
    expected = s.astype(float).rolling(6, min_periods=6).mean()
    pd.testing.assert_series_equal(out, expected, check_names=False)


def test_ma_window_12():
    """ma with window=12 = rolling(12).mean(); default when no params."""
    s = _monthly_series(24)
    out, _ = _apply("ma", s, params={})
    expected = s.astype(float).rolling(12, min_periods=12).mean()
    pd.testing.assert_series_equal(out, expected, check_names=False)
    assert out.iloc[:11].isna().all()
    assert not np.isnan(out.iloc[11])


def test_ewma_span_param():
    """ewma with span=6 = ewm(span=6).mean(); no leading NaN."""
    s = _monthly_series(12)
    out, meta = _apply("ewma", s, params={"span": 6})
    expected = s.astype(float).ewm(span=6, adjust=True).mean()
    pd.testing.assert_series_equal(out, expected, check_names=False)
    # EWMA initialises from first observation — no warmup NaN
    assert not out.isna().any()
    assert meta["gaps"] == []


def test_ewma_default_span_12():
    """ewma without params defaults to span=12."""
    s = _monthly_series(12)
    out, _ = _apply("ewma", s, params={})
    expected = s.astype(float).ewm(span=12, adjust=True).mean()
    pd.testing.assert_series_equal(out, expected, check_names=False)


# ---------------------------------------------------------------------------
# Windows group
# ---------------------------------------------------------------------------


def test_accum12_compound_1pct_per_month():
    """accum12 on 1%/month series for 12 months = 12.6825...% (compound)."""
    s = _inflation_series(24, monthly_rate=0.01)
    out, meta = _apply("accum12", s)
    expected_pct = (1.01**12 - 1) * 100  # 12.6825...%
    # First 11 values should be NaN (warmup)
    assert out.iloc[:11].isna().all()
    # Values from index 11 onward should equal expected compound rate.
    for val in out.iloc[11:]:
        assert pytest.approx(val, abs=1e-6) == expected_pct


def test_accum12_uses_compound_not_sum():
    """accum12 must compound, not simply sum (compound > simple sum for positive rates)."""
    s = _inflation_series(12, monthly_rate=0.01)
    out, _ = _apply("accum12", s)
    simple_sum = 12 * 1.0  # 12.0%
    compound = (1.01**12 - 1) * 100  # 12.6825...%
    # The compound result should exceed simple sum
    assert out.iloc[11] > simple_sum
    assert pytest.approx(out.iloc[11], abs=1e-5) == compound


def test_stddev12():
    """stddev12 = rolling(12).std() — first 11 values NaN."""
    s = _monthly_series(24)
    out, meta = _apply("stddev12", s)
    expected = s.astype(float).rolling(12, min_periods=12).std()
    pd.testing.assert_series_equal(out, expected, check_names=False)
    assert out.iloc[:11].isna().all()
    assert not np.isnan(out.iloc[11])


# ---------------------------------------------------------------------------
# Normalization group
# ---------------------------------------------------------------------------


def test_rebase_base100():
    """rebase: first valid value becomes 100."""
    s = _monthly_series(6)  # values 1.0, 2.0, 3.0, ...
    out, meta = _apply("rebase", s, params={"base": 100})
    assert pytest.approx(out.iloc[0]) == 100.0
    assert pytest.approx(out.iloc[1]) == 200.0
    assert pytest.approx(out.iloc[2]) == 300.0
    assert meta["gaps"] == []


def test_rebase_custom_base():
    """rebase with base=1000."""
    idx = pd.date_range("2024-01-01", periods=3, freq="MS", tz="UTC")
    s = pd.Series([2.0, 4.0, 8.0], index=idx)
    out, _ = _apply("rebase", s, params={"base": 1000})
    assert pytest.approx(out.iloc[0]) == 1000.0
    assert pytest.approx(out.iloc[1]) == 2000.0


def test_rebase_first_valid_skips_nan():
    """rebase uses first_valid_index(), skipping leading NaN."""
    idx = pd.date_range("2024-01-01", periods=4, freq="MS", tz="UTC")
    s = pd.Series([float("nan"), 2.0, 4.0, 6.0], index=idx)
    out, _ = _apply("rebase", s, params={"base": 100})
    assert np.isnan(out.iloc[0])  # leading NaN stays NaN
    assert pytest.approx(out.iloc[1]) == 100.0
    assert pytest.approx(out.iloc[2]) == 200.0


def test_zscore_mean_zero_std_one():
    """zscore: output.mean() ≈ 0 and output.std() ≈ 1."""
    s = _monthly_series(24)
    out, meta = _apply("zscore", s)
    assert pytest.approx(out.mean(), abs=1e-10) == 0.0
    assert pytest.approx(out.std(ddof=1), abs=1e-10) == 1.0
    assert meta["gaps"] == []


def test_zscore_all_equal_series():
    """zscore on a constant series: all values become 0."""
    idx = pd.date_range("2024-01-01", periods=5, freq="MS", tz="UTC")
    s = pd.Series([5.0] * 5, index=idx)
    out, meta = _apply("zscore", s)
    assert (out == 0.0).all()


def test_percentile_range():
    """percentile: all non-NaN output values in [0, 100]."""
    s = _monthly_series(24)
    out, meta = _apply("percentile", s)
    non_nan = out.dropna()
    assert (non_nan >= 0.0).all()
    assert (non_nan <= 100.0).all()
    assert meta["gaps"] == []


def test_percentile_ordering():
    """Higher raw values have higher percentile ranks."""
    idx = pd.date_range("2024-01-01", periods=5, freq="MS", tz="UTC")
    s = pd.Series([10.0, 20.0, 30.0, 40.0, 50.0], index=idx)
    out, _ = _apply("percentile", s)
    # Ranks should be strictly increasing
    assert list(out) == sorted(out.tolist())
    assert pytest.approx(out.max()) == 100.0


# ---------------------------------------------------------------------------
# NaN gap detection (FR-3.2, AC-6)
# ---------------------------------------------------------------------------


def test_nan_gap_detected_in_metadata():
    """NaN in raw input is detected and classified as 'missing_upstream'."""
    idx = pd.date_range("2024-01-01", periods=6, freq="MS", tz="UTC")
    # Place a NaN in month 3 (index 2)
    s = pd.Series([1.0, 2.0, float("nan"), 4.0, 5.0, 6.0], index=idx)
    spec = TransformSpec(op="level", params={})
    _, meta = apply(spec, s)
    gap_dates = [g["date"] for g in meta["gaps"]]
    assert "2024-03-01" in gap_dates
    assert all(g["reason"] == "missing_upstream" for g in meta["gaps"])


def test_nan_window_warmup_classified_separately():
    """Leading NaN from rolling window is classified as 'window_warmup'."""
    s = _monthly_series(6)
    spec = TransformSpec(op="ma", params={"window": 3})
    _, meta = apply(spec, s)
    warmup_gaps = [g for g in meta["gaps"] if g["reason"] == "window_warmup"]
    upstream_gaps = [g for g in meta["gaps"] if g["reason"] == "missing_upstream"]
    # First 2 observations are warmup NaN (not present in raw)
    assert len(warmup_gaps) == 2
    assert len(upstream_gaps) == 0


def test_nan_gap_with_yoy():
    """YoY on a series with a NaN in month 3: NaN propagates and is reported."""
    idx = pd.date_range("2024-01-01", periods=14, freq="MS", tz="UTC")
    vals = [float(i + 1) for i in range(14)]
    vals[2] = float("nan")  # missing observation at month 3
    s = pd.Series(vals, index=idx)
    spec = TransformSpec(op="yoy", params={})
    transformed, meta = apply(spec, s, frequency="monthly")
    # Month 3 in second year (index 14) would reference missing month 3 of first year
    # All first 12 are warmup NaN; month 3 in year 2 is missing_upstream
    all_reasons = {g["reason"] for g in meta["gaps"]}
    assert "window_warmup" in all_reasons
    # Raw NaN should be detected somewhere
    missing = [g for g in meta["gaps"] if g["reason"] == "missing_upstream"]
    assert len(missing) >= 1


# ---------------------------------------------------------------------------
# Registry completeness and validation
# ---------------------------------------------------------------------------


def test_all_17_ops_registered():
    """All 17 transform ops must be in the TRANSFORMS registry."""
    expected = {
        "level", "sa", "calendar_adj",
        "mom", "qoq", "yoy", "annualized", "diff", "log_diff", "pp",
        "ma", "ewma",
        "accum12", "stddev12",
        "rebase", "zscore", "percentile",
    }
    assert expected == set(TRANSFORMS.keys())


def test_unknown_op_raises_validation():
    """Constructing a TransformSpec with an invalid op raises a ValidationError."""
    from pydantic import ValidationError

    with pytest.raises(ValidationError):
        TransformSpec(op="bogus_transform")  # type: ignore[arg-type]


def test_unknown_op_in_apply_raises_value_error():
    """apply() with an op not in TRANSFORMS raises ValueError."""
    # Bypass Pydantic validation by patching spec.op directly after construction.
    spec = TransformSpec(op="level")
    object.__setattr__(spec, "op", "not_a_real_op")
    s = _monthly_series(4)
    with pytest.raises(ValueError, match="Unknown transform op"):
        apply(spec, s)


# ---------------------------------------------------------------------------
# TransformSpec hash stability
# ---------------------------------------------------------------------------


def test_spec_hash_stable_across_param_order():
    """Spec hash is independent of params dict insertion order."""
    spec_a = TransformSpec(op="ma", params={"window": 12, "extra": "x"})
    spec_b = TransformSpec(op="ma", params={"extra": "x", "window": 12})
    assert spec_a.hash() == spec_b.hash()


def test_spec_hash_differs_for_different_params():
    """Different params produce different hashes."""
    spec_3 = TransformSpec(op="ma", params={"window": 3})
    spec_12 = TransformSpec(op="ma", params={"window": 12})
    assert spec_3.hash() != spec_12.hash()


def test_spec_hash_differs_for_different_ops():
    """Different ops produce different hashes."""
    spec_ma = TransformSpec(op="ma", params={})
    spec_ewma = TransformSpec(op="ewma", params={})
    assert spec_ma.hash() != spec_ewma.hash()
