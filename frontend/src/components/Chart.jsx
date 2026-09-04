import React, { useMemo } from "react";
import createPlotlyComponent from "react-plotly.js/factory";
import Plotly from "plotly.js-dist-min";

const Plot = createPlotlyComponent(Plotly);

const GL_THRESHOLD = 6000;
const MAX_SHAPES = 800;

function modeFor(type) {
  switch (type) {
    case "step": return { plotType: "scatter", mode: "lines", lineShape: "hv" };
    case "markers": return { plotType: "scatter", mode: "markers" };
    case "line+markers": return { plotType: "scatter", mode: "lines+markers" };
    case "area": return { plotType: "scatter", mode: "lines", fill: "tozeroy" };
    case "bar": return { plotType: "bar", mode: undefined };
    default: return { plotType: "scatter", mode: "lines" };
  }
}

function hexToRgba(hex, a) {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex || "");
  if (!m) return hex;
  return `rgba(${parseInt(m[1], 16)},${parseInt(m[2], 16)},${parseInt(m[3], 16)},${a})`;
}

function medianDx(xArr, isTime) {
  if (!xArr || xArr.length < 2) return isTime ? 3600000 : 1;
  const nums = isTime ? xArr.map((v) => (v == null ? NaN : new Date(v).getTime()))
    : xArr.map(Number);
  const diffs = [];
  for (let i = 1; i < nums.length && diffs.length < 3000; i++) {
    const d = nums[i] - nums[i - 1];
    if (isFinite(d) && d > 0) diffs.push(d);
  }
  if (!diffs.length) return isTime ? 3600000 : 1;
  diffs.sort((a, b) => a - b);
  return diffs[Math.floor(diffs.length / 2)];
}

function anomalyMarker(mode, color, size) {
  const s = size || 5;
  switch (mode) {
    case "bold-dot": return { color, size: Math.max(s * 2, 10), symbol: "circle" };
    case "open-circle": return { color, size: Math.max(s * 1.8, 9), symbol: "circle-open", line: { width: 2, color } };
    default: return { color, size: s, symbol: "circle" };  // dot
  }
}

function axisNum(a) { return typeof a === "number" ? a : (a === "y2" ? 2 : 1); }

// Centered rolling mean & std, ignoring NaN within each window.
function rollingMeanStd(y, w) {
  const n = y.length, half = Math.floor(w / 2);
  const mean = new Array(n).fill(null), std = new Array(n).fill(null);
  for (let i = 0; i < n; i++) {
    let sum = 0, sum2 = 0, cnt = 0;
    for (let j = Math.max(0, i - half); j <= Math.min(n - 1, i + half); j++) {
      const v = y[j];
      if (v == null || !isFinite(v)) continue;
      sum += v; sum2 += v * v; cnt++;
    }
    if (cnt >= 2) {
      const m = sum / cnt;
      mean[i] = m;
      std[i] = Math.sqrt(Math.max(0, sum2 / cnt - m * m));
    }
  }
  return { mean, std };
}

// Build up to N overlaying Y axes, positioned left/right by axis-number parity,
// with the plot's x-domain shrunk to make room for the extra axes.
function buildAxes(usedAxes, namesByAxis, colorByAxis) {
  const step = 0.07;
  const left = usedAxes.filter((n) => n % 2 === 1);
  const right = usedAxes.filter((n) => n % 2 === 0);
  const L = +(step * Math.max(0, left.length - 1)).toFixed(4);
  const R = +(1 - step * Math.max(0, right.length - 1)).toFixed(4);
  const refFor = {};
  const layoutAxes = {};
  usedAxes.forEach((n, i) => {
    const ref = i === 0 ? "y" : `y${i + 1}`;
    const key = i === 0 ? "yaxis" : `yaxis${i + 1}`;
    refFor[n] = ref;
    const side = n % 2 === 1 ? "left" : "right";
    const rank = side === "left" ? left.indexOf(n) : right.indexOf(n);
    const pos = side === "left"
      ? Math.max(0, +(L - step * rank).toFixed(4))
      : Math.min(1, +(R + step * rank).toFixed(4));
    const names = namesByAxis[n] || [];
    const col = names.length === 1 ? colorByAxis[names[0]] : "#6b7686";
    const cfg = {
      side, anchor: "free", position: pos,
      gridcolor: i === 0 ? "#eef1f6" : "transparent",
      zeroline: i === 0, zerolinecolor: "#d7dce6",
      title: { text: names.join(", "), font: { size: 11, color: col } },
      tickfont: { color: col },
    };
    if (i > 0) cfg.overlaying = "y";
    layoutAxes[key] = cfg;
  });
  return { refFor, layoutAxes, xDomain: [L, R], leftCount: left.length, rightCount: right.length };
}

