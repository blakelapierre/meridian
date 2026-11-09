import { createGpuPainter } from "../render/gpu.js?v=105";
import { sceneFromStage } from "../render/stage.js?v=6";
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

self.onmessage = async (event) => {
  const msg = event.data || {};
  if (msg.type === "init") {
    try {
      canvas = wrap(msg.canvas);
      // Say where we are first: building the trace (the land, volcano and cave grids, then one big
      // shader compile) can take a phone tens of seconds, and the page waits on these notes.
      const tier = msg.tier || (msg.lite ? "lite" : "full");
      self.postMessage({ type: "stage", stage: tier === "full" ? "compiling the picture" : `compiling the picture (${tier})` });
      const started = performance.now();
      // Without preventDefault on the loss, the browser never gives the context back.
      try { msg.canvas.addEventListener("webglcontextlost", (e) => e.preventDefault()); } catch {}
      painter = createGpuPainter(canvas, { lite: tier !== "full", tier });
      const d = canvas.dataset;
      const factsNow = () => ({ info: d.gpuInfo || "", caps: d.gpuCaps || "", lite: d.gpuLite === "1", tier: d.gpuTier || "", compileMs: Number(d.gpuCompileMs) || 0, buildMs: Math.round(performance.now() - started), fullError: d.gpuFullError || "", tries: d.gpuTries || "", lost: d.gpuLost === "1" });
      if (!painter && d.gpuLost === "1") {
        // The compile lost the context (a GPU watchdog or out of memory: the log is empty). Wait for
        // the browser to give it back, then start again on the smallest tier.
        const firstReason = d.gpuError || "context lost";
        self.postMessage({ type: "stage", stage: "the GPU reset while compiling; retrying with the core shader" });
        const restored = await new Promise((done) => {
          const timer = setTimeout(() => done(false), 10000);
          try {
            msg.canvas.addEventListener("webglcontextrestored", () => { clearTimeout(timer); done(true); }, { once: true });
          } catch { clearTimeout(timer); done(false); }
        });
        d.gpuError = "";
        d.gpuLost = "";
        if (restored) painter = createGpuPainter(canvas, { lite: true, tier: "core" });
        if (!painter) d.gpuError = `${firstReason} | ${restored ? `core retry: ${d.gpuError || "failed"}` : "the context did not come back in 10 s"}`;
      }
      const facts = factsNow();
      if (!painter) {
        self.postMessage({ type: "error", reason: d.gpuError || "no picture", facts });
        return;
      }
      self.postMessage({ type: "ready", info: facts.info, facts });
      // After the first picture: the full-effects shader (if we booted lite) and then the crowd
      // variant build in the background; tick() swaps each in when it links.
      const say = (state, info) => self.postMessage({ type: "effects", state, log: String(info?.log || "").slice(0, 600), ms: info?.ms || 0, parallel: Boolean(info?.parallel) });
      painter.onEffects?.((state, info) => {
        say(state, info);
        if (state === "full" || state === "failed") setTimeout(() => { try { painter.warm?.(); } catch {} }, 200);
      });
      say(painter.effects?.().state || "full", painter.effects?.());
      setTimeout(() => {
        try {
          if (!(msg.upgrade && painter.upgrade?.())) painter.warm?.();
        } catch {}
      }, 300);
      // Poll the background builds even when no frame is being drawn.
      setInterval(() => { try { painter.tick?.(); } catch {} }, 120);
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

