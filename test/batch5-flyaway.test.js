import test from "node:test";
import assert from "node:assert/strict";
import { poolLift, POOL_SURFACE } from "../src/sim/pool.js";

function simulate(liftFn, seconds = 20) {
  const pools = [{ key: "0,-150", x: 0, y: -150, floor: -0.25 }];
  const pos = [0, -150, -0.25];
  let vz = 0;
  const dt = 1 / 30;
  let top = pos[2];
  for (let i = 0; i < seconds * 30; i += 1) {
    vz += (-9.81 + liftFn(pools, pos)) * dt;
    vz *= 0.98;
    pos[2] += vz * dt;
    if (pos[2] < -0.25) { pos[2] = -0.25; vz = Math.max(0, vz); }
    top = Math.max(top, pos[2]);
  }
  return top;
}

test("regression: standing in a dug pool does not fly away (autobit, 25 cm)", () => {
  const legacy = (pools, p) => (pools.some((q) => Math.hypot(q.x - p[0], q.y - p[1]) < 0.7) ? 14 : 0);
  assert.ok(simulate(legacy) > 50, "legacy flat lift diverges");
  assert.ok(simulate(poolLift) < POOL_SURFACE + 0.3);
});

test("poolLift is zero above surface and away from pools", () => {
  const pools = [{ x: 0, y: 0 }];
  assert.equal(poolLift(pools, [0, 0, 0.5]), 0);
  assert.equal(poolLift(pools, [5, 0, -1]), 0);
  assert.ok(poolLift(pools, [0, 0, -1]) > 9.81);
});
