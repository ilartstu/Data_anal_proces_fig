// Thin API client. All endpoints are served under /api (proxied in dev,
// served by nginx in the production image).
const BASE = "/api";

async function post(path, body) {
  const res = await fetch(BASE + path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const detail = await res.json().catch(() => ({}));
    throw new Error(detail.detail || `${res.status} ${res.statusText}`);
  }
  return res.json();
}

export async function uploadFile(file) {
  const fd = new FormData();
  fd.append("file", file);
  const res = await fetch(BASE + "/upload", { method: "POST", body: fd });
  if (!res.ok) {
    const detail = await res.json().catch(() => ({}));
    throw new Error(detail.detail || `Upload failed: ${res.status}`);
  }
  return res.json();
}

export const previewSheet = (b) => post("/preview", b);
export const inspect = (b) => post("/inspect", b);
export const fetchSeries = (b) => post("/series", b);
export const fetchCorrelation = (b) => post("/correlation", b);
export const fetchBlocks = (b) => post("/blocks", b);
export const fetchSpectrum = (b) => post("/spectrum", b);
export const fetchMissing = (b) => post("/missing", b);
export const fetchRows = (b) => post("/rows", b);
export const fetchOutliers = (b) => post("/outliers", b);
export const combine = (b) => post("/combine", b);
export const reset = (b) => post("/reset", b);

async function download(path, body, fallback) {
  const res = await fetch(BASE + path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Export failed: ${res.status}`);
  const blob = await res.blob();
  const cd = res.headers.get("Content-Disposition") || "";
  const m = cd.match(/filename="?([^"]+)"?/);
  return { blob, filename: m ? m[1] : fallback };
}
export const exportStats = (b) => download("/export/stats", b, "stats");

export async function exportData(body) {
  const res = await fetch(BASE + "/export/data", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Export failed: ${res.status}`);
  const blob = await res.blob();
  const cd = res.headers.get("Content-Disposition") || "";
  const m = cd.match(/filename="?([^"]+)"?/);
  return { blob, filename: m ? m[1] : "export" };
}
