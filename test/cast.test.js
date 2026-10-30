import assert from "node:assert/strict";
import test from "node:test";
import { bodiesToObjects, cast, traceColor } from "../src/engine/cast.js";
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

test("a mirror mixes the color the reflection hits", () => {
  const mirror = {
    type: "sphere",
    origin: [0, 0, 0],
    radius: 1,
    color: [0, 0, 0, 1],
    reflectivity: 1,
  };
  const red = {
    type: "sphere",
    origin: [0, -8, 0],
    radius: 1,
    color: [1, 0, 0, 1],
    reflectivity: 0,
  };
  const color = traceColor([0, -4, 0], [0, 1, 0], [mirror, red], [0, 0, 1, 1], 4);
  assert.ok(color[0] > 0.5, color.join(","));
});
