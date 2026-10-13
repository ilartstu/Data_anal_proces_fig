import React, { useRef } from "react";
import { useT } from "../i18n";

export default function ExportBar({
  onExportData, onOpenImageDialog, onChartHtml, onSavePreset, onLoadPreset, busyExport, disabled,
}) {
  const t = useT();
  const presetInput = useRef(null);
  return (
    <div className="btn-row" style={{ marginBottom: 14 }}>
      <button onClick={() => onExportData("csv")} disabled={disabled || busyExport}>
        {busyExport ? <span className="spinner" /> : t("⬇ Данные CSV")}
      </button>
      <button onClick={() => onExportData("xlsx")} disabled={disabled || busyExport}>{t("⬇ Данные Excel")}</button>
      <span style={{ width: 1, background: "var(--border)" }} />
      <button onClick={onOpenImageDialog} disabled={disabled}
        title={t("Выбрать графики, формат, размер и DPI перед сохранением")}>{t("⬇ График")}</button>
      <button onClick={onChartHtml} disabled={disabled}>🖼 HTML</button>
      <span style={{ width: 1, background: "var(--border)" }} />
      <button className="ghost" onClick={onSavePreset} disabled={disabled} title={t("Скачать настройки в JSON-файл")}>
        {t("💾 Сохранить пресет")}
      </button>
      <button className="ghost" onClick={() => presetInput.current?.click()} title={t("Загрузить JSON с настройками")}>
        {t("📂 Загрузить пресет")}
      </button>
      <input
        ref={presetInput} type="file" accept=".json,application/json"
        style={{ display: "none" }}
        onChange={(e) => { if (e.target.files?.[0]) onLoadPreset(e.target.files[0]); e.target.value = ""; }}
      />
    </div>
  );
}
