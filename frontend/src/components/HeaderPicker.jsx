import React, { useState } from "react";

// Raw grid of the first rows. Click a row to mark it as the header row; rows
// above it are struck through. On the header row, each cell can be renamed
// (double-click) or its column deleted; data rows can be deleted from the left.
export default function HeaderPicker({
  preview, headerRow, onPick, sheets, sheet, onSheet, resolved, multi,
  dropColumns, dropRows, renames, onDropColumn, onDropRow, onRename,
}) {
  const [editCol, setEditCol] = useState(null);
  if (!preview) return null;
  const rows = preview.rows || [];
  const ncols = preview.ncols || 0;
  const dropCols = new Set(dropColumns || []);
  const dropRowSet = new Set(dropRows || []);

  // Base (parsed) name of column j: prefer the resolved name from the backend
  // (which identifies even blank/unnamed columns), else the raw header cell.
  const baseName = (j) => {
    if (resolved && j < resolved.length && resolved[j] != null) return resolved[j];
    return (rows[headerRow]?.[j] ?? "").toString();
  };
  const curName = (j) => {
    const base = baseName(j);
    return (renames && renames[base]) || base;
  };
  const colDropped = (j) => dropCols.has(curName(j));

  return (
    <div className="section">
      <div className="section-title">2 · Строка-шапка</div>

      {sheets && sheets.length > 0 && (
        <label className="field">
          <span>Лист Excel</span>
          <select value={sheet || ""} onChange={(e) => onSheet(e.target.value)}>
            {sheets.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </label>
      )}

      <div className="hint" style={{ marginBottom: 8 }}>
        {multi
          ? "Кликните строку-шапку для этого файла. Удаление/переименование колонок — в разделах ниже (по объединённой таблице)."
          : "Кликните строку-шапку. 🗑 сверху колонки удаляет её, двойной клик по названию — переименовать. Слева у строк данных 🗑 удаляет строку. Правки видны во всех режимах."}
      </div>

      <div className="grid-wrap">
        <table className="raw">
          <tbody>
            {!multi && (
            <tr className="coltrash-row">
              <td className="rownum"></td>
              {Array.from({ length: ncols }, (_, j) => {
                const nm = curName(j);
                const cd = colDropped(j);
                return (
                  <td key={j} style={{ textAlign: "center", padding: "2px" }}>
                    {nm !== "" && (
                      <button className="trash mini" title={cd ? "вернуть колонку" : "удалить колонку"}
                        onClick={() => onDropColumn(nm)}
                        style={cd ? { color: "var(--accent)" } : undefined}>
                        {cd ? "↩" : "🗑"}
                      </button>
                    )}
                  </td>
                );
              })}
            </tr>
            )}
            {rows.map((row, i) => {
              const isHeader = i === headerRow;
              const dataIdx = i - headerRow - 1;            // -1 for header/above
              const isDataRow = i > headerRow;
              const rowDropped = isDataRow && dropRowSet.has(dataIdx);
              return (
                <tr key={i}
                  className={isHeader ? "header-row" : i < headerRow ? "above-row" : (rowDropped ? "row-dropped" : "")}
                  onClick={() => onPick(i)}>
                  <td className="rownum" onClick={(e) => e.stopPropagation()}>
                    <div className="rownum-cell">
                      {isDataRow && !multi && (
                        <button className="trash mini" title={rowDropped ? "вернуть строку" : "удалить строку"}
                          onClick={() => onDropRow(dataIdx)}
                          style={rowDropped ? { color: "var(--accent)" } : undefined}>
                          {rowDropped ? "↩" : "🗑"}
                        </button>
                      )}
                      <span>{i}</span>
                    </div>
                  </td>
                  {Array.from({ length: ncols }, (_, j) => {
                    const cd = colDropped(j);
                    if (isHeader) {
                      return (
                        <td key={j} className={cd ? "col-dropped-cell" : ""}
                          onClick={(e) => multi ? undefined : e.stopPropagation()}>
                          <div className="hdr-cell">
                            {editCol === j ? (
                              <input className="rename-input" autoFocus defaultValue={curName(j)}
                                onBlur={(e) => { onRename(curName(j), e.target.value); setEditCol(null); }}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") { onRename(curName(j), e.target.value); setEditCol(null); }
                                  if (e.key === "Escape") setEditCol(null);
                                }} />
                            ) : (
                              <span className="hdr-name" title={multi ? "" : "двойной клик — переименовать"}
                                style={cd ? { textDecoration: "line-through", opacity: 0.6 } : undefined}
                                onDoubleClick={() => !multi && !cd && curName(j) && setEditCol(j)}>
                                {curName(j) || "·"}
                              </span>
                            )}
                          </div>
                        </td>
                      );
                    }
                    const v = row[j] ?? "";
                    return (
                      <td key={j} className={cd ? "col-dropped-cell" : ""}>{v === "" ? "·" : v}</td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="small muted" style={{ marginTop: 6 }}>
        Выбрана строка #{headerRow} как шапка.
        {(dropColumns?.length || dropRows?.length)
          ? ` · правок: колонок ${dropColumns.length}, строк ${dropRows.length}` : ""}
      </div>
    </div>
  );
}
