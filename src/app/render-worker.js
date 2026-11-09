import { createGpuPainter } from "../render/gpu.js?v=98";
import { sceneFromStage } from "../render/stage.js?v=2";
import { cast, project } from "../engine/cast.js";

let painter = null;
let canvas = null;
let atoll = null;
const atollReady = fetch(new URL("../../content/atoll.json?v=1", import.meta.url))
  .then((response) => response.json())
  .then((data) => { atoll = data; })
  .catch(() => null);

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
  } else if (msg.type === "stage") {
    paintStage(msg);
  } else if (msg.type === "paint") {
    const started = performance.now();
    try {
      const ok = painter.paint(msg.scene, msg.width, msg.height);
      if (!ok) self.postMessage({ type: "error", reason: "draw" });
      else self.postMessage({ type: "drew", ms: performance.now() - started });
    } catch (error) {
      self.postMessage({ type: "error", reason: String(error && error.message || error) });
    }
  } else if (msg.type === "present") {
    painter.present?.(msg.blend);
  } else if (msg.type === "smooth") {
    painter.setSmoothing?.(msg.on);
  }
};

function paintStage(msg) {
  const started = performance.now();
  const run = async () => {
    if (!atoll) await atollReady;
    if (!atoll) throw new Error("island");
    const scene = sceneFromStage(msg.stage || {}, atoll);
    const dir = project(0.5, 0.5, scene.camera);
    const hit = cast(scene.camera.origin, dir, scene.objects, scene.miss);
    const color = hit.color || scene.miss;
    let rangeT = null;
    if (msg.stage?.inEyes) {
      const ranged = cast(scene.camera.origin, dir, scene.objects.filter((object) => !object.self), scene.miss);
      rangeT = ranged?.object ? ranged.t : null;
    }
    const look = { color: [color[0], color[1], color[2]], rangeT };
    const ok = painter.paint(scene, msg.width, msg.height);
    if (!ok) self.postMessage({ type: "error", reason: "draw", look });
    else self.postMessage({ type: "drew", ms: performance.now() - started, look });
  };
  run().catch((error) => {
    self.postMessage({ type: "error", reason: String(error && error.message || error) });
  });
}

