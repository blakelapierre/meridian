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
