import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { CORE_STUBS, GEO_STUBS, SPLIT_PASSES, coreShader, createGpuPainter, glslFunctions, minifyGlsl, passShader } from "../src/render/gpu.js";
import { openPicture, pictureMode } from "../src/app/picture.js";

const PHONE = "Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36";
const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");

// A WebGL2 stand-in that compiles everything and keeps each shader source it was given.
function captureSources(options) {
  const srcs = [];
  const any = () => new Proxy(function () {}, { get: (t, k) => (k === "then" ? undefined : any()), apply: () => 1 });
  const gl = new Proxy({}, {
    get(t, k) {
      if (k === "shaderSource") return (s, src) => srcs.push(src);
      if (k === "getParameter") return (p) => (p === 0x8872 ? 32 : p === 0x0d33 ? 8192 : p === 0x8dfd ? 1024 : "fake");
      if (k === "getShaderPrecisionFormat") return () => ({ precision: 23, rangeMin: 127, rangeMax: 127 });
      if (k === "getExtension") return () => null;
      if (k === "getShaderParameter" || k === "getProgramParameter") return () => true;
      if (k === "isContextLost") return () => false;
      if (typeof k === "string" && /^[A-Z_0-9]+$/.test(k)) return { MAX_TEXTURE_IMAGE_UNITS: 0x8872, MAX_TEXTURE_SIZE: 0x0d33, MAX_FRAGMENT_UNIFORM_VECTORS: 0x8dfd }[k] ?? 1;
      return () => any();
    },
  });
  const canvas = { width: 160, height: 90, dataset: {}, getContext: () => gl, addEventListener() {} };
  try { createGpuPainter(canvas, options); } catch {}
  return srcs.filter((s) => !s.includes("gl_Position"));
}

test("minifyGlsl drops comments, indentation and blank lines, and keeps each line's code", () => {
  const src = "#version 300 es\n// a note\nfloat f(float x) {\n    // inside\n    return x  *  2.0; // trailing\n}\n\n\nvoid main() {}\n";
  assert.equal(minifyGlsl(src), "#version 300 es\nfloat f(float x) {\nreturn x * 2.0;\n}\nvoid main() {}");
});

test("the geo trace keeps the cave and castle geometry that core stubs out", () => {
  for (const name of ["underDist", "underKind", "eyeInCave"]) {
    assert.ok(CORE_STUBS[name], `core stubs ${name}`);
    assert.equal(GEO_STUBS[name], undefined, `geo keeps ${name}`);
  }
  const src = "float underDist(vec3 p) { return length(p) - 1.0; }\nfloat volcSurface(vec3 p) { return 2.0; }\nvoid main() { float d = underDist(vec3(0.0)) + volcSurface(vec3(1.0)); }";
  assert.match(coreShader(src, "geo"), /return length\(p\) - 1\.0;/);
  assert.doesNotMatch(coreShader(src, "core"), /return length\(p\) - 1\.0;/);
});

test("the split picture: five effects, the trace's main swapped for each pass's, each pass far below 50k chars", () => {
  assert.deepEqual(SPLIT_PASSES.map((p) => p.name), ["geo", "lava", "under", "air", "shimmer"]);
  for (const p of SPLIT_PASSES) assert.ok(p.label.length > 3);
  const full = captureSources({ lite: false, tier: "full" }).sort((a, b) => b.length - a.length)[0];
  assert.ok(full && full.length > 50000, "the full trace source");
  assert.match(full, /layout\(location = 1\) out vec4 gOut;/, "the trace has a G-buffer output");
  assert.match(full, /if \(uRaw > 0\.5\) \{/);
  const must = { lava: /volcSurface\(/, under: /caveShade\(|iceShade\(/, air: /withFog\(/, shimmer: /heatShimmer\(/ };
  for (const name of ["lava", "under", "air", "shimmer"]) {
    const src = passShader(full, name);
    assert.ok(src.length > 1000 && src.length < 40000, `${name}: ${src.length} chars`);
    assert.doesNotMatch(src, /gOut/, `${name}: one output`);
    assert.doesNotMatch(src, /uRaw > 0\.5/, `${name}: not the trace's main`);
    assert.match(src, /passKeep\(\);/, `${name}: the trace's foveated discard`);
    assert.match(src, /uniform sampler2D uIn;/);
    assert.match(src, must[name]);
    assert.equal(glslFunctions(src).filter((fn) => fn.name === "main").length, 1);
    assert.doesNotMatch(src, /^\s*\/\//m, `${name}: minified`);
  }
  assert.equal(passShader(full, "nope"), "");
});

test("?gl=split boots on the geo trace and builds the passes; a remembered tier reaches the thread unless ?gl= is set", () => {
  assert.deepEqual([pictureMode("?gl=split", PHONE).tier, pictureMode("?gl=split", PHONE).upgrade], ["geo", true]);
  const made = [];
  class FakeWorker {
    static moduleProbe = true;
    constructor() { this.sent = []; made.push(this); }
    postMessage(msg) { this.sent.push(msg); }
    terminate() {}
    say(msg) { this.onmessage?.({ data: msg }); }
  }
  const canvas = () => ({ transferControlToOffscreen: () => ({ offscreen: true }) });
  const hint = { gpu: "ANGLE (ARM, Mali-G715)", tier: "geo" };
  const opened = openPicture(canvas(), { search: "", WorkerImpl: FakeWorker, ua: PHONE, deadlineMs: 5000, hint });
  assert.deepEqual(made[0].sent[0].hint, hint);
  openPicture(canvas(), { search: "?gl=lite", WorkerImpl: FakeWorker, ua: PHONE, deadlineMs: 5000, hint });
  assert.equal(made[1].sent[0].hint, null, "?gl= wins over the memory");
  made[0].say({ type: "effects", state: "loading", done: 3, total: 5, on: ["geo", "lava", "under"], building: "fog, smoke and ash" });
  assert.deepEqual([opened.painter.effects().done, opened.painter.effects().total, opened.painter.effects().building], [3, 5, "fog, smoke and ash"]);
  for (const w of made) w.terminate();
});

test("the split is wired: G-buffer targets, one pass compile at a time, the uniforms replayed, progress shown, the tier remembered", () => {
  const gpu = read("../src/render/gpu.js");
  const worker = read("../src/app/render-worker.js");
  const main = read("../src/app/main.js");
  assert.match(gpu, /const TIERS = \["full", "lite", "geo", "core", "bare"\];/);
  assert.match(gpu, /EXT_color_buffer_float/);
  assert.match(gpu, /const passOrder = \[/);
  assert.match(gpu, /const tickSplit = /);
  assert.match(gpu, /const runPasses = /);
  assert.match(gpu, /if \(tier !== "lite"\) return startSplit\(\);/);
  assert.match(gpu, /U\("uniform1f", "uRaw", rawTrace \? 1 : 0\)/);
  assert.match(gpu, /wantTree/, "the crowd variant waits for a crowd on small tiers");
  assert.match(worker, /hint: msg\.hint \|\| null/);
  assert.match(worker, /done: info\?\.done \|\| 0, total: info\?\.total \|\| 0/);
  assert.match(main, /effects\$\{count\} on · building \$\{e\.building \|\| "the next one"\}…/);
  assert.match(main, /const GPU_TIER_KEY = "meridian\.gpuTier";/);
  assert.match(main, /rememberTier\(/);
  assert.match(main, /\(remembered for this GPU\)/);
  assert.match(main, /split passes: /);
});
