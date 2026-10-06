import React, { useState } from "react";
import { CHART_TYPES, DASH_OPTIONS } from "../constants";

function axisNum(a) { return typeof a === "number" ? a : (a === "y2" ? 2 : 1); }

// "файл · параметр" → показываем файл и параметр на разных строках.
function splitName(name) {
  const i = name.indexOf(" · ");
  if (i > 0) return { file: name.slice(0, i), param: name.slice(i + 3) };
  return { file: null, param: name };
}

function Badges({ c }) {
  if (!c) return null;
  return (
    <div className="col-badges">
      {c.is_time && <span className="badge time">время</span>}
      {c.is_numeric && !c.is_time && <span className="badge num">число</span>}
      {c.nan_count > 0 && <span className="badge nan">NaN {c.nan_pct}%</span>}
      {c.zero_count > 0 && <span className="badge zero">0 · {c.zero_pct}%</span>}
    </div>
  );
}

export default function ColumnConfig({
  columns, order, xCol, onXCol, styles, onToggle, onToggleAll, onStyleChange,
  onAutoAxes, axisCount, onAxisCount, onMove, onReorder,
  alignZero, onAlignZero, dropColumns, onDropColumn, onRename,
}) {
  const [dragIdx, setDragIdx] = useState(null);
  const [overIdx, setOverIdx] = useState(null);
  const [editing, setEditing] = useState(null);   // column name being renamed
  if (!columns) return null;
  const dropped = new Set(dropColumns || []);
  const byName = Object.fromEntries(columns.map((c) => [c.name, c]));
  const list = order.filter((n) => byName[n] && n !== xCol);
  const enabledCount = list.filter((n) => styles[n]?.enabled).length;
  const toggleable = list.filter((n) => !dropped.has(n));
  const allOn = toggleable.length > 0 && toggleable.every((n) => styles[n]?.enabled);
  const someOn = toggleable.some((n) => styles[n]?.enabled);
  const axisOptions = Array.from({ length: Math.max(1, axisCount) }, (_, i) => i + 1);

  return (
    <div className="section">
      <div className="section-title">3 · Ось X и колонки</div>

      <label className="field">
        <span>Ось X</span>
        <select value={xCol || ""} onChange={(e) => onXCol(e.target.value)}>
          {columns.map((c) => (
            <option key={c.name} value={c.name}>{c.name}{c.is_time ? "  ⏱" : ""}</option>
          ))}
        </select>
      </label>

      <div className="inline" style={{ justifyContent: "space-between", margin: "4px 0 8px", flexWrap: "wrap", gap: 6 }}>
        <label className="inline small" style={{ gap: 6, cursor: "pointer" }}
          title={allOn ? "Снять все" : "Выделить все"}>
          <input type="checkbox"
            ref={(el) => { if (el) el.indeterminate = someOn && !allOn; }}
            checked={allOn} disabled={toggleable.length === 0}
            onChange={(e) => onToggleAll && onToggleAll(e.target.checked)} />
          <span className="small muted">все колонки</span>
        </label>
        <div className="inline" style={{ gap: 8 }}>
          <label className="inline small" title="Число осей Y">
            осей
            <input type="number" min="1" max="6" step="1" value={axisCount}
              onChange={(e) => onAxisCount(Math.min(6, Math.max(1, Number(e.target.value))))}
              style={{ width: 48 }} />
          </label>
          {enabledCount >= 2 && (
            <button className="ghost small" onClick={onAutoAxes} title="Разбить ряды по масштабу на оси">
              🎚 Авто-оси
            </button>
          )}
        </div>
      </div>
      <div className="small muted" style={{ margin: "-4px 0 8px" }}>
        Перетащите / ▲▼ — порядок наложения
      </div>

      {axisCount > 1 && (
        <label className="inline small" style={{ marginBottom: 8 }}>
          <input type="checkbox" checked={!!alignZero}
            onChange={(e) => onAlignZero(e.target.checked)} />
          совмещать ноль всех осей Y
        </label>
      )}

      {list.map((name, idx) => {
        const c = byName[name];
        const st = styles[name] || {};
        const on = !!st.enabled;
        const isDropped = dropped.has(name);
        return (
          <div key={name}
            className={"col-row"
              + (on && !isDropped ? " enabled" : "")
              + (isDropped ? " col-dropped" : "")
              + (dragIdx === idx ? " dragging" : "")
              + (overIdx === idx && dragIdx !== null && dragIdx !== idx
                ? (dragIdx > idx ? " drop-before" : " drop-after") : "")}
            draggable={!isDropped && editing !== name}
            onDragStart={() => setDragIdx(idx)}
            onDragOver={(e) => { e.preventDefault(); if (overIdx !== idx) setOverIdx(idx); }}
            onDrop={() => { onReorder(dragIdx, idx); setDragIdx(null); setOverIdx(null); }}
            onDragEnd={() => { setDragIdx(null); setOverIdx(null); }}
          >
            <div className="col-row-top">
              <span className="drag-handle" title="Перетащить" style={isDropped ? { visibility: "hidden" } : undefined}>⋮⋮</span>
              <div className="arrows" style={isDropped ? { visibility: "hidden" } : undefined}>
                <button className="arrow" title="Выше (на передний план)" onClick={() => onMove(name, -1)} disabled={idx === 0}>▲</button>
                <button className="arrow" title="Ниже" onClick={() => onMove(name, 1)} disabled={idx === list.length - 1}>▼</button>
              </div>
              <input type="checkbox" checked={on && !isDropped} disabled={isDropped} onChange={() => onToggle(name)} />
              {on && !isDropped && (
                <input type="color" value={st.color || "#3b6ef5"}
                  onChange={(e) => onStyleChange(name, { color: e.target.value })} title="Цвет" />
              )}
              {editing === name ? (
                <input className="rename-input" autoFocus defaultValue={name}
                  onClick={(e) => e.stopPropagation()}
                  onBlur={(e) => { onRename(name, e.target.value); setEditing(null); }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") { onRename(name, e.target.value); setEditing(null); }
                    if (e.key === "Escape") setEditing(null);
                  }} />
              ) : (() => {
                const sp = splitName(name);
                return (
                  <span className="col-name" title={`${name} — двойной клик, чтобы переименовать`}
                    style={isDropped ? { textDecoration: "line-through", color: "var(--muted)" } : undefined}
                    onDoubleClick={() => !isDropped && setEditing(name)}>
                    {sp.file && <span className="col-file-tag">{sp.file}</span>}
                    <span className="col-param-text">{sp.param}</span>
                  </span>
                );
              })()}
              <button className="trash" title={isDropped ? "вернуть колонку" : "удалить колонку"}
                onClick={() => onDropColumn(name)}
                style={isDropped ? { color: "var(--accent)" } : undefined}>
                {isDropped ? "↩" : "🗑"}
              </button>
            </div>
            <Badges c={c} />

            {on && !isDropped && (
              <div className="style-controls" style={{ width: "100%", marginTop: 6 }}>
                <select value={st.type || "line"} onChange={(e) => onStyleChange(name, { type: e.target.value })}
                  style={{ width: "auto", flex: "1 1 110px" }}>
                  {CHART_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
                <select value={st.dash || "solid"} onChange={(e) => onStyleChange(name, { dash: e.target.value })}
                  style={{ width: "auto", flex: "1 1 100px" }}>
                  {DASH_OPTIONS.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
                </select>
                <label className="inline small" title="Номер оси Y">
                  ось
                  <select value={axisNum(st.axis)} onChange={(e) => onStyleChange(name, { axis: Number(e.target.value) })}
                    style={{ width: "auto" }}>
                    {axisOptions.map((a) => <option key={a} value={a}>{a}</option>)}
                  </select>
                </label>
                <label className="inline small" title="Толщина линии">
                  тлщ
                  <input type="number" min="0.5" max="6" step="0.5" value={st.width ?? 1.6}
                    onChange={(e) => onStyleChange(name, { width: Number(e.target.value) })} style={{ width: 52 }} />
                </label>
                <label className="inline small" title="Прозрачность">
                  α
                  <input type="number" min="0.1" max="1" step="0.1" value={st.opacity ?? 1}
                    onChange={(e) => onStyleChange(name, { opacity: Number(e.target.value) })} style={{ width: 52 }} />
                </label>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
