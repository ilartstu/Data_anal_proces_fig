import React, { useEffect, useState } from "react";
import Plotly from "plotly.js-dist-min";
import { ASPECT_RATIOS, chartThumbnail } from "../lib/exportImage";

const FORMATS = [
  { value: "png", label: "PNG" },
  { value: "jpeg", label: "JPEG" },
  { value: "svg", label: "SVG" },
];

// Quality presets — the longer edge of the image in pixels.
const QUALITY = [
  { label: "HD", edge: 1280 },
  { label: "Full HD", edge: 1920 },
  { label: "2K", edge: 2560 },
  { label: "4K", edge: 3840 },
];

const FREE_IDX = ASPECT_RATIOS.findIndex((r) => r.w === 0);

// Resize keeping either a locked ratio or the row's current proportions, so
// the longer side becomes `edge` (used by the quality presets & per-row ratio).
function sized(row, edge) {
  const r = ASPECT_RATIOS[row.ratioIdx];
  if (r && r.w > 0 && r.h > 0) {
    return r.w >= r.h
      ? { width: edge, height: Math.max(1, Math.round(edge * r.h / r.w)) }
      : { height: edge, width: Math.max(1, Math.round(edge * r.w / r.h)) };
  }
  const ar = (row.width || 1) / (row.height || 1);
  return ar >= 1
    ? { width: edge, height: Math.max(1, Math.round(edge / ar)) }
    : { height: edge, width: Math.max(1, Math.round(edge * ar)) };
}

