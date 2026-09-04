"""FastAPI application: upload, inspect, series and export endpoints."""
from __future__ import annotations

import io
import pickle
import threading
from collections import OrderedDict

import numpy as np
import pandas as pd
from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse

from . import analysis, parsing, storage
from .models import (
    BlocksRequest, CombineRequest, CorrelationRequest, ExportRequest,
    InspectRequest, MissingRequest, OutliersRequest, RowsRequest, SeriesRequest,
    SpectrumRequest, StatsRequest,
)

app = FastAPI(title="Figures — Time Series Explorer", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

ANOMALY_CAP = 20_000

# In-memory cache of parsed dataframes: parse a file once, reuse it for every
# request (edits are applied on a copy). This is the main performance win —
# re-parsing Excel/CSV on every change is what made the app sluggish.
_DF_CACHE: "OrderedDict[tuple, pd.DataFrame]" = OrderedDict()
_CACHE_MAX = 24
_CACHE_LOCK = threading.Lock()


def _parse_cached(up, sheet, header_row, skip_after):
    key = (up.id, sheet, int(header_row), int(skip_after))
    with _CACHE_LOCK:
        df = _DF_CACHE.get(key)
        if df is not None:
            _DF_CACHE.move_to_end(key)
            return df
    df = parsing.read_dataframe(up, sheet, header_row, skip_after)
    with _CACHE_LOCK:
        _DF_CACHE[key] = df
        _DF_CACHE.move_to_end(key)
        while len(_DF_CACHE) > _CACHE_MAX:
            _DF_CACHE.popitem(last=False)
    return df


def _evict_cache(upload_id: str | None = None):
    with _CACHE_LOCK:
        if upload_id is None:
            _DF_CACHE.clear()
        else:
            for k in [k for k in _DF_CACHE if k[0] == upload_id]:
                _DF_CACHE.pop(k, None)


@app.get("/api/health")
def health() -> dict:
    return {"status": "ok"}


@app.post("/api/reset")
def reset(body: dict) -> dict:
    """Delete the given uploaded files and drop their cached parses."""
    ids = body.get("ids") or []
    for uid in ids:
        if isinstance(uid, str):
            storage.delete(uid)
            _evict_cache(uid)
    return {"deleted": len(ids)}


# --------------------------------------------------------------------------- #
# Upload
# --------------------------------------------------------------------------- #
@app.post("/api/upload")
async def upload(file: UploadFile = File(...)) -> dict:
    content = await file.read()
    if not content:
        raise HTTPException(400, "Empty file")
    delimiter = None
    ext = (file.filename or "").lower()
    if ext.endswith((".csv", ".txt", ".tsv")):
        sample = content[:65536]
        try:
            text = sample.decode("utf-8-sig")
        except UnicodeDecodeError:
            text = sample.decode("latin-1", errors="replace")
        delimiter = parsing.detect_delimiter(text)
    up = storage.save(file.filename or "upload.csv", content, delimiter)
    sheets = parsing.list_sheets(up)
    preview = parsing.raw_preview(up, sheets[0] if sheets else None)
    return {
        "id": up.id,
        "filename": up.filename,
        "sheets": sheets,
        "delimiter": up.delimiter,
        "preview": preview,
    }


@app.post("/api/preview")
def preview(req: InspectRequest) -> dict:
    up = _get(req.id)
    return parsing.raw_preview(up, req.sheet)


# --------------------------------------------------------------------------- #
# Inspect — columns + per-column statistics
# --------------------------------------------------------------------------- #
@app.post("/api/inspect")
def inspect(req: InspectRequest) -> dict:
    try:
        df = _read(req, drop_cols=False)   # keep dropped columns visible (marked)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(400, f"Parse error: {exc}") from exc

    dropped = set(req.edits.drop_columns) if req.edits else set()
    rev = {n: o for o, n in (req.edits.renames or {}).items()} if req.edits else {}
    columns = []
    suggested_x = None
    for col in df.columns:
        s = df[col]
        stats = analysis.column_stats(s)
        is_time = _looks_like_time(s)
        stats["is_time"] = is_time
        stats["name"] = col
        stats["original"] = rev.get(col, col)
        stats["dropped"] = col in dropped
        base = rev.get(col, col)
        is_unnamed = base.startswith("Unnamed") or base.startswith("col_")
        stats["auto_empty"] = bool(is_unnamed and stats["nan_count"] == stats["n"])
        if suggested_x is None and is_time and col not in dropped:
            suggested_x = col
        columns.append(stats)
    if suggested_x is None and len(df.columns):
        suggested_x = str(df.columns[0])
    try:
        # Base (pre-rename) column names aligned to positions — from the cache.
        resolved = list(_parse_cached(_get(req.id), req.sheet, req.header_row, req.skip_after).columns)
    except Exception:  # noqa: BLE001
        resolved = None
    return {"columns": columns, "nrows": int(len(df)),
            "suggested_x": suggested_x, "resolved": resolved}


# --------------------------------------------------------------------------- #
# Combine — merge several files on their time axis into one labeled dataset
# --------------------------------------------------------------------------- #
@app.post("/api/combine")
def combine(req: CombineRequest) -> dict:
    if len(req.sources) < 2:
        raise HTTPException(400, "Нужно минимум 2 файла для объединения")
    frames = []
    for src in req.sources:
        df = _read(src)                       # per-source edits applied
        if not len(df.columns):
            continue
        x_col = src.x_col if (src.x_col and src.x_col in df.columns) \
            else _detect_time_col(df)
        xt = pd.to_datetime(df[x_col].astype(str), errors="coerce", format="mixed")
        data = df.drop(columns=[x_col])
        data = data.dropna(axis=1, how="all")  # drop fully-empty columns
        data.columns = [f"{src.label} · {c}" for c in data.columns]
        data.index = xt
        data = data[data.index.notna()]
        data = data[~data.index.duplicated(keep="first")]
        frames.append(data)
    if not frames:
        raise HTTPException(400, "Нет данных для объединения")

    combined = pd.concat(frames, axis=1, join="outer").sort_index()
    idx = pd.DatetimeIndex(combined.index)
    time_vals = [t.isoformat() if pd.notna(t) else "" for t in idx]
    combined.insert(0, req.time_label, time_vals)
    combined = combined.reset_index(drop=True)

    # Store as pickle (fast) and pre-cache the frame so the first request is a
    # cache hit — no slow re-parse of a huge combined file.
    up = storage.save("combined.pkl", pickle.dumps(combined), None)
    key = (up.id, None, 0, 0)
    with _CACHE_LOCK:
        _DF_CACHE[key] = combined
        _DF_CACHE.move_to_end(key)
        while len(_DF_CACHE) > _CACHE_MAX:
            _DF_CACHE.popitem(last=False)
    return {"id": up.id, "columns": [str(c) for c in combined.columns],
            "nrows": int(len(combined)), "time_col": req.time_label}


def _detect_time_col(df) -> str:
    for c in df.columns:
        try:
            if _looks_like_time(df[c]):
                return c
        except Exception:  # noqa: BLE001
            continue
    return str(df.columns[0])


# --------------------------------------------------------------------------- #
# Rows — a page of the working copy for the editable grid
# --------------------------------------------------------------------------- #
@app.post("/api/rows")
def rows(req: RowsRequest) -> dict:
    up = _get(req.id)
    df = _parse_cached(up, req.sheet, req.header_row, req.skip_after)
    if req.edits and (req.edits.renames or req.edits.drop_columns):
        df = df.copy()
    if req.edits and req.edits.renames:
        df = df.rename(columns={o: n for o, n in req.edits.renames.items() if o in df.columns})
    if req.edits and req.edits.drop_columns:
        df = df.drop(columns=[c for c in req.edits.drop_columns if c in df.columns])
    total = len(df)
    cols = [str(c) for c in df.columns]
    lo = max(0, int(req.offset))
    hi = min(total, lo + max(1, int(req.limit)))
    page = df.iloc[lo:hi]
    rows_out = []
    for pos, (_, row) in zip(range(lo, hi), page.iterrows()):
        cells = ["" if pd.isna(v) else str(v) for v in row.tolist()]
        rows_out.append({"idx": int(pos), "cells": cells})
    return {"columns": cols, "total": int(total), "offset": lo, "rows": rows_out}


# --------------------------------------------------------------------------- #
# Series — data + regions + anomalies for plotting
# --------------------------------------------------------------------------- #
@app.post("/api/series")
def series(req: SeriesRequest) -> dict:
    df = _read(req)
    x_col = req.x_col or (str(df.columns[0]) if len(df.columns) else None)
    y_cols = [c for c in req.y_cols if c in df.columns]
    if not y_cols:
        raise HTTPException(400, "No valid y columns selected")

    x_raw, x_is_time = _build_x(df, x_col)
    if req.sort_x and x_is_time:
        df, x_raw = _sort_by_x(df, x_raw)

    # Optional resampling (time axis only).
    if req.resample.rule and x_is_time:
        df, x_raw = _resample(df, x_raw, y_cols, req.resample.rule,
                              req.resample.agg)

    x_list = _format_x(x_raw, x_is_time)
    x_np = np.asarray(x_raw)

    series_out = []
    for col in y_cols:
        y = pd.to_numeric(df[col], errors="coerce").to_numpy(dtype=float)
        nan_mask = ~np.isfinite(y)
        nan_regions = analysis.regions_to_x(analysis.runs_of(nan_mask), x_list_arr(x_list))
        zero_regions = []
        if req.detect_zeros:
            zero_mask = np.isfinite(y) & (y == 0)
            zero_regions = analysis.regions_to_x(
                analysis.runs_of(zero_mask), x_list_arr(x_list))

        anomaly_idx = np.array([], dtype=int)
        if req.anomaly.method and req.anomaly.method != "none":
            anomaly_idx = analysis.detect_anomalies(
                y, req.anomaly.method, req.anomaly.params)

        # Downsample only if necessary; anomalies are always kept.
        keep = analysis.minmax_downsample(y, req.max_points, keep=anomaly_idx)
        own_x = None
        if keep.size < y.size:
            y_send = y[keep]
            own_x = [x_list[i] for i in keep]
        else:
            y_send = y

        anomalies = [{"x": x_list[i], "y": _num(y[i])}
                     for i in anomaly_idx[:ANOMALY_CAP]]

        series_out.append({
            "name": col,
            "y": [_num(v) for v in y_send],
            "x": own_x,
            "nan_regions": nan_regions,
            "zero_regions": zero_regions,
            "anomalies": anomalies,
            "anomaly_count": int(anomaly_idx.size),
            "anomaly_truncated": bool(anomaly_idx.size > ANOMALY_CAP),
            "stats": analysis.column_stats(df[col]),
        })

    return {
        "x": x_list,
        "x_is_time": x_is_time,
        "x_col": x_col,
        "n": int(len(x_list)),
        "series": series_out,
    }


# --------------------------------------------------------------------------- #
# Export cleaned data
# --------------------------------------------------------------------------- #
@app.post("/api/export/data")
def export_data(req: ExportRequest):
    df = _read(req)                      # working-copy edits (incl. deletions) applied
    x_col = req.x_col or (str(df.columns[0]) if len(df.columns) else None)
    y_cols = [c for c in req.y_cols if c in df.columns and c != x_col] \
        or [c for c in df.columns if c != x_col]

    x_raw, x_is_time = _build_x(df, x_col)
    if req.sort_x and x_is_time:
        df, x_raw = _sort_by_x(df, x_raw)

    if req.resample.rule and x_is_time:
        df, x_raw = _resample(df, x_raw, y_cols, req.resample.rule, req.resample.agg)

    out = pd.DataFrame({x_col: _format_x(x_raw, x_is_time)})
    for col in y_cols:
        out[col] = pd.to_numeric(df[col], errors="coerce").to_numpy()
    if req.drop_empty_rows:
        keep = [c for c in y_cols if c != x_col]
        out = out.dropna(subset=keep, how="all").reset_index(drop=True)
    if req.dropna:
        out = out.dropna(how="any").reset_index(drop=True)

    buf = io.BytesIO()
    if req.fmt == "xlsx":
        with pd.ExcelWriter(buf, engine="xlsxwriter") as writer:
            out.to_excel(writer, index=False, sheet_name="data")
        media = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        fname = "figures_export.xlsx"
    else:
        out.to_csv(buf, index=False)
        media = "text/csv"
        fname = "figures_export.csv"
    buf.seek(0)
    return StreamingResponse(
        buf, media_type=media,
        headers={"Content-Disposition": f'attachment; filename="{fname}"'})


# --------------------------------------------------------------------------- #
# Correlation matrix
# --------------------------------------------------------------------------- #
@app.post("/api/correlation")
def correlation(req: CorrelationRequest) -> dict:
    df = _read(req)
    cols = [c for c in req.y_cols if c in df.columns]
    if len(cols) < 2:
        raise HTTPException(400, "Select at least 2 columns for correlation")

    num = df[cols].apply(pd.to_numeric, errors="coerce")
    if req.resample.rule and req.x_col in df.columns:
        x_raw, x_is_time = _build_x(df, req.x_col)
        if x_is_time:
            num.index = pd.DatetimeIndex(pd.to_datetime(x_raw, errors="coerce"))
            num = num[num.index.notna()]
            try:
                num = num.resample(req.resample.rule).agg(req.resample.agg)
            except Exception as exc:  # noqa: BLE001
                raise HTTPException(400, f"Bad resample rule: {exc}")

    method = req.method if req.method in ("pearson", "spearman", "kendall") else "pearson"
    corr = num.corr(method=method)
    # Pairwise count of complete (non-NaN) observations.
    valid = num.notna().astype(int)
    counts = valid.T.dot(valid)

    matrix = [[None if pd.isna(v) else round(float(v), 4) for v in row]
              for row in corr.to_numpy()]
    count_matrix = counts.to_numpy().astype(int).tolist()
    return {"columns": cols, "matrix": matrix, "counts": count_matrix,
            "method": method}


# --------------------------------------------------------------------------- #
# Long blocks of consecutive NaN / zeros
# --------------------------------------------------------------------------- #
@app.post("/api/blocks")
def blocks(req: BlocksRequest) -> dict:
    df = _read(req)
    x_col = req.x_col or (str(df.columns[0]) if len(df.columns) else None)
    x_raw, x_is_time = _build_x(df, x_col)
    x_list = _format_x(x_raw, x_is_time)
    cols = [c for c in req.y_cols if c in df.columns] or \
           [c for c in df.columns if c != x_col]
    kinds = set(req.kinds or [])
    min_len = max(1, int(req.min_length))

    out = []
    for col in cols:
        y = pd.to_numeric(df[col], errors="coerce").to_numpy(dtype=float)
        if "nan" in kinds:
            for a, b in analysis.runs_of(~np.isfinite(y)):
                if b - a + 1 >= min_len:
                    out.append(_block_row(col, a, b, "NaN", 0, b - a + 1, x_list))
        if "zeros" in kinds:
            for a, b in analysis.runs_of(np.isfinite(y) & (y == 0)):
                if b - a + 1 >= min_len:
                    out.append(_block_row(col, a, b, "нули", b - a + 1, 0, x_list))

    out.sort(key=lambda r: (r["start_idx"], r["parameter"]))
    return {"total_rows": int(len(df)), "x_is_time": x_is_time,
            "x_col": x_col, "blocks": out}


def _block_row(col, a, b, kind, n_zeros, n_nan, x_list):
    return {
        "parameter": col, "start_idx": int(a), "end_idx": int(b),
        "start": x_list[a], "end": x_list[b], "length": int(b - a + 1),
        "kind": kind, "n_zeros": int(n_zeros), "n_nan": int(n_nan),
    }


# --------------------------------------------------------------------------- #
# Outliers — list detected outlier points (for manual deletion)
# --------------------------------------------------------------------------- #
OUTLIER_CAP = 8000


@app.post("/api/outliers")
def outliers(req: OutliersRequest) -> dict:
    # Detect on structurally-edited data only, so deleted outliers still show.
    df = _read(req, clean=False)
    x_col = req.x_col or (str(df.columns[0]) if len(df.columns) else None)
    x_raw, x_is_time = _build_x(df, x_col)
    x_list = _format_x(x_raw, x_is_time)
    cols = [c for c in req.y_cols if c in df.columns] or \
           [c for c in df.columns if c != x_col]

    out = []
    for col in cols:
        y = pd.to_numeric(df[col], errors="coerce").to_numpy(dtype=float)
        if not np.isfinite(y).any():
            continue
        idx = analysis.detect_anomalies(y, req.method, req.params or {})
        for i in idx:
            out.append({"parameter": col, "idx": int(i),
                        "x": x_list[i], "value": _num(y[i])})
    out.sort(key=lambda r: (r["parameter"], r["idx"]))
    return {"total_rows": int(len(df)), "x_is_time": x_is_time, "x_col": x_col,
            "count": len(out), "truncated": len(out) > OUTLIER_CAP,
            "outliers": out[:OUTLIER_CAP]}


# --------------------------------------------------------------------------- #
# Spectrum (FFT periodogram / autocorrelation)
# --------------------------------------------------------------------------- #
@app.post("/api/spectrum")
def spectrum(req: SpectrumRequest) -> dict:
    df = _read(req)
    x_col = req.x_col or (str(df.columns[0]) if len(df.columns) else None)
    y_cols = [c for c in req.y_cols if c in df.columns]
    if not y_cols:
        raise HTTPException(400, "No valid columns selected")

    x_raw, x_is_time = _build_x(df, x_col)
    dt_hours = None
    if x_is_time:
        idx = pd.DatetimeIndex(pd.to_datetime(x_raw, errors="coerce"))
        d = idx.to_series().diff().median()
        if pd.notna(d):
            dt_hours = d.total_seconds() / 3600.0

    series = []
    for col in y_cols:
        y = pd.to_numeric(df[col], errors="coerce").interpolate(limit_direction="both")
        v = y.to_numpy(dtype=float)
        if not np.isfinite(v).any():
            continue
        v = np.nan_to_num(v - np.nanmean(v))
        n = v.size
        if n < 8:
            continue
        if req.method == "acf":
            max_lag = int(min(req.max_lag, n - 1))
            denom = float(np.dot(v, v)) or 1.0
            acf = [float(np.dot(v[:n - k], v[k:]) / denom) for k in range(max_lag + 1)]
            series.append({"name": col, "lags": list(range(max_lag + 1)), "acf": acf})
        else:
            amp = np.abs(np.fft.rfft(v)) ** 2
            freq = np.fft.rfftfreq(n)            # cycles per sample
            amp, freq = amp[1:], freq[1:]        # drop DC
            if amp.size > req.max_points:
                amp, freq = amp[:req.max_points], freq[:req.max_points]
            period_samples = [float(1.0 / f) if f else None for f in freq]
            period_hours = ([float(p * dt_hours) if (p and dt_hours) else None
                             for p in period_samples] if dt_hours else None)
            series.append({
                "name": col, "freq": freq.tolist(), "power": amp.tolist(),
                "period_samples": period_samples, "period_hours": period_hours,
            })
    return {"method": req.method, "dt_hours": dt_hours, "series": series}


# --------------------------------------------------------------------------- #
# Missing / zero map across all columns over time
# --------------------------------------------------------------------------- #
@app.post("/api/missing")
def missing(req: MissingRequest) -> dict:
    df = _read(req)
    x_col = req.x_col or (str(df.columns[0]) if len(df.columns) else None)
    cols = [c for c in df.columns if c != x_col]
    x_raw, x_is_time = _build_x(df, x_col)
    x_list = _format_x(x_raw, x_is_time)

    n = len(df)
    buckets = max(1, min(int(req.buckets), n))
    edges = np.linspace(0, n, buckets + 1, dtype=int)
    labels = [x_list[edges[i]] for i in range(buckets)]

    z = []
    for col in cols:
        y = pd.to_numeric(df[col], errors="coerce").to_numpy(dtype=float)
        if req.kind == "zeros":
            mask = np.isfinite(y) & (y == 0)
        elif req.kind == "both":
            mask = (~np.isfinite(y)) | (y == 0)
        else:
            mask = ~np.isfinite(y)
        row = [float(mask[a:b].mean()) if b > a else 0.0
               for a, b in zip(edges[:-1], edges[1:])]
        z.append(row)
    return {"columns": cols, "x": labels, "x_is_time": x_is_time,
            "kind": req.kind, "z": z}


# --------------------------------------------------------------------------- #
# Export per-column statistics
# --------------------------------------------------------------------------- #
@app.post("/api/export/stats")
def export_stats(req: StatsRequest):
    df = _read(req)
    x_col = req.x_col or (str(df.columns[0]) if len(df.columns) else None)
    y_cols = [c for c in req.y_cols if c in df.columns] or \
             [c for c in df.columns if c != x_col]

    if req.resample.rule:
        x_raw, x_is_time = _build_x(df, x_col)
        if x_is_time:
            df, _ = _resample(df, x_raw, y_cols, req.resample.rule, req.resample.agg)

    total = int(len(df))
    rows = []
    for col in y_cols:
        s = analysis.column_stats(df[col])
        rows.append({
            "Параметр": col, "Точек": s["n"],
            "NaN": s["nan_count"], "NaN %": s["nan_pct"],
            "Нулей": s.get("zero_count", 0), "Нули %": s.get("zero_pct", 0),
            "min": s.get("min"), "max": s.get("max"),
            "Среднее": s.get("mean"), "Медиана": s.get("median"), "σ": s.get("std"),
        })
    table = pd.DataFrame(rows)

    buf = io.BytesIO()
    if req.fmt == "xlsx":
        with pd.ExcelWriter(buf, engine="xlsxwriter") as writer:
            table.to_excel(writer, index=False, sheet_name="stats", startrow=2)
            ws = writer.sheets["stats"]
            ws.write(0, 0, "Всего строк")
            ws.write(0, 1, total)
        media = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        fname = "figures_stats.xlsx"
    else:
        header = f"Всего строк,{total}\n\n"
        buf.write(header.encode("utf-8"))
        buf.write(table.to_csv(index=False).encode("utf-8"))
        media = "text/csv"
        fname = "figures_stats.csv"
    buf.seek(0)
    return StreamingResponse(
        buf, media_type=media,
        headers={"Content-Disposition": f'attachment; filename="{fname}"'})


# --------------------------------------------------------------------------- #
# Helpers
# --------------------------------------------------------------------------- #
def _get(upload_id: str):
    try:
        return storage.get(upload_id)
    except KeyError:
        raise HTTPException(404, "Upload not found (expired?) — re-upload the file")


def _read(req, drop_cols: bool = True, clean: bool = True):
    """Read the parsed dataframe and apply non-destructive working-copy edits.
    The original file on disk is never modified.

    `clean=False` applies only structural edits (renames / dropped columns &
    rows) and skips cell deletions + interpolation — used by the outliers list
    so that a deleted outlier still shows (marked), not vanishes.
    """
    up = _get(req.id)
    df = _parse_cached(up, req.sheet, req.header_row, req.skip_after)
    e = getattr(req, "edits", None)
    has_edits = e and (e.renames or e.drop_columns or e.drop_rows or e.deletions
                       or (e.interpolate and e.interpolate.enabled))
    if not has_edits:
        return df
    df = df.copy()   # don't mutate the cached parse
    if e.renames:
        df = df.rename(columns={o: n for o, n in e.renames.items() if o in df.columns})
    if drop_cols and e.drop_columns:
        df = df.drop(columns=[c for c in e.drop_columns if c in df.columns])
    if e.drop_rows:
        valid = [i for i in e.drop_rows if 0 <= i < len(df)]
        if valid:
            df = df.drop(index=valid).reset_index(drop=True)
    if not clean:
        return df
    # Cell-level deletions (from blocks / outliers) → blank to NaN.
    if e.deletions:
        data_cols = list(df.columns)
        for d in e.deletions:
            a = max(0, int(d.start_idx))
            b = min(len(df) - 1, int(d.end_idx))
            if b < a:
                continue
            cols = [d.column] if (d.column and d.column in df.columns) else data_cols
            for col in cols:
                df.iloc[a:b + 1, df.columns.get_loc(col)] = np.nan
    # Linear interpolation of gaps / outliers.
    if e.interpolate and e.interpolate.enabled and (e.interpolate.gaps or e.interpolate.outliers):
        for col in df.columns:
            num = pd.to_numeric(df[col], errors="coerce")
            if num.notna().sum() == 0:
                continue
            # Skip obvious non-numeric (mostly text) columns.
            if num.notna().sum() < 0.5 * len(num) and df[col].notna().sum() > num.notna().sum():
                continue
            df[col] = analysis.interpolate_column(num.to_numpy(dtype=float), e.interpolate)
    return df


def _looks_like_time(s: pd.Series) -> bool:
    if pd.api.types.is_datetime64_any_dtype(s):
        return True
    sample = s.dropna().astype(str).head(50)
    if sample.empty:
        return False
    parsed = pd.to_datetime(sample, errors="coerce", format="mixed")
    return bool(parsed.notna().mean() > 0.7)


def _build_x(df: pd.DataFrame, x_col: str | None):
    if x_col is None or x_col not in df.columns:
        return np.arange(len(df)), False
    s = df[x_col]
    if _looks_like_time(s):
        dt = pd.to_datetime(s, errors="coerce", format="mixed")
        return dt, True
    num = pd.to_numeric(s, errors="coerce")
    if num.notna().mean() > 0.7:
        return num.to_numpy(dtype=float), False
    return np.arange(len(df)), False


def _sort_by_x(df, x_raw):
    """Sort rows chronologically by the (datetime) x values."""
    xi = pd.to_datetime(pd.Series(np.asarray(x_raw, dtype=object)), errors="coerce")
    order = xi.reset_index(drop=True).sort_values(kind="stable").index.to_numpy()
    return df.iloc[order].reset_index(drop=True), np.asarray(x_raw, dtype=object)[order]


def _resample(df, x_raw, y_cols, rule, agg):
    tmp = df[y_cols].apply(pd.to_numeric, errors="coerce")
    tmp.index = pd.DatetimeIndex(pd.to_datetime(x_raw, errors="coerce"))
    tmp = tmp[tmp.index.notna()]
    try:
        res = tmp.resample(rule).agg(agg)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(400, f"Bad resample rule '{rule}': {exc}")
    return res.reset_index(drop=True), res.index


def _format_x(x_raw, x_is_time):
    if x_is_time:
        idx = pd.DatetimeIndex(pd.to_datetime(x_raw, errors="coerce"))
        return [None if pd.isna(t) else t.isoformat() for t in idx]
    return [_num(v) for v in np.asarray(x_raw)]


def x_list_arr(x_list):
    return np.asarray(x_list, dtype=object)


def _num(v):
    try:
        f = float(v)
        if np.isnan(f) or np.isinf(f):
            return None
        return f
    except (TypeError, ValueError):
        return v
