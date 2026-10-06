import React, { useMemo } from "react";
import createPlotlyComponent from "react-plotly.js/factory";
import Plotly from "plotly.js-dist-min";

const Plot = createPlotlyComponent(Plotly);

const CORR_SCALE = [
  [0, "#2f5fe0"], [0.25, "#8fb0ff"], [0.5, "#ffffff"],
  [0.75, "#f2a29b"], [1, "#e0564d"],
];

function corrColor(r) {
  if (r == null) return "var(--muted)";
  if (Math.abs(r) < 0.3) return "var(--muted)";
  return r > 0 ? "#e0564d" : "#2f5fe0";
}

function linreg(xs, ys) {
  let n = 0, sx = 0, sy = 0, sxx = 0, sxy = 0;
  for (let i = 0; i < xs.length; i++) {
    const x = xs[i], y = ys[i];
    if (x == null || y == null || !isFinite(x) || !isFinite(y)) continue;
    n++; sx += x; sy += y; sxx += x * x; sxy += x * y;
  }
  if (n < 2) return null;
  const denom = n * sxx - sx * sx;
  if (denom === 0) return null;
  const slope = (n * sxy - sx * sy) / denom;
  const intercept = (sy - slope * sx) / n;
  return { slope, intercept, n };
}

export default function CorrelationView({
  corr, seriesData, styles, pairX, pairY, onPairX, onPairY, columns,
  corrTarget, onCorrTarget, registerChart,
}) {
  // Each Plotly chart registers itself under a label so the export dialog can
  // list them all. No-op fallback keeps the view usable without the registry.
  const reg = (label) => (registerChart ? registerChart(label) : () => {});
  const [pairMode, setPairMode] = React.useState("scatter");
  const [showSplom, setShowSplom] = React.useState(false);

  const targetRows = React.useMemo(() => {
    if (!corr || !corrTarget) return null;
    const ti = corr.columns.indexOf(corrTarget);
    if (ti < 0) return null;
    return corr.columns.map((c, j) => ({
      name: c, r: corr.matrix[ti][j],
      n: corr.counts ? corr.counts[ti][j] : null,
    })).filter((row) => row.name !== corrTarget)
      .sort((a, b) => Math.abs(b.r ?? 0) - Math.abs(a.r ?? 0));
  }, [corr, corrTarget]);
  const heat = useMemo(() => {
    if (!corr) return null;
    const n = corr.columns.length;
    const layout = {
      margin: { l: 140, r: 20, t: 20, b: 120 },
      height: Math.max(300, 62 * n + 150),
      xaxis: { tickangle: -35, side: "top", automargin: true },
      yaxis: { autorange: "reversed", automargin: true },
      paper_bgcolor: "white",
      font: { family: "-apple-system, Segoe UI, Roboto, sans-serif", size: 11, color: "#1c2530" },
      uirevision: "corr",
    };
    const trace = {
      type: "heatmap", z: corr.matrix, x: corr.columns, y: corr.columns,
      zmin: -1, zmax: 1, colorscale: CORR_SCALE,
      text: corr.matrix, texttemplate: "%{z:.2f}",
      textfont: { size: 11 },
      hovertemplate: "%{y} ↔ %{x}<br>r = %{z:.3f}<extra></extra>",
      colorbar: { title: { text: "r", side: "right" }, thickness: 12 },
    };
    return { traces: [trace], layout };
  }, [corr]);

  const scatter = useMemo(() => {
    if (!seriesData || !pairX || !pairY) return null;
    const sx = seriesData.series.find((s) => s.name === pairX);
    const sy = seriesData.series.find((s) => s.name === pairY);
    if (!sx || !sy || sx.x || sy.x) return { unavailable: true };
    const xs = sx.y, ys = sy.y;
    const reg = linreg(xs, ys);
    const traces = pairMode === "density" ? [{
      x: xs, y: ys, type: "histogram2dcontour", name: "плотность",
      colorscale: "Blues", showscale: true, ncontours: 18,
      colorbar: { thickness: 10 },
    }] : [{
      x: xs, y: ys, type: seriesData.n > 6000 ? "scattergl" : "scatter",
      mode: "markers", name: `${pairX} × ${pairY}`,
      marker: { color: "#3b6ef5", size: 4, opacity: 0.5 },
      hovertemplate: `${pairX}=%{x}<br>${pairY}=%{y}<extra></extra>`,
    }];
    if (reg) {
      const finite = xs.filter((v) => v != null && isFinite(v));
      const xmin = Math.min(...finite), xmax = Math.max(...finite);
      traces.push({
        x: [xmin, xmax],
        y: [reg.intercept + reg.slope * xmin, reg.intercept + reg.slope * xmax],
        type: "scatter", mode: "lines", name: "регрессия",
        line: { color: "#e0564d", width: 2, dash: "dash" },
        hoverinfo: "skip",
      });
    }
    const layout = {
      margin: { l: 60, r: 18, t: 10, b: 48 }, height: 460, showlegend: false,
      xaxis: { title: { text: pairX, font: { size: 11 } }, gridcolor: "#eef1f6", zeroline: false },
      yaxis: { title: { text: pairY, font: { size: 11 } }, gridcolor: "#eef1f6", zeroline: false },
      paper_bgcolor: "white", plot_bgcolor: "white", uirevision: "scatter",
      font: { family: "-apple-system, Segoe UI, Roboto, sans-serif", size: 12, color: "#1c2530" },
    };
    return { traces, layout, reg };
  }, [seriesData, pairX, pairY, pairMode]);

  const splom = React.useMemo(() => {
    if (!showSplom || !seriesData) return null;
    const cols = seriesData.series.filter((s) => !s.x);   // skip downsampled
    if (cols.length < 2) return { unavailable: true };
    const dimensions = cols.map((s) => ({ label: s.name, values: s.y }));
    const traces = [{
      type: "splom", dimensions,
      marker: { color: "#3b6ef5", size: 3, opacity: 0.45, line: { width: 0 } },
      diagonal: { visible: true }, showupperhalf: false,
    }];
    const size = Math.max(360, 150 * cols.length);
    const layout = {
      margin: { l: 60, r: 20, t: 20, b: 40 }, height: size,
      dragmode: "select", paper_bgcolor: "white", plot_bgcolor: "white",
      font: { family: "-apple-system, Segoe UI, Roboto, sans-serif", size: 10, color: "#1c2530" },
      uirevision: "splom",
    };
    return { traces, layout };
  }, [showSplom, seriesData]);

  const rValue = useMemo(() => {
    if (!corr || !pairX || !pairY) return null;
    const i = corr.columns.indexOf(pairX), j = corr.columns.indexOf(pairY);
    if (i < 0 || j < 0) return null;
    return corr.matrix[i][j];
  }, [corr, pairX, pairY]);

  if (!corr) {
    return <div className="empty-state"><div className="big">🔗</div>
      <div>Выберите минимум 2 колонки слева, чтобы посчитать корреляцию.</div></div>;
  }

  return (
    <div>
      <div className="section-title">Матрица корреляций ({corr.method})</div>
      <div className="card" style={{ marginBottom: 16 }}>
        <Plot data={heat.traces} layout={heat.layout} style={{ width: "100%" }}
          useResizeHandler onInitialized={(_f, gd) => reg("Матрица корреляций")(gd)}
          onUpdate={(_f, gd) => reg("Матрица корреляций")(gd)}
          config={{ responsive: true, displaylogo: false,
            toImageButtonOptions: { format: "png", filename: "correlation", scale: 2 },
            modeBarButtonsToRemove: ["lasso2d", "select2d", "zoom2d", "pan2d"] }} />
      </div>

      <div className="section-title">Корреляция с целевым параметром</div>
      <div className="card" style={{ marginBottom: 16 }}>
        <label className="field" style={{ maxWidth: 340 }}>
          <span>Целевой параметр</span>
          <select value={corrTarget || ""} onChange={(e) => onCorrTarget(e.target.value)}>
            {corr.columns.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </label>
        {targetRows && (
          <table className="stats" style={{ marginTop: 6 }}>
            <thead>
              <tr><th>Параметр</th><th>r ({corr.method})</th><th>|r|</th><th>Пар точек</th></tr>
            </thead>
            <tbody>
              {targetRows.map((row) => (
                <tr key={row.name}>
                  <td><span className="dot" style={{ background: styles[row.name]?.color || "#6b7686" }} />{row.name}</td>
                  <td style={{ color: corrColor(row.r) }}>{row.r == null ? "—" : row.r.toFixed(3)}</td>
                  <td>{row.r == null ? "—" : Math.abs(row.r).toFixed(3)}</td>
                  <td>{row.n ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="section-title">Зависимость: параметр от параметра</div>
      <div className="card">
        <div className="row" style={{ marginBottom: 10, alignItems: "flex-end" }}>
          <label className="field" style={{ marginBottom: 0 }}>
            <span>Ось X</span>
            <select value={pairX || ""} onChange={(e) => onPairX(e.target.value)}>
              {columns.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </label>
          <label className="field" style={{ marginBottom: 0 }}>
            <span>Ось Y</span>
            <select value={pairY || ""} onChange={(e) => onPairY(e.target.value)}>
              {columns.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </label>
          <div className="pill-toggle" style={{ flex: "0 0 auto", paddingBottom: 4 }}>
            <span className={"pill" + (pairMode === "scatter" ? " active" : "")}
              onClick={() => setPairMode("scatter")}>Точки</span>
            <span className={"pill" + (pairMode === "density" ? " active" : "")}
              onClick={() => setPairMode("density")}>Плотность</span>
          </div>
          <div style={{ flex: "0 0 auto", paddingBottom: 4 }}>
            {rValue != null && (
              <span className="badge" style={{ fontSize: 13, padding: "4px 10px",
                background: "var(--accent-soft)", color: "var(--accent)" }}>
                r = {rValue.toFixed(3)}
              </span>
            )}
          </div>
        </div>
        {scatter?.unavailable ? (
          <div className="small muted">Scatter недоступен для даунсэмплированных данных.</div>
        ) : scatter ? (
          <Plot data={scatter.traces} layout={scatter.layout} style={{ width: "100%" }}
            useResizeHandler
            onInitialized={(_f, gd) => reg("Зависимость X×Y")(gd)}
            onUpdate={(_f, gd) => reg("Зависимость X×Y")(gd)}
            config={{ responsive: true, displaylogo: false,
              modeBarButtonsToRemove: ["lasso2d", "select2d"] }} />
        ) : (
          <div className="small muted">Выберите две колонки.</div>
        )}
      </div>

      <div className="section-title" style={{ marginTop: 16 }}>Матрица рассеяния (SPLOM)</div>
      <div className="card">
        {!showSplom ? (
          <button onClick={() => setShowSplom(true)}>Показать матрицу рассеяния</button>
        ) : splom?.unavailable ? (
          <div className="small muted">Нужно ≥2 колонок без даунсэмплинга.</div>
        ) : splom ? (
          <>
            <div className="btn-row" style={{ marginBottom: 8 }}>
              <button className="ghost small" onClick={() => setShowSplom(false)}>Скрыть</button>
            </div>
            <Plot data={splom.traces} layout={splom.layout} style={{ width: "100%" }}
              useResizeHandler
              onInitialized={(_f, gd) => reg("Матрица рассеяния (SPLOM)")(gd)}
              onUpdate={(_f, gd) => reg("Матрица рассеяния (SPLOM)")(gd)}
              config={{ responsive: true, displaylogo: false }} />
          </>
        ) : null}
      </div>
    </div>
  );
}
