import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { angleBetween, blockLevel, falloff, foveaUniforms, perceivedDetail, perceptionFrom, refreshDue, refreshPeriod, SENSE_DEFAULTS, tracedFraction, tracePriority, withFocus } from "../src/sim/perception.js";
import { budgetScale, createTraceBudget } from "../src/render/pace.js";

const DEG = Math.PI / 180;

test("defaults give sight and hearing with sane numbers", () => {
  const p = perceptionFrom();
  assert.deepEqual(Object.keys(p.senses).sort(), ["hearing", "sight"]);
  assert.equal(p.senses.sight.fovea, SENSE_DEFAULTS.sight.fovea);
  assert.equal(p.senses.sight.period, SENSE_DEFAULTS.sight.period);
  assert.deepEqual([p.focus.x, p.focus.y], [0.5, 0.5]);
});

test("falloff is 0 in the fovea, 1 in the far periphery, and monotonic", () => {
  const s = perceptionFrom().senses.sight;
  assert.equal(falloff(s, 0), 0);
  assert.equal(falloff(s, s.fovea), 0);
  assert.equal(falloff(s, s.fovea + s.falloff + 0.01), 1);
  let last = 0;
  for (let a = 0; a < Math.PI / 2; a += 0.01) {
    const t = falloff(s, a);
    assert.ok(t >= last - 1e-12);
    last = t;
  }
});

test("the fovea traces every tick at full resolution; the periphery is slower and coarser", () => {
  const s = perceptionFrom().senses.sight;
  assert.equal(refreshPeriod(s, 0), 1);
  assert.equal(blockLevel(s, 0), 0);
  assert.equal(tracePriority(s, 0), 1);
  const edge = s.fovea + s.falloff + 0.1;
  assert.equal(refreshPeriod(s, edge), s.period);
  assert.equal(blockLevel(s, edge), s.block);
  assert.ok(Math.abs(tracePriority(s, edge) - 1 / (s.period * 4 ** s.block)) < 1e-12);
});

test("a stable view refines the periphery down to full resolution", () => {
  const s = perceptionFrom().senses.sight;
  const edge = Math.PI / 3;
  assert.equal(blockLevel(s, edge, 0), s.block);
  assert.equal(blockLevel(s, edge, s.block), 0);
  assert.equal(blockLevel(s, edge, 99), 0);
  assert.ok(tracedFraction(s, { refine: 9 }) > tracedFraction(s, { refine: 0 }));
});

test("the traced share is well under the whole picture and grows with a wider fovea", () => {
  const p = perceptionFrom();
  const share = tracedFraction(p.senses.sight);
  assert.ok(share > 0.02 && share < 0.5, share);
  const wide = perceptionFrom({}, { sight: { fovea: 25 * DEG } });
  assert.ok(tracedFraction(wide.senses.sight) > share);
});

test("abilities widen the fovea, speed the periphery, and extend range", () => {
  const fresh = perceptionFrom({ eyesight: 0, focus: 0 }).senses.sight;
  const keen = perceptionFrom({ eyesight: 140, focus: 140 }).senses.sight;
  assert.ok(keen.fovea > fresh.fovea);
  assert.ok(keen.falloff > fresh.falloff);
  assert.ok(keen.period < fresh.period);
  assert.ok(keen.block <= fresh.block);
  assert.ok(keen.range > fresh.range);
  assert.ok(keen.acuity > fresh.acuity);
  const ears = perceptionFrom({ hearing: 140 }).senses.hearing;
  assert.ok(ears.range > perceptionFrom().senses.hearing.range);
});

test("overrides let gear or progression change any sense parameter", () => {
  const scoped = perceptionFrom({}, { sight: { range: 900, period: 1 } });
  assert.equal(scoped.senses.sight.range, 900);
  assert.equal(refreshPeriod(scoped.senses.sight, Math.PI / 2), 1);
});

test("focus can move to an aim or goal point", () => {
  const p = withFocus(perceptionFrom(), { x: 0.3, y: 1.4, dir: [1, 0, 0] });
  assert.equal(p.focus.x, 0.3);
  assert.equal(p.focus.y, 1);
  assert.deepEqual(p.focus.dir, [1, 0, 0]);
  const u = foveaUniforms(p, 2);
  assert.equal(u.x, 0.3);
  assert.equal(u.refine, 2);
  assert.equal(u.fovea, p.senses.sight.fovea);
});

