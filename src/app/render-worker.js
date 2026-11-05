import { createGpuPainter } from "../render/gpu.js?v=96";

let painter = null;
let canvas = null;

function wrap(offscreen) {
  const dataset = {};
  return new Proxy(offscreen, {
    get(target, key) {
      if (key === "dataset") return dataset;
      const value = Reflect.get(target, key);
      return typeof value === "function" ? value.bind(target) : value;
    },
    set(target, key, value) {
      if (key === "dataset") return true;
      target[key] = value;
      return true;
    },
  });
}

self.onmessage = (event) => {
  const msg = event.data || {};
  if (msg.type === "init") {
    try {
      canvas = wrap(msg.canvas);
      painter = createGpuPainter(canvas);
      if (!painter) {
        self.postMessage({ type: "error", reason: canvas.dataset.gpuError || "no picture" });
        return;
      }
      self.postMessage({ type: "ready", info: canvas.dataset.gpuInfo || "" });
    } catch (error) {
      self.postMessage({ type: "error", reason: String(error && error.message || error) });
    }
    return;
  }
  if (!painter) return;
  if (msg.type === "size") {
    if (canvas.width !== msg.width) canvas.width = msg.width;
    if (canvas.height !== msg.height) canvas.height = msg.height;
  } else if (msg.type === "paint") {
    const ok = painter.paint(msg.scene, msg.width, msg.height);
    if (!ok) self.postMessage({ type: "error", reason: "draw" });
  } else if (msg.type === "present") {
    painter.present?.(msg.blend);
  } else if (msg.type === "smooth") {
    painter.setSmoothing?.(msg.on);
  }
};
