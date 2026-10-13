import React, { useRef, useState } from "react";
import { useT } from "../i18n";

export default function Uploader({ onFile, busy, filename, addMode, disabled }) {
  const t = useT();
  const inputRef = useRef(null);
  const [drag, setDrag] = useState(false);

  function handleFiles(files) {
    if (files && files[0]) onFile(files[0]);
  }

  return (
    <div className="section">
      {!addMode && <div className="section-title">{t("1 · Файл данных")}</div>}
      <div
        className={"dropzone" + (drag ? " drag" : "") + (disabled ? " disabled" : "") + (addMode ? " compact" : "")}
        onClick={() => !disabled && inputRef.current?.click()}
        onDragOver={(e) => { if (!disabled) { e.preventDefault(); setDrag(true); } }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDrag(false);
          if (!disabled) handleFiles(e.dataTransfer.files);
        }}
      >
        {busy ? (
          <><span className="spinner" /> &nbsp;{t("Загрузка…")}</>
        ) : disabled ? (
          <span className="small">{t("Достигнут максимум (5 файлов)")}</span>
        ) : addMode ? (
          <><strong>{t("＋ Добавить файл")}</strong><br /><span className="small">{t("для сравнения (до 5)")}</span></>
        ) : filename ? (
          <><strong>{filename}</strong><br /><span className="small">{t("Нажмите, чтобы заменить")}</span></>
        ) : (
          <><strong>{t("Перетащите CSV / Excel")}</strong><br /><span className="small">{t("или нажмите для выбора")}</span></>
        )}
        <input
          ref={inputRef}
          type="file"
          accept=".csv,.tsv,.txt,.xlsx,.xls,.xlsm"
          style={{ display: "none" }}
          onChange={(e) => handleFiles(e.target.files)}
        />
      </div>
    </div>
  );
}
