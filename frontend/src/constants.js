// Default categorical palette (color-blind friendly-ish, distinct hues).
export const PALETTE = [
  "#3b6ef5", "#e0564d", "#37936a", "#e0a144", "#8a5cf6",
  "#17a2b8", "#d6478f", "#6b7686", "#2fa84f", "#c9772f",
];

export const CHART_TYPES = [
  { value: "line", label: "Линия" },
  { value: "step", label: "Ступенчатый" },
  { value: "markers", label: "Точки" },
  { value: "line+markers", label: "Линия + точки" },
  { value: "area", label: "Область" },
  { value: "bar", label: "Столбцы" },
];

// How detected anomalies are rendered on the time-series chart.
export const ANOMALY_STYLES = [
  { value: "dot", label: "Точка" },
  { value: "bold-dot", label: "Жирная точка" },
  { value: "open-circle", label: "Кружок" },
  { value: "background", label: "Фоновая полоса" },
];

export const VIEW_MODES = [
  { value: "timeseries", label: "Временной ряд" },
  { value: "distribution", label: "Распределение" },
  { value: "correlation", label: "Корреляция" },
  { value: "spectrum", label: "Спектр / ACF" },
  { value: "windrose", label: "Роза ветров" },
  { value: "missing", label: "Пропуски" },
  { value: "blocks", label: "Длинные блоки" },
  { value: "outliers", label: "Выбросы" },
  { value: "table", label: "Таблица / правки" },
];

export const SPECTRUM_METHODS = [
  { value: "fft", label: "Спектр (FFT)" },
  { value: "acf", label: "Автокорреляция (ACF)" },
];

export const DIST_TYPES = [
  { value: "histogram", label: "Гистограмма" },
  { value: "box", label: "Box-plot" },
  { value: "violin", label: "Violin" },
  { value: "ecdf", label: "ECDF" },
  { value: "qq", label: "Q-Q (норм.)" },
];

export const MISSING_KINDS = [
  { value: "nan", label: "NaN" },
  { value: "zeros", label: "Нули" },
  { value: "both", label: "NaN + нули" },
];

export const CORR_METHODS = [
  { value: "pearson", label: "Пирсон" },
  { value: "spearman", label: "Спирмен" },
  { value: "kendall", label: "Кендалл" },
];

export const DASH_OPTIONS = [
  { value: "solid", label: "Сплошная" },
  { value: "dot", label: "Пунктир" },
  { value: "dash", label: "Штрих" },
  { value: "dashdot", label: "Штрих-пунктир" },
];

export const AGG_OPTIONS = [
  { value: "mean", label: "Среднее" },
  { value: "sum", label: "Сумма" },
  { value: "min", label: "Минимум" },
  { value: "max", label: "Максимум" },
  { value: "median", label: "Медиана" },
  { value: "first", label: "Первое" },
  { value: "last", label: "Последнее" },
];

export const RESAMPLE_PRESETS = [
  { value: "", label: "Без агрегации (сырые)" },
  { value: "1h", label: "1 час" },
  { value: "3h", label: "3 часа" },
  { value: "1D", label: "1 день" },
  { value: "1W", label: "1 неделя" },
  { value: "1ME", label: "1 месяц" },
];

export const ANOMALY_METHODS = [
  { value: "none", label: "Выкл" },
  { value: "zscore", label: "Z-score (σ от среднего)" },
  { value: "iqr", label: "IQR (межквартильный)" },
  { value: "diff", label: "Скачок разности" },
  { value: "rolling", label: "Скользящая медиана" },
];

export function defaultAnomalyParams(method) {
  switch (method) {
    case "zscore": return { threshold: 3.0 };
    case "iqr": return { factor: 1.5 };
    case "diff": return { threshold: 4.0 };
    case "rolling": return { window: 24, threshold: 3.0 };
    default: return {};
  }
}
