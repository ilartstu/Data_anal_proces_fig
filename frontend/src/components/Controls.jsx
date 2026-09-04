import React from "react";
import {
  AGG_OPTIONS, ANOMALY_METHODS, ANOMALY_STYLES, RESAMPLE_PRESETS, defaultAnomalyParams,
} from "../constants";

function AnomalyStyleEditor({ anomalyStyle, onAnomalyStyle }) {
  const s = anomalyStyle;
  return (
    <div style={{ marginTop: 4 }}>
      <label className="field" style={{ marginBottom: 6 }}>
        <span>Как отмечать аномалии</span>
        <select value={s.mode} onChange={(e) => onAnomalyStyle({ ...s, mode: e.target.value })}>
          {ANOMALY_STYLES.map((a) => <option key={a.value} value={a.value}>{a.label}</option>)}
        </select>
      </label>
      <div className="inline" style={{ gap: 12 }}>
        <label className="inline small" title="Цвет отметки">
          цвет
          <input type="color" value={s.color}
            onChange={(e) => onAnomalyStyle({ ...s, color: e.target.value })} />
        </label>
        {s.mode !== "background" && (
          <label className="inline small" title="Размер">
            размер
            <input type="number" min="2" max="24" step="1" value={s.size}
              onChange={(e) => onAnomalyStyle({ ...s, size: Number(e.target.value) })}
              style={{ width: 60 }} />
          </label>
        )}
      </div>
    </div>
  );
}

function ParamInputs({ anomaly, onAnomaly }) {
  const p = anomaly.params || {};
  const set = (patch) => onAnomaly({ ...anomaly, params: { ...p, ...patch } });
  switch (anomaly.method) {
    case "zscore":
      return (
        <label className="field">
          <span>Порог, σ</span>
          <input type="number" step="0.5" value={p.threshold ?? 3}
            onChange={(e) => set({ threshold: Number(e.target.value) })} />
        </label>
      );
    case "iqr":
      return (
        <label className="field">
          <span>Множитель IQR</span>
          <input type="number" step="0.1" value={p.factor ?? 1.5}
            onChange={(e) => set({ factor: Number(e.target.value) })} />
        </label>
      );
    case "diff":
      return (
        <div className="row">
          <label className="field">
            <span>Порог, σ разности</span>
            <input type="number" step="0.5" value={p.threshold ?? 4}
              onChange={(e) => set({ threshold: Number(e.target.value) })} />
          </label>
          <label className="field">
            <span>Абс. порог (опц.)</span>
            <input type="number" step="any" value={p.abs_threshold ?? ""}
              placeholder="—"
              onChange={(e) => set({ abs_threshold: e.target.value === "" ? null : Number(e.target.value) })} />
          </label>
        </div>
      );
    case "rolling":
      return (
        <div className="row">
          <label className="field">
            <span>Окно (точек)</span>
            <input type="number" step="1" value={p.window ?? 24}
              onChange={(e) => set({ window: Number(e.target.value) })} />
          </label>
          <label className="field">
            <span>Порог, σ</span>
            <input type="number" step="0.5" value={p.threshold ?? 3}
              onChange={(e) => set({ threshold: Number(e.target.value) })} />
          </label>
        </div>
      );
    default:
      return null;
  }
}

