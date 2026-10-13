import React from "react";
import { useT } from "../i18n";

export default function Annotations({ annotations, onRemove, onClear }) {
  const t = useT();
  if (!annotations.length) {
    return (
      <div className="small muted">
        {t("Кликните по точке на графике, чтобы поставить отметку с подписью.")}
      </div>
    );
  }
  return (
    <div>
      <div className="btn-row" style={{ marginBottom: 8 }}>
        <button className="ghost small" onClick={onClear}>{t("Очистить все")}</button>
      </div>
      {annotations.map((a, i) => (
        <div className="tag-annot" key={i}>
          <span className="dot" style={{ background: "#8a5cf6" }} />
          <span style={{ flex: 1 }}>
            <b>{a.text || t("метка")}</b>
            <span className="muted small"> · {String(a.x)} = {typeof a.y === "number" ? a.y : String(a.y)}</span>
          </span>
          <button onClick={() => onRemove(i)}>✕</button>
        </div>
      ))}
    </div>
  );
}
