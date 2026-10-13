import React from "react";
import { useT, useNum } from "../i18n";

// Short, readable timestamp from an ISO string ("2023-04-01T05:00:00" -> "2023-04-01 05:00").
function fmt(iso) {
  if (!iso) return "—";
  const s = String(iso).replace("T", " ");
  return s.length >= 16 ? s.slice(0, 16) : s;
}

export default function WindowControls({ win, onChange, hasTime, info }) {
  const t = useT();
  const nf = useNum();
  const w = win || {};
  const on = !!w.enabled;
  const unit = hasTime ? (w.unit || "days") : "points";
  const anchor = w.anchor || "end";
  const set = (patch) => onChange({ ...w, ...patch });

  const quick = (count) => set({ enabled: true, unit: "days", count, anchor: "end" });

  return (
    <div className={"window-bar" + (on ? "" : " off")}>
      <label className="inline small wb-toggle" style={{ gap: 6 }} title={t("Показывать только часть ряда")}>
        <input type="checkbox" checked={on} onChange={(e) => set({ enabled: e.target.checked })} />
        <span className="wb-title">{t("Временное окно")}</span>
      </label>

      <label className="inline small">
        {t("последние/первые")}
        <input type="number" min="1" step="1" style={{ width: 80 }}
          value={w.count ?? 14}
          onChange={(e) => set({ count: Math.max(1, Number(e.target.value) || 1) })} />
      </label>

      {hasTime ? (
        <label className="inline small">
          <select value={unit} onChange={(e) => set({ unit: e.target.value })}>
            <option value="days">{t("дней")}</option>
            <option value="points">{t("точек")}</option>
          </select>
        </label>
      ) : (
        <span className="small muted">{t("точек")}</span>
      )}

      <label className="inline small">
        {t("от")}
        <select value={anchor} onChange={(e) => set({ anchor: e.target.value })}>
          <option value="end">{t("конца периода")}</option>
          <option value="start">{t("начала периода")}</option>
          {hasTime && <option value="date">{t("выбранной даты")}</option>}
        </select>
      </label>

      {hasTime && anchor === "date" && (
        <label className="inline small">
          {t("дата")}
          <input type="datetime-local" value={w.date || ""}
            onChange={(e) => set({ date: e.target.value })} />
        </label>
      )}

      {hasTime && (
        <span className="inline wb-quick" style={{ gap: 4 }}>
          <button className="ghost small" onClick={() => quick(7)} title={t("Последние 7 дней")}>{t("7д")}</button>
          <button className="ghost small" onClick={() => quick(14)}>{t("14д")}</button>
          <button className="ghost small" onClick={() => quick(30)}>{t("30д")}</button>
        </span>
      )}

      <span className="wb-status">
        {on && info?.applied
          ? t("показано: {rows} точек{range}", {
              rows: nf(info.rows ?? 0),
              range: info.x_start ? ` · ${fmt(info.x_start)} … ${fmt(info.x_end)}` : "",
            })
          : t("весь период")}
      </span>
    </div>
  );
}
