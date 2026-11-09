import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createMotionGovernor, minFpsFrom, MIN_FPS } from "../src/render/pace.js";

// Simulated device: frame time grows with traced pixels (scale^2) at a given full-res cost.
const sim = (gov, fullMs, frames, start = 1) => {
  let s = gov.step({ gap: 0, start }); const out = [s];
  for (let i = 0; i < frames; i += 1) out.push(s = gov.step({ gap: Math.max(16.7, fullMs * s * s) }));
  return out;
};

test("default minimum is 12 fps, not vsync", () => {
  assert.equal(MIN_FPS, 12);
  assert.ok(Math.abs(createMotionGovernor().budget - 1000 / 12) < 1e-9);
});

test("60 fps and 20 fps at full res both stay at full res while moving", () => {
  for (const ms of [16.7, 50]) assert.equal(Math.min(...sim(createMotionGovernor(), ms, 400)), 1);
});

test("keeps the still resolution as the ceiling", () => {
  assert.equal(Math.max(...sim(createMotionGovernor(), 16.7, 300, 0.8)), 0.8);
});

test("10 fps at full res steps down gently until it holds 12 fps", () => {
  const out = sim(createMotionGovernor(), 100, 300);
  for (let i = 1; i < out.length; i += 1) assert.ok(out[i] >= out[i - 1] * 0.8 - 1e-9);
  const s = out.at(-1);
  assert.ok(s < 1 && s > 0.75, s);
  assert.ok(100 * s * s <= 1000 / 12);
});

test("does not oscillate near the 12 fps line", () => {
  const out = sim(createMotionGovernor(), 100, 600).slice(300);
  assert.ok(Math.max(...out) - Math.min(...out) < 0.05);
});

test("drops below 0.5 only if 0.5 cannot hold 12 fps", () => {
  assert.ok(sim(createMotionGovernor(), 300, 400).at(-1) >= 0.5);
  const s = sim(createMotionGovernor(), 1000, 600).at(-1);
  assert.ok(s < 0.5 && 1000 * s * s <= 1000 / 12 + 1, s);
});

test("isolated slow frames do not drop resolution", () => {
  const gov = createMotionGovernor(); gov.step({ start: 1 });
  for (let i = 0; i < 200; i += 1) gov.step({ gap: i % 40 === 0 ? 200 : 30 });
  assert.equal(gov.scale, 1);
});

test("recovers to max once headroom returns", () => {
  const gov = createMotionGovernor(); gov.step({ start: 1 });
  for (let i = 0; i < 60; i += 1) gov.step({ gap: 150 });
  const low = gov.scale; assert.ok(low < 1);
  for (let i = 0; i < 300; i += 1) gov.step({ gap: 40 });
  assert.equal(gov.scale, 1);
});

test("?minfps= is configurable and falls back to stored then 12", () => {
  assert.equal(minFpsFrom("20", "8"), 20);
  assert.equal(minFpsFrom(null, "8"), 8);
  assert.equal(minFpsFrom("abc", null), 12);
  assert.ok(Math.abs(createMotionGovernor({ minFps: 20 }).budget - 50) < 1e-9);
});

test("main.js uses the min-fps budget for motion, not vsync", () => {
  const main = readFileSync(new URL("../src/app/main.js", import.meta.url), "utf8");
  assert.match(main, /motionRes\.step\(\{ gap: decision\.gap, start: stillShownScale \}\)/);
  assert.match(main, /settled \? STILL_FRAME_MS : motionRes\.budget/);
  assert.match(main, /pace\.js\?v=91/);
});
