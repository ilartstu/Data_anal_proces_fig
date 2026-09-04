import React, { useMemo } from "react";
import createPlotlyComponent from "react-plotly.js/factory";
import Plotly from "plotly.js-dist-min";

const Plot = createPlotlyComponent(Plotly);

const SCALE = [[0, "#f4f7fb"], [0.0001, "#fde9e7"], [0.5, "#ef8b80"], [1, "#c0392b"]];

export default function MissingMapView({ missing, onGraphDiv }) {
  const { traces, layout } = useMemo(() => {
    if (!missing) return { traces: [], layout: {} };
    const n = missing.columns.length;
    const traces = [{
      type: "heatmap", z: missing.z, x: missing.x, y: missing.columns,
      zmin: 0, zmax: 1, colorscale: SCALE,
      hovertemplate: "%{y}<br>%{x}<br>доля: %{z:.0%}<extra></extra>",
      colorbar: { title: { text: "доля", side: "right" }, thickness: 12, tickformat: ".0%" },
    }];
    const layout = {
      margin: { l: 150, r: 20, t: 10, b: 60 },
      height: Math.max(220, 34 * n + 120),
      xaxis: { type: missing.x_is_time ? "date" : "linear", automargin: true },
      yaxis: { autorange: "reversed", automargin: true },
      paper_bgcolor: "white", plot_bgcolor: "white", uirevision: "missing",
      font: { family: "-apple-system, Segoe UI, Roboto, sans-serif", size: 11, color: "#1c2530" },
    };
    return { traces, layout };
  }, [missing]);

  if (!missing) return null;
  return (
    <div className="card">
      <Plot data={traces} layout={layout} style={{ width: "100%" }} useResizeHandler
        onInitialized={(_f, gd) => onGraphDiv?.(gd)} onUpdate={(_f, gd) => onGraphDiv?.(gd)}
        config={{ responsive: true, displaylogo: false,
          toImageButtonOptions: { format: "png", filename: "missing_map", scale: 2 },
          modeBarButtonsToRemove: ["lasso2d", "select2d"] }} />
      <div className="small muted" style={{ marginTop: 6 }}>
        Каждая строка — колонка, цвет — доля пропусков в интервале времени. Охватывает все колонки файла.
      </div>
    </div>
  );
}
