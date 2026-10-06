import React from "react";

// Short, readable timestamp from an ISO string ("2023-04-01T05:00:00" -> "2023-04-01 05:00").
function fmt(iso) {
  if (!iso) return "—";
  const s = String(iso).replace("T", " ");
  return s.length >= 16 ? s.slice(0, 16) : s;
}

export default function WindowControls({ win, onChange, hasTime, info }) {
  const w = win || {};
  const on = !!w.enabled;
  const unit = hasTime ? (w.unit || "days") : "points";
  const anchor = w.anchor || "end";
  const set = (patch) => onChange({ ...w, ...patch });

  const quick = (count) => set({ enabled: true, unit: "days", count, anchor: "end" });

  return (
    <div className={"window-bar" + (on ? "" : " off")}>
      <label className="inline small wb-toggle" style={{ gap: 6 }} title="Показывать только часть ряда">
        <input type="checkbox" checked={on} onChange={(e) => set({ enabled: e.target.checked })} />
        <span className="wb-title">Временное окно</span>
      </label>

      <label className="inline small">
        последние/первые
        <input type="number" min="1" step="1" style={{ width: 80 }}
          value={w.count ?? 14}
          onChange={(e) => set({ count: Math.max(1, Number(e.target.value) || 1) })} />
      </label>

      {hasTime ? (
        <label className="inline small">
          <select value={unit} onChange={(e) => set({ unit: e.target.value })}>
            <option value="days">дней</option>
            <option value="points">точек</option>
          </select>
        </label>
      ) : (
        <span className="small muted">точек</span>
      )}

      <label className="inline small">
        от
        <select value={anchor} onChange={(e) => set({ anchor: e.target.value })}>
          <option value="end">конца периода</option>
          <option value="start">начала периода</option>
          {hasTime && <option value="date">выбранной даты</option>}
        </select>
      </label>

      {hasTime && anchor === "date" && (
        <label className="inline small">
          дата
          <input type="datetime-local" value={w.date || ""}
            onChange={(e) => set({ date: e.target.value })} />
        </label>
      )}

      {hasTime && (
        <span className="inline wb-quick" style={{ gap: 4 }}>
          <button className="ghost small" onClick={() => quick(7)} title="Последние 7 дней">7д</button>
          <button className="ghost small" onClick={() => quick(14)}>14д</button>
          <button className="ghost small" onClick={() => quick(30)}>30д</button>
        </span>
      )}

      <span className="wb-status">
        {on && info?.applied
          ? `показано: ${(info.rows ?? 0).toLocaleString("ru")} точек${
              info.x_start ? ` · ${fmt(info.x_start)} … ${fmt(info.x_end)}` : ""}`
          : "весь период"}
      </span>
    </div>
  );
}
