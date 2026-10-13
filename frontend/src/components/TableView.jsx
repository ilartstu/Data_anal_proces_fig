import React, { useState } from "react";
import { useT, useNum } from "../i18n";

export default function TableView({
  tableData, busy, page, onPage, dropRows, dropColumnsCount, dropRowsCount,
  onDropColumn, onDropRow, onRename, onRestore, onExportCleaned, busyExport, readOnly,
  enabledCols, xCol, normalize,
}) {
  const t = useT();
  const nf = useNum();
  const [editCol, setEditCol] = useState(null);
  const cols = tableData?.columns || [];
  const rows = tableData?.rows || [];
  const total = tableData?.total || 0;
  const pages = Math.max(1, Math.ceil(total / 100));
  const droppedRowSet = new Set(dropRows || []);
  const editsCount = (dropColumnsCount || 0) + (dropRowsCount || 0);
  // Mirror the left-sidebar choices onto the grid columns.
  const selSet = new Set(readOnly ? [] : (enabledCols || []));
  const normSet = new Set(readOnly ? [] : (normalize || []));
  const anyMark = !readOnly && (selSet.size || normSet.size || xCol);

  return (
    <div>
      <div className="hint" style={{ marginBottom: anyMark ? 6 : 12 }}>
        {t("Рабочая копия данных. Мусорка сверху колонки удаляет колонку, слева строки — строку. Оригинальный файл не меняется — правки попадают только в скачиваемый файл.")}
      </div>
      {anyMark ? (
        <div className="hint table-legend" style={{ marginBottom: 12 }}>
          {t("Отражает выбор слева:")}
          <span className="th-badge x">⏱</span> {t("ось X")}
          <span className="th-badge sel">✓</span> {t("выбрано")}
          <span className="th-badge norm">÷max</span> {t("нормализовано (значения поделены на максимум)")}
        </div>
      ) : null}

      <div className="inline" style={{ justifyContent: "space-between", marginBottom: 8, flexWrap: "wrap", gap: 8 }}>
        <div className="section-title" style={{ margin: 0 }}>
          {t("Строк всего: {n}", { n: nf(total) })}
          {!readOnly && editsCount ? t(" · правок к удалению: {n}", { n: editsCount }) : ""}
          {readOnly ? t(" · просмотр исходного файла") : ""}
          {busy && <>&nbsp;<span className="spinner" /></>}
        </div>
        {!readOnly && (
          <div className="btn-row">
            {editsCount > 0 && (
              <button className="ghost small" onClick={onRestore}>{t("Вернуть всё")}</button>
            )}
            <button className="primary" onClick={() => onExportCleaned("csv")} disabled={busyExport}>{t("⬇ Правленые CSV")}</button>
            <button onClick={() => onExportCleaned("xlsx")} disabled={busyExport}>{t("⬇ Правленые Excel")}</button>
          </div>
        )}
      </div>

      <div className="card" style={{ overflowX: "auto" }}>
        <table className="grid-table">
          <thead>
            <tr>
              <th className="corner"></th>
              {cols.map((c) => {
                const isX = !readOnly && c === xCol;
                const isSel = selSet.has(c);
                const isNorm = normSet.has(c);
                const thCls = [isX ? "col-x" : "", isSel ? "col-selected" : ""].join(" ").trim();
                return (
                <th key={c} className={thCls || undefined}>
                  <div className="grid-colhead">
                    {!readOnly && (
                      <button className="trash" title={t("удалить колонку")} onClick={() => onDropColumn(c)}>🗑</button>
                    )}
                    {!readOnly && editCol === c ? (
                      <input className="rename-input" autoFocus defaultValue={c}
                        onBlur={(e) => { onRename(c, e.target.value); setEditCol(null); }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") { onRename(c, e.target.value); setEditCol(null); }
                          if (e.key === "Escape") setEditCol(null);
                        }} />
                    ) : (
                      <span title={readOnly ? c : t("{name} — двойной клик, чтобы переименовать", { name: c })}
                        style={{ cursor: readOnly ? "default" : "text" }}
                        onDoubleClick={() => !readOnly && setEditCol(c)}>{c}</span>
                    )}
                    {isX && <span className="th-badge x" title={t("ось X")}>⏱</span>}
                    {isNorm && <span className="th-badge norm" title={t("нормализовано (÷ max)")}>÷max</span>}
                    {isSel && <span className="th-badge sel" title={t("выбрано слева")}>✓</span>}
                  </div>
                </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const del = !readOnly && droppedRowSet.has(r.idx);
              return (
                <tr key={r.idx} className={del ? "row-dropped" : ""}>
                  <td className="rowhead">
                    {!readOnly && (
                      <button className="trash" title={del ? t("вернуть строку") : t("удалить строку")}
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
        <button onClick={() => onPage(Math.max(0, page - 1))} disabled={page === 0}>{t("← Назад")}</button>
        <span className="small muted">{t("Стр. {p} из {n} · строки {a}–{b}", { p: page + 1, n: pages, a: page * 100, b: Math.min(total, page * 100 + 100) - 1 })}</span>
        <button onClick={() => onPage(Math.min(pages - 1, page + 1))} disabled={page >= pages - 1}>{t("Вперёд →")}</button>
      </div>
    </div>
  );
}
