import React from "react";

function fmt(v) {
  if (v === null || v === undefined) return "—";
  if (typeof v === "number") {
    if (Math.abs(v) >= 1e5 || (Math.abs(v) < 1e-3 && v !== 0)) return v.toExponential(2);
    return Number(v.toFixed(3)).toString();
  }
  return String(v);
}

export default function StatsTable({ data, styles, totalRows, onExportStats, busyExport }) {
  if (!data?.series?.length) return null;
  return (
    <div className="card" style={{ overflowX: "auto" }}>
      <div className="inline" style={{ justifyContent: "space-between", marginBottom: 10, flexWrap: "wrap", gap: 8 }}>
        <span className="small muted">
          Всего строк: <b style={{ color: "var(--text)" }}>{(totalRows ?? 0).toLocaleString("ru")}</b>
          {" · "}колонок: <b style={{ color: "var(--text)" }}>{data.series.length}</b>
        </span>
        {onExportStats && (
          <div className="btn-row">
            <button className="ghost small" onClick={() => onExportStats("csv")} disabled={busyExport}>⬇ Статистика CSV</button>
            <button className="ghost small" onClick={() => onExportStats("xlsx")} disabled={busyExport}>⬇ Статистика Excel</button>
          </div>
        )}
      </div>
      <table className="stats">
        <thead>
          <tr>
            <th>Колонка</th>
            <th>Точек</th>
            <th>NaN</th>
            <th>Нулей</th>
            <th>Аномалий</th>
            <th>min</th>
            <th>max</th>
            <th>среднее</th>
            <th>медиана</th>
            <th>σ</th>
          </tr>
        </thead>
        <tbody>
          {data.series.map((s) => {
            const st = s.stats || {};
            const color = styles[s.name]?.color || "#6b7686";
            return (
              <tr key={s.name}>
                <td><span className="dot" style={{ background: color }} />{s.name}</td>
                <td>{st.n}</td>
                <td style={{ color: st.nan_count ? "var(--danger)" : "inherit" }}>
                  {st.nan_count} {st.nan_count ? `(${st.nan_pct}%)` : ""}
                </td>
                <td style={{ color: st.zero_count ? "var(--warn)" : "inherit" }}>
                  {st.zero_count} {st.zero_count ? `(${st.zero_pct}%)` : ""}
                </td>
                <td style={{ color: s.anomaly_count ? "var(--accent)" : "inherit" }}>
                  {s.anomaly_count || 0}{s.anomaly_truncated ? "+" : ""}
                </td>
                <td>{fmt(st.min)}</td>
                <td>{fmt(st.max)}</td>
                <td>{fmt(st.mean)}</td>
                <td>{fmt(st.median)}</td>
                <td>{fmt(st.std)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
