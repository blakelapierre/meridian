import assert from "node:assert/strict";
import test from "node:test";
import { crustMarch } from "../src/engine/cast.js";
import { Crust, brushWrites, seedSampleMm } from "../src/sim/crust.js";

test("the same dig produces the same chunk hash", () => {
  const a = digOnce();
  const b = digOnce();
  assert.deepEqual(a.writes, b.writes);
  assert.deepEqual(a.crust.hash(0, 0, -1), b.crust.hash(0, 0, -1));
});

test("a crust march sees a dug voxel", () => {
  const solid = new Crust();
  const before = crustMarch([0.125, 0.125, 2], [0, 0, -1], solid);
  assert.ok(before);
  const { crust } = digOnce();
  const after = crustMarch([0.125, 0.125, 2], [0, 0, -1], crust);
  assert.ok(after);
  assert.ok(after.point[2] < before.point[2], `${after.point[2]} should be below ${before.point[2]}`);
});

test("seed surface voxel under the origin is solid", () => {
  assert.ok(seedSampleMm(25, 25, -25) < 0);
  assert.ok(seedSampleMm(25, 25, 25) > 0);
});

function digOnce() {
  const crust = new Crust();
  const eye = [25, 25, 165];
  const aim = [25, 25, 15];
  let writes = [];
  for (let n = 0; n < 30 && writes.length === 0; n++) {
    writes = brushWrites(crust, { eye, aim, ticks: 1 });
  }
  assert.ok(writes.length > 0);
  return { crust, writes };
}