// Compute per-axis ranges so that y=0 sits at the same height on every axis.
function alignedZeroRanges(usedAxes, namesByAxis, statsByName) {
  const info = {};
  for (const n of usedAxes) {
    let dmin = Infinity, dmax = -Infinity;
    for (const name of namesByAxis[n] || []) {
      const st = statsByName[name] || {};
      if (st.min != null) dmin = Math.min(dmin, st.min);
      if (st.max != null) dmax = Math.max(dmax, st.max);
    }
    if (!isFinite(dmin) || !isFinite(dmax)) { info[n] = null; continue; }
    const pad = (dmax - dmin) * 0.05 || Math.abs(dmax || 1) * 0.05 || 1;
    info[n] = { dmin: dmin - pad, dmax: dmax + pad };
  }
  let f = 0;
  for (const n of usedAxes) {
    const r = info[n]; if (!r) continue;
    const P = Math.max(0, r.dmax), N = Math.max(0, -r.dmin);
    if (P + N > 0) f = Math.max(f, N / (P + N));
  }
  f = Math.min(Math.max(f, 0), 0.95);
  const ranges = {};
  for (const n of usedAxes) {
    const r = info[n]; if (!r) { ranges[n] = null; continue; }
    if (f <= 0) { ranges[n] = [Math.min(0, r.dmin), r.dmax]; continue; }
    const P = Math.max(0, r.dmax), N = Math.max(0, -r.dmin);
    const span = Math.max(P / (1 - f), N / f);
    ranges[n] = [-f * span, (1 - f) * span];
  }
  return ranges;
}

