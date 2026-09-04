import React, { useState } from "react";

export default function TableView({
  tableData, busy, page, onPage, dropRows, dropColumnsCount, dropRowsCount,
  onDropColumn, onDropRow, onRename, onRestore, onExportCleaned, busyExport, readOnly,
}) {
  const [editCol, setEditCol] = useState(null);
  const cols = tableData?.columns || [];
  const rows = tableData?.rows || [];
  const total = tableData?.total || 0;
  const pages = Math.max(1, Math.ceil(total / 100));
  const droppedRowSet = new Set(dropRows || []);
  const editsCount = (dropColumnsCount || 0) + (dropRowsCount || 0);

  return (
    <div>
      <div className="hint" style={{ marginBottom: 12 }}>
        Рабочая копия данных. Мусорка сверху колонки удаляет колонку, слева строки — строку.
        Оригинальный файл не меняется — правки попадают только в скачиваемый файл.
      </div>

      <div className="inline" style={{ justifyContent: "space-between", marginBottom: 8, flexWrap: "wrap", gap: 8 }}>
        <div className="section-title" style={{ margin: 0 }}>
          Строк всего: {total.toLocaleString("ru")}
          {!readOnly && editsCount ? ` · правок к удалению: ${editsCount}` : ""}
          {readOnly ? " · просмотр исходного файла" : ""}
          {busy && <>&nbsp;<span className="spinner" /></>}
        </div>
        {!readOnly && (
          <div className="btn-row">
            {editsCount > 0 && (
              <button className="ghost small" onClick={onRestore}>Вернуть всё</button>
            )}
            <button className="primary" onClick={() => onExportCleaned("csv")} disabled={busyExport}>⬇ Правленые CSV</button>
            <button onClick={() => onExportCleaned("xlsx")} disabled={busyExport}>⬇ Правленые Excel</button>
          </div>
        )}
      </div>

      <div className="card" style={{ overflowX: "auto" }}>
        <table className="grid-table">
          <thead>
            <tr>
              <th className="corner"></th>
              {cols.map((c) => (
                <th key={c}>
                  <div className="grid-colhead">
                    {!readOnly && (
                      <button className="trash" title="удалить колонку" onClick={() => onDropColumn(c)}>🗑</button>
                    )}
                    {!readOnly && editCol === c ? (
                      <input className="rename-input" autoFocus defaultValue={c}
                        onBlur={(e) => { onRename(c, e.target.value); setEditCol(null); }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") { onRename(c, e.target.value); setEditCol(null); }
                          if (e.key === "Escape") setEditCol(null);
                        }} />
                    ) : (
                      <span title={readOnly ? c : `${c} — двойной клик, чтобы переименовать`}
                        style={{ cursor: readOnly ? "default" : "text" }}
                        onDoubleClick={() => !readOnly && setEditCol(c)}>{c}</span>
                    )}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const del = !readOnly && droppedRowSet.has(r.idx);
              return (
                <tr key={r.idx} className={del ? "row-dropped" : ""}>
                  <td className="rowhead">
                    {!readOnly && (
                      <button className="trash" title={del ? "вернуть строку" : "удалить строку"}
                        onClick={() => onDropRow(r.idx)}
                        style={del ? { color: "var(--accent)" } : undefined}>
                        {del ? "↩" : "🗑"}
                      </button>
                    )}
                    <span className="muted small">{r.idx}</span>
                  </td>
                  {r.cells.map((v, j) => <td key={j}>{v}</td>)}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="inline" style={{ justifyContent: "center", gap: 10, marginTop: 10 }}>
        <button onClick={() => onPage(Math.max(0, page - 1))} disabled={page === 0}>← Назад</button>
        <span className="small muted">Стр. {page + 1} из {pages} · строки {page * 100}–{Math.min(total, page * 100 + 100) - 1}</span>
        <button onClick={() => onPage(Math.min(pages - 1, page + 1))} disabled={page >= pages - 1}>Вперёд →</button>
      </div>
    </div>
  );
}
