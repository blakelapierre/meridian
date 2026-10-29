import assert from "node:assert/strict";
import test from "node:test";
import { createDemo } from "../src/engine/demo.js";
import { runTicks, snapshot } from "../src/engine/physics.js";

test("two demo runs with the same inputs stay identical", () => {
  const a = createDemo();
  const b = createDemo();
  runTicks(a, 200);
  runTicks(b, 200);
  assert.deepEqual(snapshot(a), snapshot(b));
  assert.equal(a.universe.length, 5);
});

test("the moon is still bound after a slice of the inner orbit", () => {
  const state = createDemo();
  const host = state.universe[3];
  const moon = state.universe[4];
  const start = Math.hypot(
    moon.position[0] - host.position[0],
    moon.position[1] - host.position[1],
    moon.position[2] - host.position[2],
  );
  runTicks(state, 20000);
  assert.equal(state.universe.includes(moon), true);
  assert.equal(state.universe.includes(host), true);
  const distance = Math.hypot(
    moon.position[0] - host.position[0],
    moon.position[1] - host.position[1],
    moon.position[2] - host.position[2],
  );
  assert.ok(distance > start * 0.5 && distance < start * 2, `moon drifted to ${distance}`);
});
