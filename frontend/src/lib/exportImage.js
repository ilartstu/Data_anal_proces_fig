// Chart image export with explicit pixel size, aspect ratio and DPI.
//
// Plotly renders at a pixel size (width×height); "DPI" is metadata that tells
// an editor the physical print size. We render the raster at the exact pixel
// dimensions the user picked (scale 1) and then write the DPI into the file:
// a pHYs chunk for PNG, the JFIF density fields for JPEG. SVG is vector, so
// only the canvas size matters there.

export const ASPECT_RATIOS = [
  { label: "4:3 (по умолчанию)", w: 4, h: 3 },
  { label: "3:2", w: 3, h: 2 },
  { label: "16:9", w: 16, h: 9 },
  { label: "16:10", w: 16, h: 10 },
  { label: "5:4", w: 5, h: 4 },
  { label: "1:1 (квадрат)", w: 1, h: 1 },
  { label: "21:9 (ультраширокий)", w: 21, h: 9 },
  { label: "A4 альбомная", w: 297, h: 210 },
  { label: "A4 книжная", w: 210, h: 297 },
  { label: "3:4 (вертикаль)", w: 3, h: 4 },
  { label: "9:16 (вертикаль)", w: 9, h: 16 },
  { label: "Свободно", w: 0, h: 0 },           // no ratio lock
];

// ---- byte helpers (big-endian) ----
function wU32(buf, off, v) {
  buf[off] = (v >>> 24) & 0xff; buf[off + 1] = (v >>> 16) & 0xff;
  buf[off + 2] = (v >>> 8) & 0xff; buf[off + 3] = v & 0xff;
}
function rU32(buf, off) {
  return ((buf[off] << 24) | (buf[off + 1] << 16) | (buf[off + 2] << 8) | buf[off + 3]) >>> 0;
}

let _crc = null;
function crcTable() {
  if (_crc) return _crc;
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    t[n] = c >>> 0;
  }
  return (_crc = t);
}
function crc32(bytes) {
  const t = crcTable();
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = t[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function dataUrlToU8(dataUrl) {
  const bin = atob(dataUrl.split(",")[1]);
  const u8 = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
  return u8;
}

// Insert (or leave) a pHYs chunk right after IHDR so the PNG reports `dpi`.
function pngSetDpi(u8, dpi) {
  const ppm = Math.round(dpi / 0.0254);          // pixels per metre
  const insertAt = 8 + 4 + 4 + rU32(u8, 8) + 4;  // sig + IHDR(len+type+data+crc)
  const chunk = new Uint8Array(21);              // 4 len + 4 type + 9 data + 4 crc
  wU32(chunk, 0, 9);
  chunk.set([0x70, 0x48, 0x59, 0x73], 4);        // "pHYs"
  wU32(chunk, 8, ppm); wU32(chunk, 12, ppm);
  chunk[16] = 1;                                 // unit: metre
  wU32(chunk, 17, crc32(chunk.subarray(4, 17))); // crc over type+data
  const out = new Uint8Array(u8.length + chunk.length);
  out.set(u8.subarray(0, insertAt), 0);
  out.set(chunk, insertAt);
  out.set(u8.subarray(insertAt), insertAt + chunk.length);
  return out;
}

// Patch the JFIF density fields (canvas JPEG always starts with an APP0/JFIF).
function jpegSetDpi(u8, dpi) {
  if (u8[0] === 0xff && u8[1] === 0xd8 && u8[2] === 0xff && u8[3] === 0xe0) {
    u8[13] = 1;                                  // units: dots per inch
    u8[14] = (dpi >> 8) & 0xff; u8[15] = dpi & 0xff;
    u8[16] = (dpi >> 8) & 0xff; u8[17] = dpi & 0xff;
  }
  return u8;
}

function save(bytesOrUrl, filename, type) {
  let url, revoke = false;
  if (typeof bytesOrUrl === "string") {
    url = bytesOrUrl;
  } else {
    url = URL.createObjectURL(new Blob([bytesOrUrl], { type })); revoke = true;
  }
  const a = document.createElement("a");
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  if (revoke) setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// Re-encode a dataURL as JPEG at a chosen quality (canvas gives us the knob).
function reencodeJpeg(dataUrl, quality) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const c = document.createElement("canvas");
      c.width = img.naturalWidth; c.height = img.naturalHeight;
      const ctx = c.getContext("2d");
      ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, c.width, c.height);
      ctx.drawImage(img, 0, 0);
      resolve(c.toDataURL("image/jpeg", quality));
    };
    img.onerror = reject;
    img.src = dataUrl;
  });
}

