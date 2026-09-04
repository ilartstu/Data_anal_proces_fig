import React, { useState } from "react";

function kindColor(kind) {
  return kind === "NaN" ? "var(--danger)" : "var(--warn)";
}
const keyOf = (b) => `${b.parameter}|${b.start_idx}|${b.end_idx}`;

export default function BlocksView({
  blocksData, busy, minLen, onMinLen, kinds, onKinds, param, onParam, columns,
  isDeleted, onToggleDeletion, onBatchDelete, deletionsCount, onExportCleaned, busyExport,
}) {
  const [selected, setSelected] = useState(() => new Set());
  const toggleKind = (k) => {
    const has = kinds.includes(k);
    const next = has ? kinds.filter((x) => x !== k) : [...kinds, k];
    if (next.length) onKinds(next);
  };
  const blocks = blocksData?.blocks || [];
  const allSelected = blocks.length > 0 && blocks.every((b) => selected.has(keyOf(b)));
  const toggleOne = (b) => setSelected((prev) => {
    const n = new Set(prev); const k = keyOf(b);
    n.has(k) ? n.delete(k) : n.add(k); return n;
  });
  const toggleAll = () => setSelected(allSelected ? new Set()
    : new Set(blocks.map(keyOf)));
  const selItems = blocks.filter((b) => selected.has(keyOf(b)));

  return (
    <div>
      <div className="card" style={{ marginBottom: 14 }}>
        <div className="row" style={{ alignItems: "flex-end", flexWrap: "wrap", gap: 12 }}>
          <label className="field" style={{ marginBottom: 0, flex: "0 0 150px" }}>
            <span>Мин. длина (подряд ≥)</span>
            <input type="number" min="2" step="1" value={minLen}
              onChange={(e) => onMinLen(Math.max(2, Number(e.target.value)))} />
          </label>
          <label className="field" style={{ marginBottom: 0, flex: "1 1 200px" }}>
            <span>Параметр</span>
            <select value={param} onChange={(e) => onParam(e.target.value)}>
              <option value="__any__">Любой параметр</option>
              {columns.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </label>
          <div className="field" style={{ marginBottom: 0 }}>
            <span>Тип записей подряд</span>
            <div className="pill-toggle">
              <span className={"pill" + (kinds.includes("nan") ? " active" : "")}
                onClick={() => toggleKind("nan")}>
                <span className="dot" style={{ background: "var(--danger)" }} />NaN
              </span>
              <span className={"pill" + (kinds.includes("zeros") ? " active" : "")}
                onClick={() => toggleKind("zeros")}>
                <span className="dot" style={{ background: "var(--warn)" }} />нули
              </span>
            </div>
          </div>
          {busy && <span className="spinner" />}
        </div>
      </div>

      <div className="inline" style={{ justifyContent: "space-between", marginBottom: 8, flexWrap: "wrap", gap: 8 }}>
        <div className="section-title" style={{ margin: 0 }}>
          Найдено блоков: {blocks.length}
          {blocksData ? ` · всего строк: ${blocksData.total_rows.toLocaleString("ru")}` : ""}
        </div>
        <div className="btn-row">
          <span className="small muted" style={{ alignSelf: "center" }}>
            К удалению: <b style={{ color: "var(--danger)" }}>{deletionsCount}</b>
          </span>
          <button className="primary" onClick={() => onExportCleaned("csv")} disabled={busyExport || !deletionsCount}>
            ⬇ Очищенные CSV
          </button>
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
        {blocks.length === 0 ? (
          <div className="small muted">Блоков не найдено. Уменьшите минимальную длину или измените тип.</div>
        ) : (
          <table className="stats blocks-table">
            <thead>
              <tr>
                <th style={{ width: 28 }}><input type="checkbox" checked={allSelected} onChange={toggleAll} title="выбрать все" /></th>
                <th>Параметр</th><th>Начало периода</th><th>Конец периода</th>
                <th>Длина, точек</th><th>Тип блока</th><th>Нулей</th><th>NaN</th><th></th>
              </tr>
            </thead>
            <tbody>
              {blocks.map((b) => {
                const del = isDeleted(b);
                const sel = selected.has(keyOf(b));
                return (
                  <tr key={keyOf(b)} className={sel ? "row-selected" : ""}
                    style={del ? { opacity: 0.45, textDecoration: "line-through" } : undefined}>
                    <td style={{ textAlign: "center" }}>
                      <input type="checkbox" checked={sel} onChange={() => toggleOne(b)} />
                    </td>
                    <td style={{ textAlign: "left" }}>{b.parameter}</td>
                    <td>{String(b.start)}</td>
                    <td>{String(b.end)}</td>
                    <td>{b.length}</td>
                    <td style={{ color: kindColor(b.kind), fontWeight: 600 }}>{b.kind}</td>
                    <td>{b.n_zeros}</td>
                    <td>{b.n_nan}</td>
                    <td style={{ textAlign: "center" }}>
                      <button className="trash" title="удалить"
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
        Отметьте блоки галочками для групповых действий или корзиной по одному. Удаление очищает
        значения (→ NaN) в скачиваемом файле. «↩» — вернуть. Интерполяция / замена на 0 / метка — скоро.
      </div>
    </div>
  );
}
