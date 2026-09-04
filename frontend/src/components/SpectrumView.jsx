import React, { useMemo } from "react";
import createPlotlyComponent from "react-plotly.js/factory";
import Plotly from "plotly.js-dist-min";

const Plot = createPlotlyComponent(Plotly);

export default function SpectrumView({ spectrum, styles, onGraphDiv }) {
  const { traces, layout, isFft } = useMemo(() => {
    if (!spectrum) return { traces: [], layout: {}, isFft: true };
    const isFft = spectrum.method === "fft";
    const hasHours = isFft && spectrum.dt_hours;

    const traces = spectrum.series.map((s) => {
      const color = styles[s.name]?.color || "#3b6ef5";
      if (isFft) {
        const x = hasHours ? s.period_hours : s.period_samples;
        return { x, y: s.power, name: s.name, type: "scatter", mode: "lines",
          line: { color, width: 1.4 },
          hovertemplate: `${s.name}<br>период %{x:.2f}<br>мощность %{y:.3g}<extra></extra>` };
      }
      return { x: s.lags, y: s.acf, name: s.name, type: "scatter", mode: "lines",
        line: { color, width: 1.6 },
        hovertemplate: `${s.name}<br>лаг %{x}<br>ACF %{y:.3f}<extra></extra>` };
    });

    const layout = {
      margin: { l: 60, r: 18, t: 10, b: 46 },
      height: 520,
      showlegend: true,
      legend: { orientation: "h", y: -0.2, font: { size: 11 } },
      xaxis: isFft
        ? { type: "log", title: { text: hasHours ? "Период (часы)" : "Период (отсчёты)", font: { size: 11 } }, gridcolor: "#eef1f6" }
        : { title: { text: "Лаг (отсчёты)", font: { size: 11 } }, gridcolor: "#eef1f6", zeroline: false },
      yaxis: isFft
        ? { title: { text: "Спектр. мощность", font: { size: 11 } }, gridcolor: "#eef1f6", zeroline: false }
        : { title: { text: "Автокорреляция", font: { size: 11 } }, gridcolor: "#eef1f6", zeroline: true, zerolinecolor: "#d7dce6", range: [-1, 1] },
      paper_bgcolor: "white", plot_bgcolor: "white", uirevision: spectrum.method,
      font: { family: "-apple-system, Segoe UI, Roboto, sans-serif", size: 12, color: "#1c2530" },
    };
    return { traces, layout, isFft };
  }, [spectrum, styles]);

  if (!spectrum) return null;
  return (
    <div>
      <Plot data={traces} layout={layout} style={{ width: "100%" }} useResizeHandler
        onInitialized={(_f, gd) => onGraphDiv?.(gd)} onUpdate={(_f, gd) => onGraphDiv?.(gd)}
        config={{ responsive: true, displaylogo: false,
          toImageButtonOptions: { format: "png", filename: "spectrum", scale: 2 },
          modeBarButtonsToRemove: ["lasso2d", "select2d"] }} />
      <div className="small muted" style={{ marginTop: 6 }}>
        {isFft
          ? "Пики — доминирующие периоды (например, 24 ч — суточный цикл, 8760 ч — годовой)."
          : "Периодические пики автокорреляции указывают на сезонность ряда."}
      </div>
    </div>
  );
}
