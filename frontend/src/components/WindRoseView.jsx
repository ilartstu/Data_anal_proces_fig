import React, { useMemo } from "react";
import createPlotlyComponent from "react-plotly.js/factory";
import Plotly from "plotly.js-dist-min";

const Plot = createPlotlyComponent(Plotly);
const SECTORS = 16;
const SPEED_BINS = 5;
const BIN_COLORS = ["#c7e0ff", "#7aa8f5", "#3b6ef5", "#e0a144", "#e0564d"];

export default function WindRoseView({
  seriesData, styles, columns, dirCol, magCol, onDirCol, onMagCol, onGraphDiv,
}) {
  const { traces, layout, note } = useMemo(() => {
    const dirS = seriesData?.series.find((s) => s.name === dirCol);
    const magS = seriesData?.series.find((s) => s.name === magCol);
    if (!dirS || !magS) return { traces: [], layout: {}, note: "Выберите колонки направления и величины." };

    const dir = dirS.y, mag = magS.y;
    const n = Math.min(dir.length, mag.length);
    const finiteMag = mag.filter((v) => v != null && isFinite(v));
    const maxMag = finiteMag.length ? Math.max(...finiteMag) : 1;
    const minMag = finiteMag.length ? Math.min(...finiteMag, 0) : 0;
    const span = maxMag - minMag || 1;

    const counts = Array.from({ length: SPEED_BINS }, () => new Array(SECTORS).fill(0));
    let total = 0;
    for (let i = 0; i < n; i++) {
      const d = dir[i], m = mag[i];
      if (d == null || m == null || !isFinite(d) || !isFinite(m)) continue;
      const sector = ((Math.round(((d % 360) + 360) % 360 / (360 / SECTORS))) % SECTORS);
      let bin = Math.floor(((m - minMag) / span) * SPEED_BINS);
      if (bin >= SPEED_BINS) bin = SPEED_BINS - 1;
      if (bin < 0) bin = 0;
      counts[bin][sector] += 1;
      total += 1;
    }
    if (!total) return { traces: [], layout: {}, note: "Нет валидных пар (направление, величина)." };

    const theta = Array.from({ length: SECTORS }, (_, s) => s * (360 / SECTORS));
    const traces = counts.map((row, bin) => {
      const lo = (minMag + (span * bin) / SPEED_BINS);
      const hi = (minMag + (span * (bin + 1)) / SPEED_BINS);
      return {
        type: "barpolar", r: row.map((c) => (100 * c) / total), theta,
        name: `${lo.toFixed(1)}–${hi.toFixed(1)}`,
        marker: { color: BIN_COLORS[bin] },
        hovertemplate: `%{theta}°<br>%{r:.1f}%<extra>${lo.toFixed(1)}–${hi.toFixed(1)}</extra>`,
      };
    });

    const layout = {
      margin: { l: 30, r: 30, t: 20, b: 20 },
      height: 560,
      barmode: "stack",
      showlegend: true,
      legend: { title: { text: magCol }, font: { size: 11 } },
      polar: {
        bgcolor: "white",
        radialaxis: { ticksuffix: "%", angle: 90, tickfont: { size: 10 } },
        angularaxis: { direction: "clockwise", rotation: 90,
          tickmode: "array", tickvals: [0, 45, 90, 135, 180, 225, 270, 315],
          ticktext: ["С", "СВ", "В", "ЮВ", "Ю", "ЮЗ", "З", "СЗ"] },
      },
      paper_bgcolor: "white",
      font: { family: "-apple-system, Segoe UI, Roboto, sans-serif", size: 12, color: "#1c2530" },
      uirevision: "windrose",
    };
    return { traces, layout, note: null };
  }, [seriesData, dirCol, magCol, styles]);

  return (
    <div>
      <div className="card" style={{ marginBottom: 14 }}>
        <div className="row" style={{ gap: 12 }}>
          <label className="field" style={{ marginBottom: 0 }}>
            <span>Направление (°)</span>
            <select value={dirCol || ""} onChange={(e) => onDirCol(e.target.value)}>
              <option value="">—</option>
              {columns.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </label>
          <label className="field" style={{ marginBottom: 0 }}>
            <span>Величина (скорость)</span>
            <select value={magCol || ""} onChange={(e) => onMagCol(e.target.value)}>
              <option value="">—</option>
              {columns.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </label>
        </div>
        <div className="small muted" style={{ marginTop: 8 }}>
          Колонки берутся из выбранных слева. Роза показывает, с каких направлений
          дуёт чаще и с какой величиной (цвет — диапазон величины).
        </div>
      </div>
      {note ? (
        <div className="card empty-state"><div className="big">🧭</div><div>{note}</div></div>
      ) : (
        <div className="card">
          <Plot data={traces} layout={layout} style={{ width: "100%" }} useResizeHandler
            onInitialized={(_f, gd) => onGraphDiv?.(gd)} onUpdate={(_f, gd) => onGraphDiv?.(gd)}
            config={{ responsive: true, displaylogo: false,
              toImageButtonOptions: { format: "png", filename: "windrose", scale: 2 } }} />
        </div>
      )}
    </div>
  );
}
