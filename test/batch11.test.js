import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createMotionGovernor, MOTION_FLOOR } from "../src/render/pace.js";

const run = (gov, gaps, start = 1) => { let s = gov.step({ gap: 0, refresh: 1000 / 60, start }); const out = [s]; for (const g of gaps) out.push(s = gov.step({ gap: g, refresh: 1000 / 60 })); return out; };

test("steady 60 fps while moving keeps full resolution", () => {
  const out = run(createMotionGovernor(), Array(300).fill(16.7), 1);
  assert.equal(Math.min(...out), 1);
});

test("starting a move from a high still scale does not collapse", () => {
  const out = run(createMotionGovernor(), Array(120).fill(16.6), 0.9);
  assert.ok(Math.min(...out) >= 0.9, Math.min(...out));
});

test("an occasional frame spike only nudges the scale", () => {
  const gaps = Array(200).fill(16.7); gaps[50] = 120; gaps[120] = 80;
  const out = run(createMotionGovernor(), gaps, 1);
  assert.ok(Math.min(...out) >= 0.85, Math.min(...out));
  assert.equal(out.at(-1), 1);
});

test("30 fps on a 60 Hz screen steps down gently and never below the floor", () => {
  const out = run(createMotionGovernor(), Array(200).fill(33), 1);
  for (let i = 1; i < out.length; i += 1) assert.ok(out[i] >= out[i - 1] * 0.85 - 1e-9);
  assert.ok(Math.min(...out) >= MOTION_FLOOR);
});

test("only sustained very poor fps goes below the floor", () => {
  const out = run(createMotionGovernor(), Array(200).fill(150), 1);
  assert.ok(out.at(-1) < MOTION_FLOOR && out.at(-1) >= 0.25);
});

test("recovers once frames keep up again", () => {
  const gov = createMotionGovernor();
  run(gov, Array(80).fill(30), 1);
  const low = gov.scale;
  for (let i = 0; i < 200; i += 1) gov.step({ gap: 14, refresh: 1000 / 60 });
  assert.ok(gov.scale > low && gov.scale === 1);
});

test("main.js steers moving resolution with the governor", () => {
  const main = readFileSync(new URL("../src/app/main.js", import.meta.url), "utf8");
  assert.match(main, /motionRes\.step\(\{ gap: decision\.gap/);
  assert.match(main, /pace\.js\?v=89/);
});