// Clone a chart's figure so rendering never touches the live graph. Layout is
// small → deep-cloned; traces are shallow-cloned (big x/y arrays shared, never
// mutated by Plotly), so the on-screen chart is completely isolated.
//
// WebGL traces (`scattergl`) are snapshotted by Plotly as a 1× bitmap, so a
// higher `scale` only upscales that bitmap — the export stays pixelated. We
// swap them to SVG `scatter` for export, which Plotly rasterizes crisply at
// the target resolution (true high-DPI, not a blur).
function cloneFig(gd, bgOverride, vectorize = false) {
  const data = (gd.data || []).map((t) => {
    const c = { ...t };
    if (vectorize && c.type === "scattergl") c.type = "scatter";
    return c;
  });
  let layout;
  try { layout = JSON.parse(JSON.stringify(gd.layout || {})); }
  catch { layout = { ...(gd.layout || {}) }; }
  if (bgOverride) { layout.paper_bgcolor = bgOverride; layout.plot_bgcolor = bgOverride; }
  return { data, layout };
}

// Render a figure to a data URL in a throwaway off-screen div. The live chart
// is never passed to Plotly.toImage, so exporting can't resize or scramble it.
async function renderDataURL(Plotly, fig, { format, width, height, scale = 1 }) {
  const div = document.createElement("div");
  div.style.cssText = "position:fixed;left:-99999px;top:-99999px;pointer-events:none;";
  document.body.appendChild(div);
  try {
    await Plotly.newPlot(div, fig.data, { ...fig.layout, width, height, autosize: false },
      { staticPlot: true, displayModeBar: false });
    return await Plotly.toImage(div, { format, width, height, scale });
  } finally {
    try { Plotly.purge(div); } catch { /* ignore */ }
    div.remove();
  }
}

// Logical (on-screen "design") canvas fitted to a target aspect — fonts keep
// their on-screen proportion; resolution comes from `scale`.
function logicalSize(gd, W, H) {
  const lw = Math.round(gd._fullLayout?.width) || W;
  const lh = Math.round(gd._fullLayout?.height) || H;
  const long = Math.max(lw, lh) || 1000;
  const ar = W / H;
  return ar >= 1
    ? { logW: long, logH: Math.max(1, Math.round(long / ar)) }
    : { logW: Math.max(1, Math.round(long * ar)), logH: long };
}

// Small PNG preview of a chart for the export dialog.
export async function chartThumbnail(Plotly, gd, maxW = 240) {
  const lw = Math.round(gd._fullLayout?.width) || 480;
  const lh = Math.round(gd._fullLayout?.height) || 320;
  const ar = (lw / lh) || 1.5;
  const w = maxW, h = Math.max(48, Math.round(maxW / ar));
  return renderDataURL(Plotly, cloneFig(gd, "#ffffff"), { format: "png", width: w, height: h, scale: 1 });
}

/**
 * @param Plotly  the Plotly module
 * @param gd      the graph div (gd._fullLayout has the live size)
 * @param opts    { format, width, height, dpi, bg, quality, filename }
 */
export async function downloadChartImage(Plotly, gd, opts) {
  const {
    format = "png", width = 1600, height = 1200, dpi = 300,
    bg = "white", quality = 0.92, filename = "figure",
  } = opts || {};
  const W = Math.max(1, Math.round(width));
  const H = Math.max(1, Math.round(height));
  const { logW, logH } = logicalSize(gd, W, H);

  if (format === "svg") {
    const fig = cloneFig(gd, bg === "transparent" ? "rgba(0,0,0,0)" : null, true);
    const url = await renderDataURL(Plotly, fig, { format: "svg", width: logW, height: logH, scale: 1 });
    save(url, `${filename}.svg`);
    return;
  }

  // scale = requested pixels / logical pixels -> output ≈ W×H, fonts × scale.
  const scale = Math.max(0.1, Math.max(W, H) / Math.max(logW, logH));
  const bgOverride = format === "jpeg"
    ? "#ffffff"
    : (bg === "transparent" ? "rgba(0,0,0,0)" : null);  // null keeps layout's white
  const fig = cloneFig(gd, bgOverride, true);
  const dataUrl = await renderDataURL(Plotly, fig, {
    format: format === "jpeg" ? "jpeg" : "png", width: logW, height: logH, scale,
  });

  if (format === "png") {
    let u8 = dataUrlToU8(dataUrl);
    try { u8 = pngSetDpi(u8, dpi); } catch { /* ship un-tagged on failure */ }
    save(u8, `${filename}.png`, "image/png");
  } else {
    const jpg = await reencodeJpeg(dataUrl, quality);
    const u8 = jpegSetDpi(dataUrlToU8(jpg), dpi);
    save(u8, `${filename}.jpg`, "image/jpeg");
  }
}
