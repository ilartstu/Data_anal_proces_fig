"""Primary time-series analysis: per-column stats, NaN/zero regions,
anomaly detection and a downsampling safety net for very large series.
"""
from __future__ import annotations

import numpy as np
import pandas as pd


# --------------------------------------------------------------------------- #
# Column statistics
# --------------------------------------------------------------------------- #
def column_stats(s: pd.Series) -> dict:
    n = int(len(s))
    numeric = pd.to_numeric(s, errors="coerce")
    # Numeric if, among the *present* values, most parse as numbers. This keeps
    # mostly-empty columns (lots of NaN) correctly classified as numeric.
    present = s.notna().sum()
    if present == 0:
        is_numeric = pd.api.types.is_numeric_dtype(s)
    else:
        is_numeric = (numeric.notna().sum() / present) >= 0.8
    nan_count = int(s.isna().sum())
    out: dict = {
        "n": n,
        "nan_count": nan_count,
        "nan_pct": round(100 * nan_count / n, 3) if n else 0.0,
        "is_numeric": bool(is_numeric),
        "dtype": str(s.dtype),
    }
    if is_numeric:
        vals = numeric
        zero_count = int((vals == 0).sum())
        finite = vals.dropna()
        out.update({
            "zero_count": zero_count,
            "zero_pct": round(100 * zero_count / n, 3) if n else 0.0,
            "min": _safe_float(finite.min()),
            "max": _safe_float(finite.max()),
            "mean": _safe_float(finite.mean()),
            "std": _safe_float(finite.std()),
            "median": _safe_float(finite.median()),
        })
    else:
        out.update({
            "zero_count": 0, "zero_pct": 0.0,
            "n_unique": int(s.nunique(dropna=True)),
        })
    return out


def _safe_float(v) -> float | None:
    try:
        f = float(v)
        if np.isnan(f) or np.isinf(f):
            return None
        return f
    except (TypeError, ValueError):
        return None


# --------------------------------------------------------------------------- #
# Contiguous runs (NaN / zero regions)
# --------------------------------------------------------------------------- #
def runs_of(mask: np.ndarray) -> list[tuple[int, int]]:
    """Return [start_idx, end_idx] (inclusive) for each run of True."""
    if mask.size == 0:
        return []
    mask = mask.astype(bool)
    idx = np.flatnonzero(np.diff(np.concatenate(([0], mask.view(np.int8), [0]))))
    starts = idx[0::2]
    ends = idx[1::2] - 1
    return list(zip(starts.tolist(), ends.tolist()))


def regions_to_x(runs: list[tuple[int, int]], x: np.ndarray) -> list[list]:
    """Map index runs to [x_start, x_end] pairs for shaded bands."""
    out = []
    for a, b in runs:
        out.append([_x_value(x, a), _x_value(x, b)])
    return out


def _x_value(x: np.ndarray, i: int):
    v = x[i]
    if isinstance(v, (np.integer,)):
        return int(v)
    if isinstance(v, (np.floating,)):
        return float(v)
    return v  # already str / iso


# --------------------------------------------------------------------------- #
# Anomaly detection
# --------------------------------------------------------------------------- #
def detect_anomalies(values: np.ndarray, method: str, params: dict) -> np.ndarray:
    """Return integer indices flagged as anomalies (NaNs never flagged)."""
    v = values.astype(float)
    finite = np.isfinite(v)
    flags = np.zeros(v.shape, dtype=bool)

    if method == "zscore":
        k = float(params.get("threshold", 3.0))
        mu = np.nanmean(v)
        sd = np.nanstd(v)
        if sd and not np.isnan(sd):
            z = np.abs((v - mu) / sd)
            flags = finite & (z > k)

    elif method == "iqr":
        k = float(params.get("factor", 1.5))
        q1 = np.nanpercentile(v, 25)
        q3 = np.nanpercentile(v, 75)
        iqr = q3 - q1
        lo, hi = q1 - k * iqr, q3 + k * iqr
        flags = finite & ((v < lo) | (v > hi))

    elif method == "diff":
        # Point-to-point jump larger than k * std(diff), or an absolute value.
        k = float(params.get("threshold", 4.0))
        abs_thr = params.get("abs_threshold", None)
        d = np.diff(v, prepend=v[:1])
        d[~np.isfinite(d)] = 0.0
        sd = np.nanstd(d[d != 0]) if np.any(d != 0) else 0.0
        if abs_thr is not None:
            flags = finite & (np.abs(d) > float(abs_thr))
        elif sd:
            flags = finite & (np.abs(d) > k * sd)

    elif method == "rolling":
        # Deviation from a rolling median in units of rolling std (MAD-like).
        win = int(params.get("window", 24))
        k = float(params.get("threshold", 3.0))
        s = pd.Series(v)
        med = s.rolling(win, center=True, min_periods=max(3, win // 3)).median()
        std = s.rolling(win, center=True, min_periods=max(3, win // 3)).std()
        dev = (s - med).abs() / std.replace(0, np.nan)
        flags = finite & (dev > k).to_numpy(na_value=False)

    return np.flatnonzero(flags)


# --------------------------------------------------------------------------- #
# Downsampling (safety net for very large series)
# --------------------------------------------------------------------------- #
def interpolate_column(values: np.ndarray, cfg) -> np.ndarray:
    """Linearly interpolate outliers and/or short gaps (NaN / zeros).

    Outliers are always interpolated; gaps only when their run length is in
    (gap_min, gap_max]. Positions not selected keep their original value.
    """
    orig = values.astype(float)
    n = orig.size
    to_interp = np.zeros(n, dtype=bool)

    if cfg.outliers:
        idx = detect_anomalies(orig, cfg.outlier_method, cfg.outlier_params or {})
        to_interp[idx] = True

    if cfg.gaps:
        base = np.zeros(n, dtype=bool)
        if cfg.gap_nan:
            base |= ~np.isfinite(orig)
        if cfg.gap_zeros:
            base |= np.isfinite(orig) & (orig == 0)
        for a, b in runs_of(base):
            L = b - a + 1
            if cfg.gap_min < L <= cfg.gap_max:
                to_interp[a:b + 1] = True

    if not to_interp.any():
        return orig

    work = orig.copy()
    work[to_interp] = np.nan
    filled = pd.Series(work).interpolate(method="linear", limit_area="inside").to_numpy()
    result = orig.copy()
    result[to_interp] = filled[to_interp]
    return result


def minmax_downsample(y: np.ndarray, max_points: int,
                      keep: np.ndarray | None = None) -> np.ndarray:
    """Return the indices to keep: min & max of each bucket, plus any
    indices in `keep` (e.g. anomalies). Preserves spikes and gaps."""
    n = y.size
    if n <= max_points:
        return np.arange(n)
    buckets = max_points // 2
    edges = np.linspace(0, n, buckets + 1, dtype=int)
    idx: list[int] = []
    for a, b in zip(edges[:-1], edges[1:]):
        if b <= a:
            continue
        seg = y[a:b]
        finite = np.isfinite(seg)
        if not finite.any():
            idx.append(a)  # keep a point so the NaN gap is visible
            continue
        rel = np.flatnonzero(finite)
        idx.append(a + int(rel[np.argmin(seg[rel])]))
        idx.append(a + int(rel[np.argmax(seg[rel])]))
    keep_idx = np.array(idx, dtype=int)
    if keep is not None and keep.size:
        keep_idx = np.union1d(keep_idx, keep)
    return np.unique(keep_idx)
