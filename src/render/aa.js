// Anti-aliasing for low render scales: decides whether the upscale is smooth (default) or
// the old crisp/pixelated look. ?aa=0|1 overrides and is remembered under "meridian-aa".
export const AA_KEY = "meridian-aa";

export function smoothingFrom(search = "", storage = null) {
  let flag = null;
  try { flag = new URLSearchParams(search).get("aa"); } catch { flag = null; }
  if (flag === "0" || flag === "1") {
    try { storage?.setItem(AA_KEY, flag); } catch { /* no storage */ }
    return flag === "1";
  }
  let saved = null;
  try { saved = storage?.getItem(AA_KEY) ?? null; } catch { saved = null; }
  return saved !== "0";
}

// CSS scaling of the canvas: smooth lets the browser filter too; otherwise keep blocks crisp.
export function canvasRendering(smooth, traceW, displayW) {
  if (smooth) return "auto";
  return traceW >= displayW - 4 ? "auto" : "pixelated";
}
