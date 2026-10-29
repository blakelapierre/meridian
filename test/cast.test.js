import assert from "node:assert/strict";
import test from "node:test";
import { bodiesToObjects, cast } from "../src/engine/cast.js";
import { createDemo } from "../src/engine/demo.js";

test("a ray through the sun hits the sun", () => {
  const state = createDemo();
  const sun = state.universe[0];
  const origin = [sun.position[0], sun.position[1], sun.position[2] - sun.size * 4];
  const hit = cast(origin, [0, 0, 1], bodiesToObjects(state.universe));
  assert.equal(hit.object.body, sun);
  assert.ok(hit.t > 0 && hit.t < sun.size * 4);
});

test("a ray that misses the system does not hit", () => {
  const state = createDemo();
  const hit = cast([0, 800, 0], [0, 1, 0], bodiesToObjects(state.universe));
  assert.equal(hit.object, null);
});
