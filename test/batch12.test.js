import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { edgeBounces, EDGE_LAST_BOUNCE } from "../src/render/gpu.js";

const gpu = readFileSync(new URL("../src/render/gpu.js", import.meta.url), "utf8");

test("the foveated edge drops the second bounce", () => {
  assert.equal(EDGE_LAST_BOUNCE, 1);
  assert.equal(edgeBounces(0.9), 1);
  assert.equal(edgeBounces(0.1), 4);
  assert.equal(edgeBounces(0.9, true), 4, "a full (non-foveated) trace keeps every bounce");
});

test("shader stops a mirror on the edge's last hop with the sky tint", () => {
  assert.match(gpu, /float edgeT = uFull < 0\.5 \? fovT\(vRay\) : 0\.0;/);
  assert.match(gpu, /mirror < 0\.2 \|\| bounce >= lastBounce/);
});

import { fallFromCount, landingNote, TUCK_SOAK } from "../src/sim/hearth.js";

test("a fall reads a soak you can change: a tucked landing soaks more", () => {
  assert.equal(TUCK_SOAK, 2);
  assert.equal(fallFromCount(100, -12, 3), 95);
  assert.equal(fallFromCount(100, -12, 3, true), 97);
  assert.equal(fallFromCount(100, -12, 9, true), 100, "soak caps at 8, a full fall's hurt");
  assert.equal(fallFromCount(100, -4, 0, true), 100);
  const skills = { landing: { falls: 3 } };
  assert.equal(landingNote(skills), " land 3 soak 3");
  assert.equal(landingNote(skills, true), " land 3 soak 5 tuck");
});
