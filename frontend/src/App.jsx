import React, { useCallback, useEffect, useRef, useState } from "react";
import Plotly from "plotly.js-dist-min";

import * as api from "./api";
import { PALETTE, VIEW_MODES, DIST_TYPES, CORR_METHODS, SPECTRUM_METHODS, MISSING_KINDS } from "./constants";
import Uploader from "./components/Uploader";
import HeaderPicker from "./components/HeaderPicker";
import ColumnConfig from "./components/ColumnConfig";
import Controls from "./components/Controls";
import Chart from "./components/Chart";
import DistributionChart from "./components/DistributionChart";
import CorrelationView from "./components/CorrelationView";
import SpectrumView from "./components/SpectrumView";
import WindRoseView from "./components/WindRoseView";
import MissingMapView from "./components/MissingMapView";
import StatsTable from "./components/StatsTable";
import BlocksView from "./components/BlocksView";
import OutliersView from "./components/OutliersView";
import TableView from "./components/TableView";
import ExportBar from "./components/ExportBar";
import Annotations from "./components/Annotations";

function defaultStyle(i) {
  return { enabled: false, color: PALETTE[i % PALETTE.length], type: "line",
    axis: 1, width: 1.6, opacity: 1, dash: "solid" };
}

export default function App() {
  const [error, setError] = useState(null);
  const [uploadBusy, setUploadBusy] = useState(false);
  const [upload, setUpload] = useState(null);         // active dataset {id, filename}
  const [uploadSheets, setUploadSheets] = useState([]);
  const [sheet, setSheet] = useState(null);
  const [preview, setPreview] = useState(null);
  const [headerRow, setHeaderRow] = useState(0);
  // Multi-file: source files (1..5) and the combined dataset.
  const [sources, setSources] = useState([]);         // [{id, filename, sheets, sheet, headerRow, preview, label}]
  const [configFileIdx, setConfigFileIdx] = useState(0);
  const [combinedId, setCombinedId] = useState(null);
  const [combineBusy, setCombineBusy] = useState(false);
  const [tableSource, setTableSource] = useState("combined");
  const [inspectData, setInspectData] = useState(null);
  const [xCol, setXCol] = useState(null);
  const [styles, setStyles] = useState({});
  const [order, setOrder] = useState([]);          // column draw/list order
  const [axisCount, setAxisCount] = useState(2);   // number of Y axes
  const [resample, setResample] = useState({ rule: "", agg: "mean" });
  const [anomaly, setAnomaly] = useState({ method: "none", params: {} });
  const [flags, setFlags] = useState({ showNan: true, detectZeros: true, showAnnotations: true, alignZero: true });
  const [anomalyStyle, setAnomalyStyle] = useState({ mode: "dot", color: "#111111", size: 5 });
  const [rolling, setRolling] = useState({ enabled: false, window: 24, band: true });
  const [seriesData, setSeriesData] = useState(null);
  const [seriesBusy, setSeriesBusy] = useState(false);
  const [annotations, setAnnotations] = useState([]);
  const [busyExport, setBusyExport] = useState(false);

  // View mode + per-mode state.
  const [viewMode, setViewMode] = useState("timeseries");
  const [distType, setDistType] = useState("histogram");
  const [bins, setBins] = useState(40);
  const [corrMethod, setCorrMethod] = useState("pearson");
  const [corr, setCorr] = useState(null);
  const [corrBusy, setCorrBusy] = useState(false);
  const [pairX, setPairX] = useState(null);
  const [pairY, setPairY] = useState(null);
  const [corrTarget, setCorrTarget] = useState(null);

  // Long-blocks (NaN/zero runs) + data cleaning.
  const [blocksMinLen, setBlocksMinLen] = useState(24);
  const [blocksKinds, setBlocksKinds] = useState(["nan", "zeros"]);
  const [blocksParam, setBlocksParam] = useState("__any__");
  const [blocksData, setBlocksData] = useState(null);
  const [blocksBusy, setBlocksBusy] = useState(false);
  const [deletions, setDeletions] = useState([]);   // [{column,start_idx,end_idx}]

  // Spectrum / missing-map / wind-rose.
  const [spectrumMethod, setSpectrumMethod] = useState("fft");
  const [spectrumMaxLag, setSpectrumMaxLag] = useState(168);
  const [spectrumData, setSpectrumData] = useState(null);
  const [spectrumBusy, setSpectrumBusy] = useState(false);
  const [missingKind, setMissingKind] = useState("nan");
  const [missingData, setMissingData] = useState(null);
  const [missingBusy, setMissingBusy] = useState(false);
  const [windDir, setWindDir] = useState(null);
  const [windMag, setWindMag] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);   // manual chart re-mount

  // Non-destructive working-copy edits.
  const [dropColumns, setDropColumns] = useState([]);
  const [dropRows, setDropRows] = useState([]);
  const [renames, setRenames] = useState({});        // original -> new name
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [sidebarWidth, setSidebarWidth] = useState(360);
  // Manual-calc mode: heavy chart isn't recomputed on every change — only on
  // "Пересчитать". Keeps adjusting settings snappy on large files.
  const [manualMode, setManualMode] = useState(false);
  const [computeToken, setComputeToken] = useState(0);
  const [hasPending, setHasPending] = useState(false);
  const [sortX, setSortX] = useState(false);
  const [interp, setInterp] = useState({
    enabled: false, gaps: true, gap_min: 5, gap_max: 24, gap_nan: true, gap_zeros: false,
    outliers: false, outlier_method: "zscore", outlier_params: { threshold: 3.5 },
  });

  // Outliers mode.
  const [outMethod, setOutMethod] = useState("zscore");
  const [outParams, setOutParams] = useState({ threshold: 3.5 });
  const [outParam, setOutParam] = useState("__any__");
  const [outData, setOutData] = useState(null);
  const [outBusy, setOutBusy] = useState(false);
  const [tablePage, setTablePage] = useState(0);
  const [tableData, setTableData] = useState(null);
  const [tableBusy, setTableBusy] = useState(false);

  const gdRef = useRef(null);
  const seriesReq = useRef(0);
  const corrReq = useRef(0);
  const blocksReq = useRef(0);
  const spectrumReq = useRef(0);
  const missingReq = useRef(0);
  const outReq = useRef(0);
  const autoEnabled = useRef(null);
  const autoEmptied = useRef(null);
  const debounceTimer = useRef(null);
  const combineTimer = useRef(null);
  const seriesTok = useRef(0);

  // enabledCols follow the user-defined order (drives z-order & trace order).
  const orderedCols = order.filter((k) => inspectData?.columns.some((c) => c.name === k));
  const enabledCols = orderedCols.filter(
    (k) => styles[k]?.enabled && k !== xCol && !dropColumns.includes(k));
  const yKey = enabledCols.join("|");
  // Working-copy edits payload sent with every request.
  const editsPayload = {
    renames, drop_columns: dropColumns, drop_rows: dropRows,
    deletions, interpolate: interp,
  };
  const editsKey = JSON.stringify(editsPayload);
  // Current-name -> original-name map (for keying renames by original).
  const origOf = {};
  (inspectData?.columns || []).forEach((c) => { origOf[c.name] = c.original || c.name; });
  const hasTime = !!inspectData?.columns.find((c) => c.name === xCol)?.is_time;
  // Signature of axis assignments — used to force a clean chart re-mount when
  // the axis structure changes (fixes stale axes left over by Plotly).
  const axisSig = enabledCols
    .map((c) => (typeof styles[c]?.axis === "number" ? styles[c].axis : (styles[c]?.axis === "y2" ? 2 : 1)))
    .join(",");

  // Charts use window-resize to reflow; the sidebar toggle/resize doesn't emit
  // one, so dispatch it manually (fixes stale chart width & overlap).
  useEffect(() => {
    const t = setTimeout(() => window.dispatchEvent(new Event("resize")), 80);
    return () => clearTimeout(t);
  }, [sidebarOpen, sidebarWidth]);

  // Drag the sidebar's right edge to resize it.
  const startSidebarResize = (e) => {
    e.preventDefault();
    const startX = e.clientX;
    const startW = sidebarWidth;
    const move = (ev) => {
      const w = Math.min(680, Math.max(300, startW + (ev.clientX - startX)));
      setSidebarWidth(w);
    };
    const up = () => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
      document.body.style.userSelect = "";
    };
    document.body.style.userSelect = "none";
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
  };

  // -------- Compute controls (manual mode / stop / reset) --------
  const onRecompute = () => { setComputeToken((t) => t + 1); setHasPending(false); };
  const onStop = () => {
    // Ignore any in-flight responses and drop the busy state (frontend stops
    // waiting; the file & presets stay).
    seriesReq.current++; corrReq.current++; blocksReq.current++;
    spectrumReq.current++; missingReq.current++; outReq.current++;
    clearTimeout(debounceTimer.current); clearTimeout(combineTimer.current);
    setSeriesBusy(false); setCorrBusy(false); setBlocksBusy(false);
    setSpectrumBusy(false); setMissingBusy(false); setOutBusy(false);
    setTableBusy(false); setCombineBusy(false); setBusyExport(false);
  };
  const onResetAll = async () => {
    if (!window.confirm("Сбросить всё: остановить расчёты и удалить загруженные файлы?")) return;
    onStop();
    const ids = [...sources.map((s) => s.id), combinedId].filter(Boolean);
    try { if (ids.length) await api.reset({ ids }); } catch { /* ignore */ }
    window.location.reload();
  };

  // -------- Reset all per-dataset analysis state (columns changed) --------
  const resetAnalysis = () => {
    setInspectData(null); setSeriesData(null); setStyles({}); setOrder([]);
    setXCol(null); setAnnotations([]); setDeletions([]); setBlocksData(null);
    setDropColumns([]); setDropRows([]); setRenames({}); setTableData(null); setTablePage(0);
    setOutData(null); setTableSource("combined");
  };

  const labelFor = (filename) =>
    (filename || "файл").replace(/\.[^.]+$/, "").slice(0, 24);
  const makeSource = (res) => ({
    id: res.id, filename: res.filename, sheets: res.sheets || [],
    sheet: res.sheets?.[0] || null, headerRow: res.preview?.suggested_header ?? 0,
    preview: res.preview, label: labelFor(res.filename),
  });

  // -------- Upload first file (replaces everything) --------
  const onFile = useCallback(async (file) => {
    setError(null); setUploadBusy(true);
    try {
      const res = await api.uploadFile(file);
      resetAnalysis();
      setSources([makeSource(res)]);
      setConfigFileIdx(0);
    } catch (e) { setError(String(e.message || e)); }
    finally { setUploadBusy(false); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // -------- Add another file (up to 5) --------
  const onAddFile = useCallback(async (file) => {
    if (sources.length >= 5) { setError("Максимум 5 файлов"); return; }
    setError(null); setUploadBusy(true);
    try {
      const res = await api.uploadFile(file);
      resetAnalysis();
      setSources((prev) => [...prev, makeSource(res)]);
      setConfigFileIdx(sources.length);
    } catch (e) { setError(String(e.message || e)); }
    finally { setUploadBusy(false); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sources]);

  const removeSource = (idx) => {
    resetAnalysis();
    setSources((prev) => prev.filter((_, i) => i !== idx));
    setConfigFileIdx(0);
  };
  const updateSource = (idx, patch) =>
    setSources((prev) => prev.map((s, i) => (i === idx ? { ...s, ...patch } : s)));

  // Column names of a source, read from its header row in the raw preview
  // (mirrors backend _normalize_names: blanks → col_N). Used to let the user
  // manually pick each file's time column before combining.
  const sourceColumns = (s) => {
    const row = s?.preview?.rows?.[s?.headerRow ?? 0] || [];
    return row.map((c, i) => (String(c).trim() || `col_${i}`));
  };

  // -------- Sheet change for a source --------
  const onSourceSheet = async (idx, s) => {
    updateSource(idx, { sheet: s });
    try {
      const pv = await api.previewSheet({ id: sources[idx].id, sheet: s });
      updateSource(idx, { sheet: s, preview: pv, headerRow: pv.suggested_header ?? 0, xCol: null });
    } catch (e) { setError(String(e.message || e)); }
  };
  // Header-row / sheet handlers for the currently-configured file.
  const onHeaderPick = (row) => updateSource(configFileIdx, { headerRow: row, xCol: null });
  const onSheet = (s) => onSourceSheet(configFileIdx, s);

  // -------- Resolve the active dataset from the source files --------
  const sourceSig = JSON.stringify(
    sources.map((s) => ({ id: s.id, sheet: s.sheet, headerRow: s.headerRow, label: s.label, xCol: s.xCol || null })));
  useEffect(() => {
    if (sources.length === 0) { setUpload(null); setCombinedId(null); return; }
    if (sources.length === 1) {
      const s = sources[0];
      setCombinedId(null);
      setUploadSheets(s.sheets); setSheet(s.sheet); setHeaderRow(s.headerRow); setPreview(s.preview);
      setUpload({ id: s.id, filename: s.filename });
      autoEnabled.current = s.id;
      autoEmptied.current = s.id + "|" + (s.sheet || "");
      return;
    }
    clearTimeout(combineTimer.current);
    combineTimer.current = setTimeout(async () => {
      setCombineBusy(true); setError(null);
      try {
        const res = await api.combine({
          sources: sources.map((s) => ({
            id: s.id, sheet: s.sheet, header_row: s.headerRow, label: s.label,
            x_col: s.xCol || null,
          })),
        });
        setCombinedId(res.id);
        setUploadSheets([]); setSheet(null); setHeaderRow(0); setPreview(null);
        setUpload({ id: res.id, filename: `Объединено (${sources.length})` });
        autoEnabled.current = res.id;
        autoEmptied.current = null;
      } catch (e) { setError(String(e.message || e)); }
      finally { setCombineBusy(false); }
    }, 300);
    return () => clearTimeout(combineTimer.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sourceSig]);

  // -------- Inspect (columns + stats) on header/sheet change --------
  useEffect(() => {
    if (!upload) return;
    let cancelled = false;
    (async () => {
      setError(null);
      try {
        const res = await api.inspect({ id: upload.id, sheet, header_row: headerRow, edits: editsPayload });
        if (cancelled) return;
        setInspectData(res);
        setStyles((prev) => {
          const next = { ...prev };
          res.columns.forEach((c, i) => { if (!next[c.name]) next[c.name] = defaultStyle(i); });
          return next;
        });
        setOrder((prev) => {
          const names = res.columns.map((c) => c.name);
          const kept = prev.filter((n) => names.includes(n));
          const added = names.filter((n) => !kept.includes(n));
          return [...kept, ...added];
        });
        setXCol((prevX) => {
          const valid = res.columns.some((c) => c.name === prevX);
          return valid ? prevX : res.suggested_x;
        });
        // Auto-hide empty unnamed columns (once per file/sheet, restorable).
        if (autoEmptied.current === upload.id + "|" + (sheet || "")) {
          const empties = res.columns.filter((c) => c.auto_empty).map((c) => c.name);
          if (empties.length) setDropColumns((prev) => [...new Set([...prev, ...empties])]);
          autoEmptied.current = null;
        }
      } catch (e) { if (!cancelled) setError(String(e.message || e)); }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [upload, sheet, headerRow, editsKey]);

  // -------- Auto-enable the first real numeric column (once per file) --------
  useEffect(() => {
    if (!inspectData || !upload || autoEnabled.current !== upload.id) return;
    const anyEnabled = inspectData.columns.some(
      (c) => styles[c.name]?.enabled && !dropColumns.includes(c.name));
    if (anyEnabled) { autoEnabled.current = null; return; }
    const firstNum = inspectData.columns.find(
      (c) => c.is_numeric && !c.is_time && !c.auto_empty
        && c.name !== xCol && !dropColumns.includes(c.name));
    if (firstNum) {
      setStyles((prev) => ({
        ...prev,
        [firstNum.name]: { ...(prev[firstNum.name] || defaultStyle(0)), enabled: true },
      }));
      autoEnabled.current = null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inspectData, dropColumns]);

  // -------- Series fetch (debounced) --------
  useEffect(() => {
    if (!upload || !inspectData || !xCol || enabledCols.length === 0) {
      setSeriesData(null);
      return;
    }
    // Manual mode: don't recompute the chart on settings change — wait for
    // "Пересчитать" (which bumps computeToken).
    if (manualMode && seriesTok.current === computeToken) { setHasPending(true); return; }
    seriesTok.current = computeToken;
    setHasPending(false);
    clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(async () => {
      const reqId = ++seriesReq.current;
      setSeriesBusy(true); setError(null);
      try {
        const res = await api.fetchSeries({
          id: upload.id, sheet, header_row: headerRow, edits: editsPayload,
          x_col: xCol, y_cols: enabledCols,
          resample: { rule: resample.rule || null, agg: resample.agg },
          anomaly, detect_zeros: true, sort_x: sortX,
        });
        if (reqId === seriesReq.current) setSeriesData(res);
      } catch (e) {
        if (reqId === seriesReq.current) setError(String(e.message || e));
      } finally {
        if (reqId === seriesReq.current) setSeriesBusy(false);
      }
    }, 220);
    return () => clearTimeout(debounceTimer.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [upload, sheet, headerRow, xCol, yKey, JSON.stringify(resample), JSON.stringify(anomaly), editsKey, sortX, manualMode, computeToken]);

  // -------- Correlation fetch (only in correlation mode) --------
  useEffect(() => {
    if (viewMode !== "correlation" || !upload || enabledCols.length < 2) {
      if (viewMode === "correlation") setCorr(null);
      return;
    }
    const reqId = ++corrReq.current;
    setCorrBusy(true); setError(null);
    (async () => {
      try {
        const res = await api.fetchCorrelation({
          id: upload.id, sheet, header_row: headerRow, edits: editsPayload, x_col: xCol,
          y_cols: enabledCols, method: corrMethod,
          resample: { rule: resample.rule || null, agg: resample.agg },
        });
        if (reqId !== corrReq.current) return;
        setCorr(res);
        setPairX((p) => (res.columns.includes(p) ? p : res.columns[0]));
        setPairY((p) => (res.columns.includes(p) ? p : res.columns[1]));
        setCorrTarget((p) => (res.columns.includes(p) ? p : res.columns[0]));
      } catch (e) {
        if (reqId === corrReq.current) setError(String(e.message || e));
      } finally {
        if (reqId === corrReq.current) setCorrBusy(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewMode, upload, sheet, headerRow, xCol, yKey, corrMethod, JSON.stringify(resample), editsKey]);

  // -------- Long-blocks fetch (only in blocks mode) --------
  useEffect(() => {
    if (viewMode !== "blocks" || !upload || !inspectData) return;
    const reqId = ++blocksReq.current;
    setBlocksBusy(true); setError(null);
    (async () => {
      try {
        const y = blocksParam === "__any__" ? [] : [blocksParam];
        const res = await api.fetchBlocks({
          id: upload.id, sheet, header_row: headerRow, edits: editsPayload, x_col: xCol,
          y_cols: y, min_length: blocksMinLen, kinds: blocksKinds,
        });
        if (reqId === blocksReq.current) setBlocksData(res);
      } catch (e) {
        if (reqId === blocksReq.current) setError(String(e.message || e));
      } finally {
        if (reqId === blocksReq.current) setBlocksBusy(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewMode, upload, sheet, headerRow, xCol, blocksParam, blocksMinLen, JSON.stringify(blocksKinds), editsKey]);

  // -------- Clamp per-series axis numbers when axisCount is lowered --------
  useEffect(() => {
    setStyles((prev) => {
      let changed = false;
      const next = { ...prev };
      for (const name of Object.keys(next)) {
        const a = next[name]?.axis;
        const num = typeof a === "number" ? a : (a === "y2" ? 2 : 1);
        if (num > axisCount) { next[name] = { ...next[name], axis: axisCount }; changed = true; }
      }
      return changed ? next : prev;
    });
  }, [axisCount]);

  // -------- Spectrum fetch (only in spectrum mode) --------
  useEffect(() => {
    if (viewMode !== "spectrum" || !upload || enabledCols.length === 0) {
      if (viewMode === "spectrum") setSpectrumData(null);
      return;
    }
    const reqId = ++spectrumReq.current;
    setSpectrumBusy(true); setError(null);
    (async () => {
      try {
        const res = await api.fetchSpectrum({
          id: upload.id, sheet, header_row: headerRow, edits: editsPayload, x_col: xCol,
          y_cols: enabledCols, method: spectrumMethod, max_lag: spectrumMaxLag,
        });
        if (reqId === spectrumReq.current) setSpectrumData(res);
      } catch (e) {
        if (reqId === spectrumReq.current) setError(String(e.message || e));
      } finally {
        if (reqId === spectrumReq.current) setSpectrumBusy(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewMode, upload, sheet, headerRow, xCol, yKey, spectrumMethod, spectrumMaxLag, editsKey]);

  // -------- Missing-map fetch (only in missing mode) --------
  useEffect(() => {
    if (viewMode !== "missing" || !upload || !inspectData) return;
    const reqId = ++missingReq.current;
    setMissingBusy(true); setError(null);
    (async () => {
      try {
        const res = await api.fetchMissing({
          id: upload.id, sheet, header_row: headerRow, edits: editsPayload, x_col: xCol,
          buckets: 240, kind: missingKind,
        });
        if (reqId === missingReq.current) setMissingData(res);
      } catch (e) {
        if (reqId === missingReq.current) setError(String(e.message || e));
      } finally {
        if (reqId === missingReq.current) setMissingBusy(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewMode, upload, sheet, headerRow, xCol, missingKind, editsKey]);

  // -------- Table (grid) fetch (only in table mode) --------
  useEffect(() => {
    if (viewMode !== "table" || !upload || !inspectData) return;
    setTableBusy(true); setError(null);
    (async () => {
      try {
        // "combined" → active dataset (with edits); a file index → that raw source.
        const src = tableSource === "combined" ? null : sources[Number(tableSource)];
        const body = src
          ? { id: src.id, sheet: src.sheet, header_row: src.headerRow, edits: {}, x_col: null,
              offset: tablePage * 100, limit: 100 }
          : { id: upload.id, sheet, header_row: headerRow, edits: editsPayload, x_col: xCol,
              offset: tablePage * 100, limit: 100 };
        const res = await api.fetchRows(body);
        setTableData(res);
      } catch (e) { setError(String(e.message || e)); }
      finally { setTableBusy(false); }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewMode, upload, sheet, headerRow, tablePage, tableSource, JSON.stringify(dropColumns), JSON.stringify(renames)]);

  // -------- Outliers fetch (only in outliers mode) --------
  useEffect(() => {
    if (viewMode !== "outliers" || !upload || !inspectData) return;
    const reqId = ++outReq.current;
    setOutBusy(true); setError(null);
    (async () => {
      try {
        const y = outParam === "__any__" ? [] : [outParam];
        const res = await api.fetchOutliers({
          id: upload.id, sheet, header_row: headerRow, edits: editsPayload, x_col: xCol,
          y_cols: y, method: outMethod, params: outParams,
        });
        if (reqId === outReq.current) setOutData(res);
      } catch (e) {
        if (reqId === outReq.current) setError(String(e.message || e));
      } finally {
        if (reqId === outReq.current) setOutBusy(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewMode, upload, sheet, headerRow, xCol, outParam, outMethod, JSON.stringify(outParams), editsKey]);

  // -------- Auto-assign Y axes by scale, splitting into up to `axisCount` groups --------
  const onAutoAxes = () => {
    if (!seriesData) return;
    const scales = seriesData.series.map((s) => {
      const st = s.stats || {};
      const span = (st.max != null && st.min != null) ? Math.abs(st.max - st.min) : null;
      const scale = span && span > 0 ? span
        : (st.max != null ? Math.abs(st.max) : (st.mean != null ? Math.abs(st.mean) : 1));
      return { name: s.name, log: Math.log10(Math.max(scale || 1, 1e-9)) };
    }).sort((a, b) => a.log - b.log);

    // Split into K contiguous groups at the K-1 largest gaps in sorted log-scale.
    const K = Math.min(Math.max(1, axisCount), scales.length);
    const gaps = [];
    for (let i = 1; i < scales.length; i++) gaps.push({ i, g: scales[i].log - scales[i - 1].log });
    const cutSet = new Set(gaps.sort((a, b) => b.g - a.g).slice(0, K - 1).map((x) => x.i));
    const patch = {};
    let grp = 1;
    scales.forEach((s, i) => { if (cutSet.has(i)) grp++; patch[s.name] = grp; });

    setStyles((prev) => {
      const next = { ...prev };
      Object.entries(patch).forEach(([name, axis]) => {
        next[name] = { ...(next[name] || defaultStyle(0)), axis };
      });
      return next;
    });
  };

  // -------- Reorder series (arrows / drag) --------
  const moveCol = (name, dir) => setOrder((prev) => {
    const i = prev.indexOf(name);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= prev.length) return prev;
    const next = [...prev];
    [next[i], next[j]] = [next[j], next[i]];
    return next;
  });
  const reorderCol = (from, to) => setOrder((prev) => {
    if (from === to || from < 0 || to < 0) return prev;
    const next = [...prev];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    return next;
  });

  // -------- Style / toggle handlers --------
  const onToggle = (name) => setStyles((prev) => ({
    ...prev, [name]: { ...(prev[name] || defaultStyle(0)), enabled: !prev[name]?.enabled },
  }));
  // Select / deselect every parameter at once (skips the X column and dropped).
  const onToggleAll = (enable) => setStyles((prev) => {
    const next = { ...prev };
    orderedCols.forEach((name) => {
      if (name === xCol || dropColumns.includes(name)) return;
      next[name] = { ...(prev[name] || defaultStyle(0)), enabled: enable };
    });
    return next;
  });
  const onStyleChange = (name, patch) => setStyles((prev) => ({
    ...prev, [name]: { ...(prev[name] || defaultStyle(0)), ...patch },
  }));

  // -------- Working-copy edits (drop columns / rows) --------
  const toggleDropColumn = (name) => setDropColumns((prev) =>
    prev.includes(name) ? prev.filter((c) => c !== name) : [...prev, name]);
  const toggleDropRow = (idx) => setDropRows((prev) =>
    prev.includes(idx) ? prev.filter((i) => i !== idx) : [...prev, idx]);
  const restoreEdits = () => { setDropColumns([]); setDropRows([]); setRenames({}); setDeletions([]); };

  // Rename a column: key the rename by ORIGINAL name (backend applies it),
  // then migrate all frontend state keyed by the current name.
  const renameColumn = (current, next) => {
    const name = (next || "").trim();
    if (!name || name === current) return;
    const orig = origOf[current] || current;
    setRenames((prev) => ({ ...prev, [orig]: name }));
    setStyles((prev) => {
      if (!prev[current]) return prev;
      const n = { ...prev }; n[name] = n[current]; delete n[current]; return n;
    });
    setOrder((prev) => prev.map((c) => (c === current ? name : c)));
    setDropColumns((prev) => prev.map((c) => (c === current ? name : c)));
    setXCol((prev) => (prev === current ? name : prev));
    if (windDir === current) setWindDir(name);
    if (windMag === current) setWindMag(name);
  };

  // -------- Annotations --------
  const addAnnotation = (a) => setAnnotations((prev) => [...prev, a]);
  const removeAnnotation = (i) => setAnnotations((prev) => prev.filter((_, j) => j !== i));

  // -------- Exports --------
  const onExportData = async (fmt) => {
    if (!upload) return;
    setBusyExport(true);
    try {
      const { blob, filename } = await api.exportData({
        id: upload.id, sheet, header_row: headerRow, edits: editsPayload, x_col: xCol,
        y_cols: enabledCols, resample: { rule: resample.rule || null, agg: resample.agg },
        fmt, sort_x: sortX,
      });
      downloadBlob(blob, filename);
    } catch (e) { setError(String(e.message || e)); }
    finally { setBusyExport(false); }
  };

  const onExportStats = async (fmt) => {
    if (!upload) return;
    setBusyExport(true);
    try {
      const { blob, filename } = await api.exportStats({
        id: upload.id, sheet, header_row: headerRow, edits: editsPayload, x_col: xCol,
        y_cols: enabledCols, resample: { rule: resample.rule || null, agg: resample.agg }, fmt,
      });
      downloadBlob(blob, filename);
    } catch (e) { setError(String(e.message || e)); }
    finally { setBusyExport(false); }
  };

  const onExportCleaned = async (fmt) => {
    if (!upload) return;
    setBusyExport(true);
    try {
      const { blob, filename } = await api.exportData({
        id: upload.id, sheet, header_row: headerRow, edits: editsPayload, x_col: xCol,
        y_cols: [], resample: { rule: null, agg: resample.agg }, fmt, sort_x: sortX,
      });
      downloadBlob(blob, filename);
    } catch (e) { setError(String(e.message || e)); }
    finally { setBusyExport(false); }
  };

  // -------- Deletions (data cleaning) --------
  const isDeleted = (b) => deletions.some(
    (d) => d.column === b.parameter && d.start_idx === b.start_idx && d.end_idx === b.end_idx);
  const toggleDeletion = (b) => setDeletions((prev) => {
    const exists = prev.some(
      (d) => d.column === b.parameter && d.start_idx === b.start_idx && d.end_idx === b.end_idx);
    return exists
      ? prev.filter((d) => !(d.column === b.parameter && d.start_idx === b.start_idx && d.end_idx === b.end_idx))
      : [...prev, { column: b.parameter, start_idx: b.start_idx, end_idx: b.end_idx }];
  });
  // Batch: add many blocks/outliers to deletions at once.
  const addDeletions = (items) => setDeletions((prev) => {
    const key = (d) => `${d.column}|${d.start_idx}|${d.end_idx}`;
    const have = new Set(prev.map(key));
    const add = items
      .map((b) => ({ column: b.parameter, start_idx: b.start_idx, end_idx: b.end_idx }))
      .filter((d) => !have.has(key(d)));
    return add.length ? [...prev, ...add] : prev;
  });

  const onChartImage = (fmt) => {
    const gd = gdRef.current;
    if (!gd) return;
    if (fmt === "html") {
      const fig = { data: gd.data, layout: gd.layout };
      const html = `<!doctype html><html><head><meta charset="utf-8"/>` +
        `<script src="https://cdn.plot.ly/plotly-2.35.2.min.js"></script></head>` +
        `<body style="margin:0"><div id="fig" style="width:100vw;height:100vh"></div>` +
        `<script>Plotly.newPlot('fig',${JSON.stringify(fig.data)},` +
        `${JSON.stringify(fig.layout)},{responsive:true});</script></body></html>`;
      downloadBlob(new Blob([html], { type: "text/html" }), "figure.html");
    } else {
      Plotly.downloadImage(gd, { format: fmt, filename: "figure", scale: 2,
        width: gd._fullLayout?.width, height: gd._fullLayout?.height });
    }
  };

  // -------- Presets (download/upload JSON) --------
  const onSavePreset = () => {
    const preset = {
      _type: "figures-preset", version: 1,
      sheet, header_row: headerRow, x_col: xCol, y_cols: enabledCols,
      styles, order, axis_count: axisCount,
      resample, anomaly, anomaly_style: anomalyStyle, rolling, flags, annotations,
      view_mode: viewMode, dist_type: distType, corr_method: corrMethod,
      drop_columns: dropColumns, drop_rows: dropRows, renames,
      deletions, interpolate: interp, sort_x: sortX,
    };
    downloadBlob(new Blob([JSON.stringify(preset, null, 2)], { type: "application/json" }),
      "figures-preset.json");
  };
  const onLoadPreset = async (file) => {
    try {
      const p = JSON.parse(await file.text());
      if (p._type !== "figures-preset") throw new Error("Не похоже на файл пресета");
      if (typeof p.header_row === "number") setHeaderRow(p.header_row);
      if (p.sheet !== undefined) setSheet(p.sheet);
      if (p.x_col) setXCol(p.x_col);
      if (p.styles) setStyles((prev) => ({ ...prev, ...p.styles }));
      if (Array.isArray(p.order)) setOrder((prev) => {
        const merged = [...p.order.filter((n) => prev.includes(n)),
          ...prev.filter((n) => !p.order.includes(n))];
        return merged.length ? merged : prev;
      });
      if (typeof p.axis_count === "number") setAxisCount(p.axis_count);
      if (p.resample) setResample(p.resample);
      if (p.anomaly) setAnomaly(p.anomaly);
      if (p.anomaly_style) setAnomalyStyle(p.anomaly_style);
      if (p.rolling) setRolling(p.rolling);
      if (p.flags) setFlags(p.flags);
      if (p.view_mode) setViewMode(p.view_mode);
      if (p.dist_type) setDistType(p.dist_type);
      if (p.corr_method) setCorrMethod(p.corr_method);
      if (Array.isArray(p.drop_columns)) setDropColumns(p.drop_columns);
      if (Array.isArray(p.drop_rows)) setDropRows(p.drop_rows);
      if (p.renames && typeof p.renames === "object") setRenames(p.renames);
      if (Array.isArray(p.deletions)) setDeletions(p.deletions);
      if (p.interpolate && typeof p.interpolate === "object") setInterp(p.interpolate);
      if (typeof p.sort_x === "boolean") setSortX(p.sort_x);
      if (Array.isArray(p.annotations)) setAnnotations(p.annotations);
      setError(null);
    } catch (e) { setError("Ошибка пресета: " + String(e.message || e)); }
  };

  return (
    <div className={"app" + (sidebarOpen ? "" : " sidebar-collapsed")}>
      {!sidebarOpen && (
        <button className="expand-btn" title="Развернуть настройки"
          onClick={() => setSidebarOpen(true)}>☰</button>
      )}
      <aside className="sidebar" style={{ "--sb-width": sidebarWidth + "px" }}>
        <div className="sidebar-resize" title="Потяните, чтобы изменить ширину"
          onMouseDown={startSidebarResize} />
        <div className="sidebar-head">
          <div className="brand">
            <div className="logo">◧</div>
            <div><h1>Figures</h1></div>
          </div>
          <button className="collapse-btn" title="Свернуть панель"
            onClick={() => setSidebarOpen(false)}>⟨</button>
        </div>
        <p className="sub">Первичный анализ временных рядов</p>

        {error && <div className="error">{error}</div>}

        {sources.length > 0 && (
          <div className="section">
            <div className="section-title">1 · Файлы данных ({sources.length}/5)</div>
            {sources.map((s, i) => (
              <div key={s.id}
                className={"file-row" + (sources.length > 1 && i === configFileIdx ? " active" : "")}
                onClick={() => sources.length > 1 && setConfigFileIdx(i)}
                title={s.filename}>
                <span className="file-dot" style={{ background: PALETTE[i % PALETTE.length] }} />
                <span className="file-name">{s.filename}</span>
                <button className="trash" title="убрать файл"
                  onClick={(e) => { e.stopPropagation(); removeSource(i); }}>✕</button>
              </div>
            ))}
            {combineBusy && <div className="small muted" style={{ margin: "4px 0" }}><span className="spinner" /> объединение…</div>}
          </div>
        )}

        <Uploader onFile={sources.length === 0 ? onFile : onAddFile} busy={uploadBusy}
          filename={sources.length === 0 ? null : null}
          addMode={sources.length > 0} disabled={sources.length >= 5} />

        {sources.length > 1 && (
          <div className="pill-toggle" style={{ margin: "10px 0 0" }}>
            {sources.map((s, i) => (
              <span key={s.id} className={"pill" + (i === configFileIdx ? " active" : "")}
                onClick={() => setConfigFileIdx(i)} title={s.filename}>{s.label}</span>
            ))}
          </div>
        )}

        {sources.length > 1 && sources[configFileIdx] && (
          <label className="field" style={{ margin: "10px 0 0" }}>
            <span>Столбец времени для «{sources[configFileIdx].label}»</span>
            <select
              value={sources[configFileIdx].xCol || ""}
              onChange={(e) => updateSource(configFileIdx, { xCol: e.target.value || null })}>
              <option value="">Авто (определить самому)</option>
              {sourceColumns(sources[configFileIdx]).map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
            <span className="small muted" style={{ marginTop: 4 }}>
              По этому столбцу файл встаёт на общую ось времени. Если объединение
              даёт сплошь NaN — выберите правильный столбец вручную.
            </span>
          </label>
        )}

        {sources[configFileIdx]?.preview && (
          <HeaderPicker
            preview={sources[configFileIdx].preview}
            headerRow={sources[configFileIdx].headerRow} onPick={onHeaderPick}
            sheets={sources[configFileIdx].sheets} sheet={sources[configFileIdx].sheet} onSheet={onSheet}
            resolved={sources.length === 1 ? inspectData?.resolved : null}
            multi={sources.length > 1}
            dropColumns={dropColumns} dropRows={dropRows} renames={renames}
            onDropColumn={toggleDropColumn} onDropRow={toggleDropRow}
            onRename={renameColumn}
          />
        )}

        {inspectData && (
          <>
            <ColumnConfig
              columns={inspectData.columns} order={order} xCol={xCol} onXCol={setXCol}
              styles={styles} onToggle={onToggle} onToggleAll={onToggleAll} onStyleChange={onStyleChange}
              onAutoAxes={onAutoAxes} axisCount={axisCount} onAxisCount={setAxisCount}
              onMove={moveCol} onReorder={reorderCol}
              alignZero={flags.alignZero} onAlignZero={(v) => setFlags((f) => ({ ...f, alignZero: v }))}
              dropColumns={dropColumns} onDropColumn={toggleDropColumn} onRename={renameColumn}
            />
            <Controls
              resample={resample} onResample={setResample}
              anomaly={anomaly} onAnomaly={setAnomaly}
              anomalyStyle={anomalyStyle} onAnomalyStyle={setAnomalyStyle}
              flags={flags} onFlags={setFlags}
              rolling={rolling} onRolling={setRolling}
              interp={interp} onInterp={setInterp} sortX={sortX} onSortX={setSortX}
              hasTime={hasTime}
            />
          </>
        )}
      </aside>

      <main className="main">
        <div className="main-header">
          <h2>
            {upload ? upload.filename : "Загрузите файл, чтобы начать"}
            {seriesBusy && <>&nbsp;<span className="spinner" /></>}
          </h2>
          {inspectData && (
            <span className="muted small">
              {inspectData.nrows.toLocaleString("ru")} строк · {inspectData.columns.length} колонок
              {enabledCols.length ? ` · выбрано ${enabledCols.length}` : ""}
            </span>
          )}
        </div>

        {!upload && (
          <div className="card empty-state">
            <div className="big">📈</div>
            <div>Загрузите CSV или Excel слева.<br />
              Выберите строку-шапку, колонки, цвета и тип графиков — всё обновится автоматически.</div>
          </div>
        )}

        {inspectData && (
          <>
            <ExportBar
              onExportData={onExportData} onChartImage={onChartImage}
              onSavePreset={onSavePreset} onLoadPreset={onLoadPreset}
              busyExport={busyExport} disabled={!seriesData}
            />

            <div className="inline" style={{ justifyContent: "space-between", marginBottom: 14, gap: 10, flexWrap: "wrap" }}>
              <div className="pill-toggle">
                {VIEW_MODES.map((m) => (
                  <span key={m.value}
                    className={"pill" + (viewMode === m.value ? " active" : "")}
                    onClick={() => setViewMode(m.value)}>{m.label}</span>
                ))}
              </div>
              <div className="btn-row" style={{ alignItems: "center" }}>
                <label className="inline small" title="Не пересчитывать график на каждое изменение — только по кнопке">
                  <input type="checkbox" checked={manualMode}
                    onChange={(e) => { setManualMode(e.target.checked); if (!e.target.checked) onRecompute(); }} />
                  ручной расчёт
                </label>
                {manualMode && (
                  <button className={"small" + (hasPending ? " primary" : "")}
                    onClick={onRecompute} disabled={!hasPending} title="Пересчитать график">
                    ▶ Пересчитать{hasPending ? " •" : ""}
                  </button>
                )}
                <button className="ghost small" onClick={onStop} title="Остановить текущий расчёт (файлы и пресеты останутся)">■ Стоп</button>
                <button className="ghost small" onClick={() => setRefreshKey((k) => k + 1)} title="Перерисовать график">⟳ Обновить</button>
                <button className="ghost small" onClick={onResetAll} title="Остановить всё и удалить файлы"
                  style={{ color: "var(--danger)" }}>🗑 Сбросить всё</button>
              </div>
            </div>

            {viewMode === "timeseries" && (seriesData ? (
              <>
                <div className="card" style={{ marginBottom: 16 }}>
                  <Chart
                    key={`ts-${refreshKey}-${axisSig}`}
                    data={seriesData} styles={styles} flags={flags}
                    anomalyStyle={anomalyStyle} rolling={rolling}
                    annotations={annotations} onAddAnnotation={addAnnotation}
                    onGraphDiv={(gd) => { gdRef.current = gd; }}
                  />
                </div>
                <div className="section">
                  <div className="section-title">Статистика по колонкам</div>
                  <StatsTable data={seriesData} styles={styles} totalRows={inspectData.nrows}
                    onExportStats={onExportStats} busyExport={busyExport} />
                </div>
                <div className="section">
                  <div className="section-title">Ручные отметки</div>
                  <div className="card">
                    <Annotations
                      annotations={annotations}
                      onRemove={removeAnnotation}
                      onClear={() => setAnnotations([])}
                    />
                  </div>
                </div>
              </>
            ) : <EnableHint />)}

            {viewMode === "distribution" && (seriesData ? (
              <>
                <div className="btn-row" style={{ marginBottom: 12, alignItems: "center" }}>
                  <div className="pill-toggle">
                    {DIST_TYPES.map((d) => (
                      <span key={d.value}
                        className={"pill" + (distType === d.value ? " active" : "")}
                        onClick={() => setDistType(d.value)}>{d.label}</span>
                    ))}
                  </div>
                  {distType === "histogram" && (
                    <label className="inline small" title="Число корзин">
                      корзины
                      <input type="number" min="5" max="200" step="5" value={bins}
                        onChange={(e) => setBins(Number(e.target.value))} style={{ width: 70 }} />
                    </label>
                  )}
                </div>
                <div className="card" style={{ marginBottom: 16 }}>
                  <DistributionChart
                    key={`dist-${refreshKey}`}
                    data={seriesData} styles={styles} distType={distType} bins={bins}
                    onGraphDiv={(gd) => { gdRef.current = gd; }}
                  />
                </div>
                <div className="section">
                  <div className="section-title">Статистика по колонкам</div>
                  <StatsTable data={seriesData} styles={styles} totalRows={inspectData.nrows}
                    onExportStats={onExportStats} busyExport={busyExport} />
                </div>
              </>
            ) : <EnableHint />)}

            {viewMode === "correlation" && (
              <>
                <div className="btn-row" style={{ marginBottom: 12, alignItems: "center" }}>
                  <label className="inline small">
                    метод
                    <select value={corrMethod} onChange={(e) => setCorrMethod(e.target.value)}
                      style={{ width: "auto" }}>
                      {CORR_METHODS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
                    </select>
                  </label>
                  {corrBusy && <span className="spinner" />}
                </div>
                <CorrelationView
                  key={`corr-${refreshKey}`}
                  corr={corr} seriesData={seriesData} styles={styles}
                  columns={enabledCols}
                  pairX={pairX} pairY={pairY} onPairX={setPairX} onPairY={setPairY}
                  corrTarget={corrTarget} onCorrTarget={setCorrTarget}
                  onGraphDiv={(gd) => { gdRef.current = gd; }}
                />
              </>
            )}

            {viewMode === "spectrum" && (enabledCols.length ? (
              <>
                <div className="btn-row" style={{ marginBottom: 12, alignItems: "center" }}>
                  <div className="pill-toggle">
                    {SPECTRUM_METHODS.map((m) => (
                      <span key={m.value}
                        className={"pill" + (spectrumMethod === m.value ? " active" : "")}
                        onClick={() => setSpectrumMethod(m.value)}>{m.label}</span>
                    ))}
                  </div>
                  {spectrumMethod === "acf" && (
                    <label className="inline small" title="Максимальный лаг">
                      макс. лаг
                      <input type="number" min="10" step="10" value={spectrumMaxLag}
                        onChange={(e) => setSpectrumMaxLag(Math.max(10, Number(e.target.value)))}
                        style={{ width: 74 }} />
                    </label>
                  )}
                  {spectrumBusy && <span className="spinner" />}
                </div>
                <div className="card">
                  <SpectrumView key={`spec-${refreshKey}`} spectrum={spectrumData} styles={styles}
                    onGraphDiv={(gd) => { gdRef.current = gd; }} />
                </div>
              </>
            ) : <EnableHint />)}

            {viewMode === "windrose" && (enabledCols.length ? (
              <WindRoseView
                key={`wind-${refreshKey}`}
                seriesData={seriesData} styles={styles} columns={enabledCols}
                dirCol={windDir} magCol={windMag}
                onDirCol={setWindDir} onMagCol={setWindMag}
                onGraphDiv={(gd) => { gdRef.current = gd; }}
              />
            ) : <EnableHint />)}

            {viewMode === "missing" && (
              <>
                <div className="btn-row" style={{ marginBottom: 12, alignItems: "center" }}>
                  <div className="pill-toggle">
                    {MISSING_KINDS.map((k) => (
                      <span key={k.value}
                        className={"pill" + (missingKind === k.value ? " active" : "")}
                        onClick={() => setMissingKind(k.value)}>{k.label}</span>
                    ))}
                  </div>
                  {missingBusy && <span className="spinner" />}
                </div>
                <MissingMapView key={`miss-${refreshKey}`} missing={missingData}
                  onGraphDiv={(gd) => { gdRef.current = gd; }} />
              </>
            )}

            {viewMode === "blocks" && (
              <BlocksView
                blocksData={blocksData} busy={blocksBusy}
                minLen={blocksMinLen} onMinLen={setBlocksMinLen}
                kinds={blocksKinds} onKinds={setBlocksKinds}
                param={blocksParam} onParam={setBlocksParam}
                columns={orderedCols.filter((c) => c !== xCol)}
                isDeleted={isDeleted} onToggleDeletion={toggleDeletion} onBatchDelete={addDeletions}
                deletionsCount={deletions.length}
                onExportCleaned={onExportCleaned} busyExport={busyExport}
              />
            )}

            {viewMode === "outliers" && (
              <OutliersView
                outData={outData} busy={outBusy}
                method={outMethod} onMethod={setOutMethod}
                params={outParams} onParams={setOutParams}
                param={outParam} onParam={setOutParam}
                columns={orderedCols.filter((c) => c !== xCol)}
                isDeleted={isDeleted} onToggleDeletion={toggleDeletion} onBatchDelete={addDeletions}
                deletionsCount={deletions.length}
                onExportCleaned={onExportCleaned} busyExport={busyExport}
              />
            )}

            {viewMode === "table" && (
              <>
                {sources.length > 1 && (
                  <div className="pill-toggle" style={{ marginBottom: 12 }}>
                    <span className={"pill" + (tableSource === "combined" ? " active" : "")}
                      onClick={() => { setTableSource("combined"); setTablePage(0); }}>Общая</span>
                    {sources.map((s, i) => (
                      <span key={s.id} className={"pill" + (tableSource === String(i) ? " active" : "")}
                        onClick={() => { setTableSource(String(i)); setTablePage(0); }} title={s.filename}>{s.label}</span>
                    ))}
                  </div>
                )}
                <TableView
                  tableData={tableData} busy={tableBusy}
                  page={tablePage} onPage={setTablePage}
                  dropRows={dropRows}
                  dropColumnsCount={dropColumns.length} dropRowsCount={dropRows.length}
                  onDropColumn={toggleDropColumn} onDropRow={toggleDropRow} onRename={renameColumn}
                  onRestore={restoreEdits}
                  onExportCleaned={onExportCleaned} busyExport={busyExport}
                  readOnly={tableSource !== "combined"}
                />
              </>
            )}
          </>
        )}
      </main>
    </div>
  );
}

function EnableHint() {
  return (
    <div className="card empty-state">
      <div className="big">🎚</div>
      <div>Отметьте хотя бы одну колонку слева (раздел «Ось X и колонки»).</div>
    </div>
  );
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