test("perceived detail falls with angle from focus and with distance past range", () => {
  const p = perceptionFrom();
  const centre = perceivedDetail(p, "sight", 0, 10);
  const side = perceivedDetail(p, "sight", Math.PI / 2, 10);
  assert.ok(centre > side && side > 0);
  assert.ok(perceivedDetail(p, "sight", 0, p.senses.sight.range * 0.9) < centre);
  assert.equal(perceivedDetail(p, "sight", 0, p.senses.sight.range + 1), 0);
  assert.equal(perceivedDetail(p, "smell", 0, 1), 0);
});

test("refreshDue: focused things refresh every tick, peripheral ones wait the period", () => {
  const p = perceptionFrom();
  const s = p.senses.sight;
  assert.ok(refreshDue(p, "sight", 0, s.tickMs));
  assert.ok(!refreshDue(p, "sight", Math.PI / 2, s.tickMs));
  assert.ok(refreshDue(p, "sight", Math.PI / 2, s.period * s.tickMs));
  assert.ok(Math.abs(angleBetween([0, 1, 0], [1, 0, 0]) - Math.PI / 2) < 1e-12);
});

test("the shader foveation mirrors the sim math", () => {
  const src = readFileSync(new URL("../src/render/gpu.js", import.meta.url), "utf8");
  assert.match(src, /smoothstep\(uFovea\.x, uFovea\.x \+ uFovea\.y, a\)/);
  assert.match(src, /floor\(1\.0 \+ \(max\(1\.0, uFovea\.z\) - 1\.0\) \* t \+ 0\.5\)/);
  assert.match(src, /exp2\(max\(0\.0, floor\(uFovea\.w \* t \+ 0\.5\) - uRefine\)\)/);
  const main = readFileSync(new URL("../src/app/main.js", import.meta.url), "utf8");
  assert.match(main, /scene\.fovea = \{ \.\.\.foveaUniforms\(perception\)/);
  assert.match(main, /perceptionFrom\(\{\s*eyesight: skills\.eyesight\.value,\s*focus: skills\.focus\.value,\s*hearing: skills\.hearing\.value/);
  // Resolve blends continuously between levels (fovLevel), interpolating corners, with a history mix.
  assert.match(src, /max\(0\.0, uFovea\.w \* t - uRefine\)/);
  assert.match(src, /smoothstep\(0\.0, 1\.0, fract\(level\)\)/);
  assert.match(src, /mix\(rgb, past, uKeep \* t\)/);
});

test("the trace budget sizes the picture by traced pixels and drops at once on a stall", () => {
  assert.equal(budgetScale(0, 16, 1280, 800, 0.2), 0.4);
  const dense = budgetScale(1000, 33, 1280, 800, 1);
  const sparse = budgetScale(1000, 33, 1280, 800, 0.2);
  assert.ok(sparse > dense);
  assert.ok(Math.abs(dense - Math.sqrt((1000 * 33) / (1280 * 800))) < 1e-9);
  assert.equal(budgetScale(1e9, 33, 1280, 800, 0.2), 1);
  const budget = createTraceBudget(100000);
  budget.note(100000, 10, 33);
  assert.ok(Math.abs(budget.pixels - 150000) < 1e-6);
  // One slow frame is treated as jitter; two in a row is a stall and cuts to a quarter at once.
  budget.note(100000, 200, 33);
  assert.ok(budget.pixels >= 50000, budget.pixels);
  budget.note(100000, 200, 33);
  assert.ok(Math.abs(budget.pixels - 25000) < 1e-6, budget.pixels);
  // Fixed overhead does not drive the picture to the floor: 41 ms of overhead, 1 ms of tracing, still climbs.
  const fixed = createTraceBudget(600);
  let small = 600;
  for (let i = 0; i < 5; i += 1) small = fixed.note(small, 41 + small / 3000, 66);
  assert.ok(small > 600, small);
  // Even pinned at the smallest size with only fixed cost over budget, it probes upward instead of sticking.
  const pinned = createTraceBudget(500);
  let tiny = 500;
  for (let i = 0; i < 8; i += 1) tiny = pinned.note(tiny, 76 + tiny / 3000, 66);
  assert.ok(tiny > 500, tiny);
  // A 700 ms stall cuts traced pixels to a quarter at once, then keeps cutting until frames fit.
  const stalled = createTraceBudget(1280 * 800 * 0.2);
  const cost = (px) => 8 + px / 300; // ms at 300 traced px/ms
  let px = stalled.pixels;
  for (let i = 0; i < 6; i += 1) px = stalled.note(px, cost(px), 66);
  assert.ok(cost(px) <= 66 * 1.5, cost(px));
  const s = stalled.scale({ displayW: 1280, displayH: 800, fraction: 0.2 });
  assert.ok(Math.abs(1280 * 800 * s * s * 0.2 - px) < 1 || s === 1 || s === 0.08);
});