export default function ExportDialog({ open, charts, onClose, onExport }) {
  const [format, setFormat] = useState("png");
  const [dpi, setDpi] = useState(300);
  const [bg, setBg] = useState("white");
  const [quality, setQuality] = useState(0.92);
  const [rows, setRows] = useState([]);
  const [thumbs, setThumbs] = useState({});   // label -> preview dataURL

  // (Re)seed per-chart rows from the charts on screen each time we open.
  // Default to a Full-HD-sized image that keeps each chart's natural aspect.
  useEffect(() => {
    if (!open) return;
    setRows((charts || []).map((c) => {
      const w0 = Math.round(c.gd?._fullLayout?.width || 0) || 1100;
      const h0 = Math.round(c.gd?._fullLayout?.height || 0) || 700;
      const ar = w0 / h0, long = 1920;
      const width = ar >= 1 ? long : Math.max(1, Math.round(long * ar));
      const height = ar >= 1 ? Math.max(1, Math.round(long / ar)) : long;
      return { label: c.label, gd: c.gd, enabled: true, name: c.label,
        ratioIdx: FREE_IDX, width, height };
    }));
  }, [open, charts]);

  // Render a small preview of each chart (off-screen, never touches the live one).
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setThumbs({});
    (async () => {
      for (const c of charts || []) {
        try {
          const url = await chartThumbnail(Plotly, c.gd, 240);
          if (cancelled) return;
          setThumbs((p) => ({ ...p, [c.label]: url }));
        } catch { /* skip preview on failure */ }
      }
    })();
    return () => { cancelled = true; };
  }, [open, charts]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const multi = rows.length > 1;
  const selected = rows.filter((r) => r.enabled);
  const allOn = rows.length > 0 && rows.every((r) => r.enabled);
  const someOn = rows.some((r) => r.enabled);
  const isRaster = format !== "svg";

  const setRow = (i, patch) => setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const onRowRatio = (i, idx) => setRows((rs) => rs.map((r, j) => {
    if (j !== i) return r;
    const nr = { ...r, ratioIdx: idx };
    const ar = ASPECT_RATIOS[idx];
    if (ar.w > 0 && ar.h > 0) nr.height = Math.max(1, Math.round(nr.width * ar.h / ar.w));
    return nr;
  }));
  const onRowW = (i, v) => setRows((rs) => rs.map((r, j) => {
    if (j !== i) return r;
    const w = Math.max(1, Math.round(Number(v) || 0));
    const ar = ASPECT_RATIOS[r.ratioIdx];
    const h = (ar.w > 0 && ar.h > 0) ? Math.max(1, Math.round(w * ar.h / ar.w)) : r.height;
    return { ...r, width: w, height: h };
  }));
  const onRowH = (i, v) => setRows((rs) => rs.map((r, j) => {
    if (j !== i) return r;
    const h = Math.max(1, Math.round(Number(v) || 0));
    const ar = ASPECT_RATIOS[r.ratioIdx];
    const w = (ar.w > 0 && ar.h > 0) ? Math.max(1, Math.round(h * ar.w / ar.h)) : r.width;
    return { ...r, width: w, height: h };
  }));

  const toggleAll = (on) => setRows((rs) => rs.map((r) => ({ ...r, enabled: on })));
  const applyQuality = (edge) =>
    setRows((rs) => rs.map((r) => (r.enabled ? { ...r, ...sized(r, edge) } : r)));

  const doExport = () => {
    if (!selected.length) return;
    onExport({
      format, dpi: Math.max(1, Math.round(dpi)), bg, quality,
      items: selected.map((r) => {
        const ar = ASPECT_RATIOS[r.ratioIdx];
        const height = (ar.w > 0 && ar.h > 0) ? Math.max(1, Math.round(r.width * ar.h / ar.w)) : r.height;
        return { gd: r.gd, label: (r.name || r.label).trim() || r.label, width: r.width, height };
      }),
    });
    onClose();
  };

  return (
    <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal" style={{ maxWidth: 560 }} role="dialog" aria-modal="true">
        <div className="modal-head">
          <h3>{multi ? "Сохранить графики" : "Сохранить график"}</h3>
          <button className="modal-x" onClick={onClose} title="Закрыть">×</button>
        </div>

        {/* ---- Shared settings ---- */}
        <div className="grid2">
          <label className="field" style={{ marginBottom: 0 }}>
            <span>Формат</span>
            <div className="seg seg-fill">
              {FORMATS.map((f) => (
                <button key={f.value} className={format === f.value ? "active" : ""}
                  onClick={() => setFormat(f.value)}>{f.label}</button>
              ))}
            </div>
          </label>
          {isRaster && (
            <label className="field" style={{ marginBottom: 0 }}>
              <span>Фон</span>
              <select value={bg} onChange={(e) => setBg(e.target.value)} disabled={format === "jpeg"}>
                <option value="white">Белый</option>
                <option value="transparent">Прозрачный</option>
              </select>
            </label>
          )}
        </div>

        {isRaster && (
          <div className="grid2" style={{ marginTop: 10 }}>
            <label className="field" style={{ marginBottom: 0 }}>
              <span>DPI (общий)</span>
              <input type="number" min="1" step="1" value={dpi}
                onChange={(e) => setDpi(Number(e.target.value) || 0)} />
            </label>
            <label className="field" style={{ marginBottom: 0 }}>
              <span>Качество (размер)</span>
              <div className="seg seg-fill">
                {QUALITY.map((q) => (
                  <button key={q.label} onClick={() => applyQuality(q.edge)}
                    title={`длинная сторона ${q.edge}px`}>{q.label}</button>
                ))}
              </div>
            </label>
          </div>
        )}

        {format === "jpeg" && (
          <label className="field" style={{ marginTop: 10 }}>
            <span>Качество JPEG: {Math.round(quality * 100)}%</span>
            <input type="range" min="0.3" max="1" step="0.01" value={quality}
              onChange={(e) => setQuality(Number(e.target.value))} />
          </label>
        )}

        {/* ---- Per-chart rows ---- */}
        <div className="export-rows">
          <div className="export-rows-head">
            {multi ? (
              <label className="inline small" style={{ gap: 6 }} title={allOn ? "Снять все" : "Выбрать все"}>
                <input type="checkbox" ref={(el) => { if (el) el.indeterminate = someOn && !allOn; }}
                  checked={allOn} onChange={(e) => toggleAll(e.target.checked)} />
                <span className="small muted">выбрать все графики ({rows.length})</span>
              </label>
            ) : <span className="small muted">Настройки графика</span>}
            <span className="small muted">имя · соотношение · размер</span>
          </div>

          {rows.map((r, i) => (
            <div key={r.label + i} className={"export-row" + (r.enabled ? "" : " off")}>
              {multi && (
                <input type="checkbox" className="export-row-check" checked={r.enabled}
                  onChange={(e) => setRow(i, { enabled: e.target.checked })} />
              )}
              <div className="export-thumb" title={r.label}>
                {thumbs[r.label]
                  ? <img src={thumbs[r.label]} alt="" />
                  : <span className="spinner" />}
              </div>
              <div className="export-row-body">
                <div className="export-row-label" title={r.label}>{r.label}</div>
                <div className="export-row-controls">
                  <input type="text" className="export-name" value={r.name}
                    title="Имя файла" placeholder={r.label}
                    onChange={(e) => setRow(i, { name: e.target.value })} />
                  <select value={r.ratioIdx} onChange={(e) => onRowRatio(i, Number(e.target.value))}
                    style={{ width: "auto" }} title="Соотношение сторон">
                    {ASPECT_RATIOS.map((ar, k) => <option key={ar.label} value={k}>{ar.label}</option>)}
                  </select>
                  <span className="inline" style={{ gap: 4 }}>
                    <input type="number" min="1" step="1" value={r.width} style={{ width: 66 }}
                      title="Ширина, px" onChange={(e) => onRowW(i, e.target.value)} />
                    <span className="muted">×</span>
                    <input type="number" min="1" step="1" value={r.height} style={{ width: 66 }}
                      title="Высота, px" disabled={ASPECT_RATIOS[r.ratioIdx].w > 0}
                      onChange={(e) => onRowH(i, e.target.value)} />
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="hint">
          Качество/размер меняют только разрешение — подписи и шрифты остаются
          такого же размера, как на экране. Высота при выбранном соотношении
          считается автоматически (без чёрных полос).
          {isRaster ? " DPI и формат — общие для всех." : " SVG — вектор, DPI не нужен."}
        </div>

        <div className="modal-foot">
          <button className="ghost" onClick={onClose}>Отмена</button>
          <button className="primary" onClick={doExport} disabled={!selected.length}>
            ⬇ Скачать{selected.length > 1 ? ` (${selected.length})` : ""}
          </button>
        </div>
      </div>
    </div>
  );
}
