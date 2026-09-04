import React, { useMemo } from "react";
import createPlotlyComponent from "react-plotly.js/factory";
import Plotly from "plotly.js-dist-min";

const Plot = createPlotlyComponent(Plotly);

// Acklam's inverse normal CDF approximation.
function invNormCDF(p) {
  if (p <= 0) return -Infinity;
  if (p >= 1) return Infinity;
  const a = [-3.969683028665376e+01, 2.209460984245205e+02, -2.759285104469687e+02,
    1.383577518672690e+02, -3.066479806614716e+01, 2.506628277459239e+00];
  const b = [-5.447609879822406e+01, 1.615858368580409e+02, -1.556989798598866e+02,
    6.680131188771972e+01, -1.328068155288572e+01];
  const c = [-7.784894002430293e-03, -3.223964580411365e-01, -2.400758277161838e+00,
    -2.549732539343734e+00, 4.374664141464968e+00, 2.938163982698783e+00];
  const d = [7.784695709041462e-03, 3.224671290700398e-01, 2.445134137142996e+00,
    3.754408661907416e+00];
  const pl = 0.02425;
  let q, r;
  if (p < pl) {
    q = Math.sqrt(-2 * Math.log(p));
    return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
      ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  }
  if (p <= 1 - pl) {
    q = p - 0.5; r = q * q;
    return (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q /
      (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
  }
  q = Math.sqrt(-2 * Math.log(1 - p));
  return -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
    ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
}

function finiteSorted(arr) {
  return arr.filter((v) => v != null && isFinite(v)).sort((a, b) => a - b);
}

export default function DistributionChart({ data, styles, distType, bins, onGraphDiv }) {
  const { traces, layout } = useMemo(() => {
    let traces = [];

    if (distType === "ecdf") {
      traces = data.series.map((s) => {
        const v = finiteSorted(s.y);
        const n = v.length;
        return {
          x: v, y: v.map((_, i) => (i + 1) / n), name: s.name,
          type: "scatter", mode: "lines", line: { color: styles[s.name]?.color, shape: "hv" },
        };
      });
    } else if (distType === "qq") {
      traces = [];
      data.series.forEach((s) => {
        const v = finiteSorted(s.y);
        const n = v.length;
        if (!n) return;
        const th = v.map((_, i) => invNormCDF((i + 0.5) / n));
        const color = styles[s.name]?.color || "#3b6ef5";
        traces.push({ x: th, y: v, name: s.name, type: n > 6000 ? "scattergl" : "scatter",
          mode: "markers", marker: { color, size: 4, opacity: 0.6 } });
        // Reference line: mean + std * theoretical quantile.
        const mean = v.reduce((a, b) => a + b, 0) / n;
        const sd = Math.sqrt(v.reduce((a, b) => a + (b - mean) ** 2, 0) / n);
        const xmin = th[0], xmax = th[n - 1];
        traces.push({ x: [xmin, xmax], y: [mean + sd * xmin, mean + sd * xmax],
          name: `${s.name} · норм.`, type: "scatter", mode: "lines",
          line: { color, width: 1, dash: "dash" }, showlegend: false, hoverinfo: "skip" });
      });
    } else {
      traces = data.series.map((s) => {
        const color = styles[s.name]?.color || "#3b6ef5";
        if (distType === "box") {
          return { y: s.y, name: s.name, type: "box", boxpoints: "outliers",
            marker: { color }, line: { color } };
        }
        if (distType === "violin") {
          return { y: s.y, name: s.name, type: "violin", box: { visible: true },
            meanline: { visible: true }, marker: { color }, line: { color }, opacity: 0.7 };
        }
        return { x: s.y, name: s.name, type: "histogram", opacity: 0.6,
          marker: { color }, nbinsx: bins || undefined };
      });
    }

    const xTitle = distType === "histogram" ? "Значение"
      : distType === "ecdf" ? "Значение"
        : distType === "qq" ? "Теоретические квантили (норм.)" : "";
    const yTitle = distType === "histogram" ? "Частота"
      : distType === "ecdf" ? "F(x)"
        : distType === "qq" ? "Выборочные квантили" : "Значение";

    const layout = {
      margin: { l: 60, r: 18, t: 10, b: 44 },
      height: 560,
      barmode: "overlay",
      showlegend: true,
      legend: { orientation: "h", y: -0.18, font: { size: 11 } },
      xaxis: { title: { text: xTitle, font: { size: 11 } }, gridcolor: "#eef1f6", zeroline: false },
      yaxis: { title: { text: yTitle, font: { size: 11 } }, gridcolor: "#eef1f6", zeroline: false },
      paper_bgcolor: "white", plot_bgcolor: "white",
      uirevision: distType,
      font: { family: "-apple-system, Segoe UI, Roboto, sans-serif", size: 12, color: "#1c2530" },
    };
    return { traces, layout };
  }, [data, styles, distType, bins]);

  return (
    <Plot
      data={traces} layout={layout} style={{ width: "100%" }} useResizeHandler
      onInitialized={(_f, gd) => onGraphDiv?.(gd)}
      onUpdate={(_f, gd) => onGraphDiv?.(gd)}
      config={{ responsive: true, displaylogo: false,
        toImageButtonOptions: { format: "png", filename: "distribution", scale: 2 },
        modeBarButtonsToRemove: ["lasso2d", "select2d"] }}
    />
  );
}