export default function Chart({ data, styles, flags, anomalyStyle, rolling, annotations, onAddAnnotation, onGraphDiv }) {
  const { traces, layout } = useMemo(() => {
    const sharedX = data.x;
    const big = data.n > GL_THRESHOLD;
    const aStyle = anomalyStyle || { mode: "dot", color: "#111111", size: 5 };
    const traces = [];
    const shapes = [];
    const dx = medianDx(sharedX, data.x_is_time);

    // Group series by Y-axis number and build the dynamic axes.
    const namesByAxis = {};
    const colorByAxis = {};
    data.series.forEach((s) => {
      const n = axisNum(styles[s.name]?.axis || 1);
      (namesByAxis[n] = namesByAxis[n] || []).push(s.name);
      colorByAxis[s.name] = styles[s.name]?.color;
    });
    const usedAxes = [...new Set(data.series.map((s) => axisNum(styles[s.name]?.axis || 1)))]
      .sort((a, b) => a - b);
    const { refFor, layoutAxes, xDomain, leftCount, rightCount } =
      buildAxes(usedAxes, namesByAxis, colorByAxis);

    // Align y=0 across axes (fixes the "misaligned zero" look on multi-axis plots).
    if (flags.alignZero && usedAxes.length > 1) {
      const statsByName = {};
      data.series.forEach((s) => { statsByName[s.name] = s.stats || {}; });
      const ranges = alignedZeroRanges(usedAxes, namesByAxis, statsByName);
      usedAxes.forEach((n, i) => {
        const key = i === 0 ? "yaxis" : `yaxis${i + 1}`;
        if (ranges[n]) { layoutAxes[key].range = ranges[n]; layoutAxes[key].autorange = false; }
      });
    }

    // Draw in reverse list order so the TOP of the sidebar list ends up on top.
    for (const s of [...data.series].reverse()) {
      const st = styles[s.name] || {};
      const x = s.x || sharedX;
      const { plotType, mode, fill, lineShape } = modeFor(st.type);
      const useGl = big && plotType === "scatter" && !fill;
      const yref = refFor[axisNum(st.axis || 1)] || "y";

      traces.push({
        x, y: s.y, name: s.name,
        type: useGl ? "scattergl" : plotType,
        mode, fill,
        yaxis: yref,
        opacity: st.opacity ?? 1,
        line: { color: st.color, width: st.width ?? 1.6, dash: st.dash || "solid", shape: lineShape || "linear" },
        marker: { color: st.color, size: st.type === "markers" ? 5 : 4 },
        connectgaps: false,
        hovertemplate: `<b>${s.name}</b><br>%{x}<br>%{y}<extra></extra>`,
      });

      // Anomalies — rendered per the chosen style.
      if (s.anomalies && s.anomalies.length) {
        if (aStyle.mode === "background") {
          const hw = dx / 2;
          for (const a of s.anomalies) {
            const [x0, x1] = xBand(a.x, hw, data.x_is_time);
            shapes.push(band(x0, x1, aStyle.color, 0.22));
          }
        } else {
          traces.push({
            x: s.anomalies.map((a) => a.x),
            y: s.anomalies.map((a) => a.y),
            name: `${s.name} · аномалии (${s.anomaly_count})`,
            type: "scattergl", mode: "markers", yaxis: yref,
            marker: anomalyMarker(aStyle.mode, aStyle.color, aStyle.size),
            hovertemplate: `⚠ ${s.name}<br>%{x}<br>%{y}<extra>аномалия</extra>`,
          });
        }
      }

      // Rolling mean ± σ overlay.
      if (rolling?.enabled && (rolling.window || 0) > 1) {
        const { mean, std } = rollingMeanStd(s.y, rolling.window);
        if (rolling.band) {
          const upper = mean.map((m, i) => (m == null || std[i] == null) ? null : m + std[i]);
          const lower = mean.map((m, i) => (m == null || std[i] == null) ? null : m - std[i]);
          traces.push({ x, y: upper, type: "scatter", mode: "lines", yaxis: yref,
            line: { width: 0 }, showlegend: false, hoverinfo: "skip", connectgaps: false });
          traces.push({ x, y: lower, type: "scatter", mode: "lines", yaxis: yref,
            line: { width: 0 }, fill: "tonexty", fillcolor: hexToRgba(st.color, 0.15),
            showlegend: false, hoverinfo: "skip", connectgaps: false });
        }
        traces.push({
          x, y: mean, name: `${s.name} · скольз.${rolling.window}`,
          type: "scatter", mode: "lines", yaxis: yref, connectgaps: false,
          line: { color: st.color, width: 2, dash: "dot" },
          hovertemplate: `${s.name} скольз.<br>%{x}<br>%{y}<extra></extra>`,
        });
      }

      if (flags.showNan) {
        for (const [x0, x1] of s.nan_regions || []) shapes.push(band(x0, x1, "#e0564d", 0.13));
      }
      if (flags.detectZeros) {
        for (const [x0, x1] of s.zero_regions || []) shapes.push(band(x0, x1, "#e0a144", 0.13));
      }
    }

    const truncatedShapes = shapes.length > MAX_SHAPES;
    const finalShapes = truncatedShapes ? shapes.slice(0, MAX_SHAPES) : shapes;

    // Manual marks as lightweight layout annotations (arrow + label).
    const layoutAnnotations = flags.showAnnotations ? annotations.map((a) => ({
      x: a.x, y: a.y, yref: a.axis || "y",
      text: a.text || "метка", showarrow: true, arrowhead: 3, arrowsize: 1,
      ax: 0, ay: -34, bgcolor: "rgba(138,92,246,0.12)", bordercolor: "#8a5cf6",
      borderwidth: 1, borderpad: 3, font: { color: "#5b3bbf", size: 11 },
    })) : [];

    const layout = {
      margin: { l: leftCount > 0 ? 58 : 40, r: rightCount > 0 ? 58 : 18, t: 10, b: 44 },
      height: 560,
      hovermode: "x unified",
      dragmode: "zoom",
      showlegend: true,
      legend: { orientation: "h", y: -0.18, font: { size: 11 }, traceorder: "reversed" },
      xaxis: {
        type: data.x_is_time ? "date" : "linear",
        domain: xDomain,
        title: { text: data.x_col || "", font: { size: 11 } },
        gridcolor: "#eef1f6", zeroline: false, rangeslider: { visible: false },
      },
      ...layoutAxes,
      shapes: finalShapes,
      annotations: layoutAnnotations,
      paper_bgcolor: "white", plot_bgcolor: "white",
      uirevision: (data.x_col || "") + "|" + data.series.map((s) => s.name).join(","),
      font: { family: "-apple-system, Segoe UI, Roboto, sans-serif", size: 12, color: "#1c2530" },
    };
    layout._truncatedShapes = truncatedShapes;
    return { traces, layout };
  }, [data, styles, flags, anomalyStyle, rolling, annotations]);

  return (
    <div>
      {layout._truncatedShapes && (
        <div className="small muted" style={{ marginBottom: 6 }}>
          Показаны не все участки подсветки (слишком много). Уменьшите диапазон или включите ресемплинг.
        </div>
      )}
      <Plot
        data={traces}
        layout={layout}
        style={{ width: "100%" }}
        useResizeHandler
        onInitialized={(_fig, gd) => onGraphDiv?.(gd)}
        onUpdate={(_fig, gd) => onGraphDiv?.(gd)}
        onClick={(e) => {
          if (!onAddAnnotation || !e?.points?.length) return;
          const p = e.points[0];
          const text = window.prompt("Подпись отметки:", "метка");
          if (text === null) return;
          onAddAnnotation({ x: p.x, y: p.y, text, axis: p.data.yaxis || "y", col: p.data.name });
        }}
        config={{
          responsive: true,
          displaylogo: false,
          scrollZoom: true,
          toImageButtonOptions: { format: "png", filename: "figure", scale: 2 },
          modeBarButtonsToRemove: ["lasso2d", "select2d"],
        }}
      />
    </div>
  );
}

function band(x0, x1, color, alpha) {
  return {
    type: "rect", xref: "x", yref: "paper", x0, x1, y0: 0, y1: 1,
    fillcolor: hexToRgba(color, alpha), line: { width: 0 }, layer: "below",
  };
}

function xBand(xv, hw, isTime) {
  if (isTime) {
    const t = new Date(xv).getTime();
    return [new Date(t - hw).toISOString(), new Date(t + hw).toISOString()];
  }
  return [Number(xv) - hw, Number(xv) + hw];
}