function InterpControls({ interp, onInterp, sortX, onSortX, hasTime }) {
  const set = (patch) => onInterp({ ...interp, ...patch });
  return (
    <div className="section">
      <div className="section-title">Очистка / интерполяция</div>
      <label className="inline" style={{ marginBottom: 8 }} title="Упорядочить точки по времени (чинит зигзаги)">
        <input type="checkbox" checked={sortX} disabled={!hasTime}
          onChange={(e) => onSortX(e.target.checked)} />
        сортировать по оси X (время)
      </label>
      <label className="inline" style={{ marginBottom: 6 }}>
        <input type="checkbox" checked={interp.enabled}
          onChange={(e) => set({ enabled: e.target.checked })} />
        линейная интерполяция
      </label>
      {interp.enabled && (
        <div style={{ paddingLeft: 6, borderLeft: "2px solid var(--border)" }}>
          <label className="inline" style={{ marginBottom: 4 }}>
            <input type="checkbox" checked={interp.outliers}
              onChange={(e) => set({ outliers: e.target.checked })} />
            интерполировать выбросы
          </label>
          <label className="inline" style={{ marginBottom: 4 }}>
            <input type="checkbox" checked={interp.gaps}
              onChange={(e) => set({ gaps: e.target.checked })} />
            интерполировать короткие пропуски
          </label>
          {interp.gaps && (
            <div style={{ paddingLeft: 18 }}>
              <div className="row" style={{ marginBottom: 4 }}>
                <label className="inline small" title="Больше скольких подряд">
                  &gt;
                  <input type="number" min="0" step="1" value={interp.gap_min}
                    onChange={(e) => set({ gap_min: Math.max(0, Number(e.target.value)) })} style={{ width: 54 }} />
                </label>
                <label className="inline small" title="И не больше скольких подряд">
                  ≤
                  <input type="number" min="1" step="1" value={interp.gap_max}
                    onChange={(e) => set({ gap_max: Math.max(1, Number(e.target.value)) })} style={{ width: 54 }} />
                </label>
                <span className="small muted" style={{ alignSelf: "center" }}>подряд</span>
              </div>
              <label className="inline small" style={{ marginBottom: 3 }}>
                <input type="checkbox" checked={interp.gap_nan}
                  onChange={(e) => set({ gap_nan: e.target.checked })} /> NaN
              </label>
              <label className="inline small">
                <input type="checkbox" checked={interp.gap_zeros}
                  onChange={(e) => set({ gap_zeros: e.target.checked })} /> нули
              </label>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function Controls({ resample, onResample, anomaly, onAnomaly, anomalyStyle, onAnomalyStyle, flags, onFlags, rolling, onRolling, interp, onInterp, sortX, onSortX, hasTime }) {
  return (
    <>
    <div className="section">
      <div className="section-title">4 · Анализ и агрегация</div>

      <label className="field">
        <span>Ресемплинг {hasTime ? "" : "(нужна ось-время)"}</span>
        <div className="row">
          <select value={resample.rule || ""} disabled={!hasTime}
            onChange={(e) => onResample({ ...resample, rule: e.target.value })}>
            {RESAMPLE_PRESETS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
          </select>
          <select value={resample.agg} disabled={!hasTime || !resample.rule}
            onChange={(e) => onResample({ ...resample, agg: e.target.value })}>
            {AGG_OPTIONS.map((a) => <option key={a.value} value={a.value}>{a.label}</option>)}
          </select>
        </div>
      </label>

      <div className="divider" />

      <label className="field">
        <span>Детект аномалий</span>
        <select value={anomaly.method}
          onChange={(e) => onAnomaly({ method: e.target.value, params: defaultAnomalyParams(e.target.value) })}>
          {ANOMALY_METHODS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
        </select>
      </label>
      <ParamInputs anomaly={anomaly} onAnomaly={onAnomaly} />
      {anomaly.method !== "none" && (
        <AnomalyStyleEditor anomalyStyle={anomalyStyle} onAnomalyStyle={onAnomalyStyle} />
      )}

      <div className="divider" />

      <div className="section-title">Подсветка на графике</div>
      <label className="inline" style={{ marginBottom: 6 }}>
        <input type="checkbox" checked={flags.showNan}
          onChange={(e) => onFlags({ ...flags, showNan: e.target.checked })} />
        <span className="dot" style={{ background: "#e0564d" }} /> участки NaN (пропуски)
      </label>
      <label className="inline" style={{ marginBottom: 6 }}>
        <input type="checkbox" checked={flags.detectZeros}
          onChange={(e) => onFlags({ ...flags, detectZeros: e.target.checked })} />
        <span className="dot" style={{ background: "#e0a144" }} /> участки нулей
      </label>
      <label className="inline">
        <input type="checkbox" checked={flags.showAnnotations}
          onChange={(e) => onFlags({ ...flags, showAnnotations: e.target.checked })} />
        <span className="dot" style={{ background: "#8a5cf6" }} /> ручные отметки
      </label>

      <div className="divider" />

      <div className="section-title">Скользящие статистики</div>
      <label className="inline" style={{ marginBottom: 6 }}>
        <input type="checkbox" checked={rolling.enabled}
          onChange={(e) => onRolling({ ...rolling, enabled: e.target.checked })} />
        показывать скользящее среднее
      </label>
      {rolling.enabled && (
        <div className="row" style={{ alignItems: "center" }}>
          <label className="inline small" title="Окно (точек)">
            окно
            <input type="number" min="2" step="1" value={rolling.window}
              onChange={(e) => onRolling({ ...rolling, window: Math.max(2, Number(e.target.value)) })}
              style={{ width: 64 }} />
          </label>
          <label className="inline small">
            <input type="checkbox" checked={rolling.band}
              onChange={(e) => onRolling({ ...rolling, band: e.target.checked })} />
            коридор ±σ
          </label>
        </div>
      )}
    </div>
    <InterpControls interp={interp} onInterp={onInterp} sortX={sortX} onSortX={onSortX} hasTime={hasTime} />
    </>
  );
}
