import React, { useRef } from "react";

export default function ExportBar({
  onExportData, onOpenImageDialog, onChartHtml, onSavePreset, onLoadPreset, busyExport, disabled,
}) {
  const presetInput = useRef(null);
  return (
    <div className="btn-row" style={{ marginBottom: 14 }}>
      <button onClick={() => onExportData("csv")} disabled={disabled || busyExport}>
        {busyExport ? <span className="spinner" /> : "⬇ Данные CSV"}
      </button>
      <button onClick={() => onExportData("xlsx")} disabled={disabled || busyExport}>⬇ Данные Excel</button>
      <span style={{ width: 1, background: "var(--border)" }} />
      <button onClick={onOpenImageDialog} disabled={disabled}
        title="Выбрать графики, формат, размер и DPI перед сохранением">⬇ График</button>
      <button onClick={onChartHtml} disabled={disabled}>🖼 HTML</button>
      <span style={{ width: 1, background: "var(--border)" }} />
      <button className="ghost" onClick={onSavePreset} disabled={disabled} title="Скачать настройки в JSON-файл">
        💾 Сохранить пресет
      </button>
      <button className="ghost" onClick={() => presetInput.current?.click()} title="Загрузить JSON с настройками">
        📂 Загрузить пресет
      </button>
      <input
        ref={presetInput} type="file" accept=".json,application/json"
        style={{ display: "none" }}
        onChange={(e) => { if (e.target.files?.[0]) onLoadPreset(e.target.files[0]); e.target.value = ""; }}
      />
    </div>
  );
}
