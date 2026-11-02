import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { smoothingFrom, canvasRendering, AA_KEY } from "../src/render/aa.js";

const mem = () => { const m = new Map(); return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)), m }; };

test("smoothing defaults on", () => {
  assert.equal(smoothingFrom("", mem()), true);
  assert.equal(smoothingFrom("", null), true);
});

test("?aa=0/1 overrides and is remembered", () => {
  const s = mem();
  assert.equal(smoothingFrom("?aa=0", s), false);
  assert.equal(s.getItem(AA_KEY), "0");
  assert.equal(smoothingFrom("", s), false);
  assert.equal(smoothingFrom("?aa=1", s), true);
  assert.equal(smoothingFrom("", s), true);
});

test("canvas CSS never pixelates when smoothing", () => {
  assert.equal(canvasRendering(true, 100, 800), "auto");
  assert.equal(canvasRendering(false, 100, 800), "pixelated");
  assert.equal(canvasRendering(false, 798, 800), "auto");
});

test("gpu blit has the smooth edge-aware upscale wired to a uniform", () => {
  const src = readFileSync(new URL("../src/render/gpu.js", import.meta.url), "utf8");
  assert.match(src, /uniform float uSmooth;/);
  assert.match(src, /vec4 smoothUp\(sampler2D tex, vec2 uv\)/);
  assert.match(src, /setSmoothing\(on\)/);
  const main = readFileSync(new URL("../src/app/main.js", import.meta.url), "utf8");
  assert.match(main, /painter\?\.setSmoothing\?\.\(smoothUpscale\)/);
  assert.doesNotMatch(main, /trace\.width >= displayW - 4 \? "auto" : "pixelated"/);
});
