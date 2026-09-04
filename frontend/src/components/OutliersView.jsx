import React, { useState } from "react";
import { ANOMALY_METHODS, defaultAnomalyParams } from "../constants";

const keyOf = (o) => `${o.parameter}|${o.idx}`;

function ParamInput({ method, params, onParams }) {
  const p = params || {};
  const set = (patch) => onParams({ ...p, ...patch });
  if (method === "iqr") {
    return <label className="inline small">множитель IQR
      <input type="number" step="0.1" value={p.factor ?? 1.5}
        onChange={(e) => set({ factor: Number(e.target.value) })} style={{ width: 64 }} /></label>;
  }
  if (method === "rolling") {
    return (<>
      <label className="inline small">окно
        <input type="number" step="1" value={p.window ?? 24}
          onChange={(e) => set({ window: Number(e.target.value) })} style={{ width: 60 }} /></label>
      <label className="inline small">порог σ
        <input type="number" step="0.5" value={p.threshold ?? 3}
          onChange={(e) => set({ threshold: Number(e.target.value) })} style={{ width: 60 }} /></label>
    </>);
  }
  return <label className="inline small">порог σ
    <input type="number" step="0.5" value={p.threshold ?? 3.5}
      onChange={(e) => set({ threshold: Number(e.target.value) })} style={{ width: 64 }} /></label>;
}

function fmt(v) {
  if (v == null) return "—";
  if (typeof v === "number") return Number(v.toFixed(4)).toString();
  return String(v);
}

export default function OutliersView({
  outData, busy, method, onMethod, params, onParams, param, onParam, columns,
  isDeleted, onToggleDeletion, onBatchDelete, deletionsCount, onExportCleaned, busyExport,
}) {
  const [selected, setSelected] = useState(() => new Set());
  const list = outData?.outliers || [];
  const asBlock = (o) => ({ parameter: o.parameter, start_idx: o.idx, end_idx: o.idx });
  const allSelected = list.length > 0 && list.every((o) => selected.has(keyOf(o)));
  const toggleOne = (o) => setSelected((prev) => {
    const n = new Set(prev); const k = keyOf(o); n.has(k) ? n.delete(k) : n.add(k); return n;
  });
  const toggleAll = () => setSelected(allSelected ? new Set() : new Set(list.map(keyOf)));
  const selItems = list.filter((o) => selected.has(keyOf(o))).map(asBlock);

  return (
    <div>
      <div className="card" style={{ marginBottom: 14 }}>
        <div className="row" style={{ alignItems: "flex-end", flexWrap: "wrap", gap: 12 }}>
          <label className="field" style={{ marginBottom: 0, flex: "1 1 200px" }}>
            <span>Параметр</span>
            <select value={param} onChange={(e) => onParam(e.target.value)}>
              <option value="__any__">Все параметры</option>
              {columns.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </label>
          <label className="field" style={{ marginBottom: 0, flex: "0 0 200px" }}>
            <span>Метод детекта</span>
            <select value={method} onChange={(e) => { onMethod(e.target.value); onParams(defaultAnomalyParams(e.target.value)); }}>
              {ANOMALY_METHODS.filter((m) => m.value !== "none").map((m) =>
                <option key={m.value} value={m.value}>{m.label}</option>)}
            </select>
          </label>
          <ParamInput method={method} params={params} onParams={onParams} />
          {busy && <span className="spinner" />}
        </div>
      </div>

      <div className="inline" style={{ justifyContent: "space-between", marginBottom: 8, flexWrap: "wrap", gap: 8 }}>
        <div className="section-title" style={{ margin: 0 }}>
          Найдено выбросов: {outData?.count ?? 0}{outData?.truncated ? "+" : ""}
          {outData ? ` · строк: ${outData.total_rows.toLocaleString("ru")}` : ""}
        </div>
        <div className="btn-row">
          <span className="small muted" style={{ alignSelf: "center" }}>
            К удалению: <b style={{ color: "var(--danger)" }}>{deletionsCount}</b>
          </span>
          <button className="primary" onClick={() => onExportCleaned("csv")} disabled={busyExport || !deletionsCount}>⬇ Очищенные CSV</button>
          <button onClick={() => onExportCleaned("xlsx")} disabled={busyExport || !deletionsCount}>⬇ Очищенные Excel</button>
        </div>
      </div>

      {selItems.length > 0 && (
        <div className="batch-bar">
          <span>С выбранными ({selItems.length}):</span>
          <button className="danger" onClick={() => { onBatchDelete(selItems); setSelected(new Set()); }}>🗑 Удалить</button>
          <button disabled title="скоро">∿ Интерполировать</button>
          <button disabled title="скоро">→ 0</button>
          <button disabled title="скоро">📌 Метка</button>
        </div>
      )}

      <div className="card" style={{ overflowX: "auto" }}>
        {list.length === 0 ? (
          <div className="small muted">Выбросов не найдено. Смягчите порог или выберите другой метод.</div>
        ) : (
          <table className="stats blocks-table">
            <thead>
              <tr>
                <th style={{ width: 28 }}><input type="checkbox" checked={allSelected} onChange={toggleAll} title="выбрать все" /></th>
                <th>Параметр</th><th>Время / X</th><th>Значение</th><th>Индекс</th><th></th>
              </tr>
            </thead>
            <tbody>
              {list.map((o) => {
                const b = asBlock(o);
                const del = isDeleted(b);
                const sel = selected.has(keyOf(o));
                return (
                  <tr key={keyOf(o)} className={sel ? "row-selected" : ""}
                    style={del ? { opacity: 0.45, textDecoration: "line-through" } : undefined}>
                    <td style={{ textAlign: "center" }}>
                      <input type="checkbox" checked={sel} onChange={() => toggleOne(o)} />
                    </td>
                    <td style={{ textAlign: "left" }}>{o.parameter}</td>
                    <td>{String(o.x)}</td>
                    <td>{fmt(o.value)}</td>
                    <td>{o.idx}</td>
                    <td style={{ textAlign: "center" }}>
                      <button className="trash" title={del ? "вернуть" : "удалить (→ NaN)"}
                        onClick={() => onToggleDeletion(b)}
                        style={del ? { color: "var(--accent)" } : undefined}>
                        {del ? "↩" : "🗑"}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
      <div className="small muted" style={{ marginTop: 8 }}>
        Удаление ставит в ячейку NaN (видно во всех режимах). Автоматическую интерполяцию
        выбросов можно включить слева в «Очистка / интерполяция».
      </div>
    </div>
  );
}
