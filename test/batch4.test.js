import assert from "node:assert/strict";
import test from "node:test";
import { CELL_FLOOR_WIDTH, cellCap } from "../src/render/gpu.js";
import { blurRadius, perceptionFrom, sampleDensity } from "../src/sim/perception.js";
import { createWear, decayWear, mergeWear, packWear, stepWear, takeWearBatches, unpackWear, wearAt, wearStage, WEAR_BATCH, WORN_AT, PATH_AT } from "../src/sim/wear.js";
import { Crust, DIG_SAMPLE_MM, VOXEL_CM, VOXEL_CM3, columnFloor } from "../src/sim/crust.js";
import { WORLD_VERSION, loadWorld, migrateWorld, saveWorld } from "../src/sim/persist.js";

test("blur radius is continuous in angle: no step anywhere from fovea to edge", () => {
  const sight = perceptionFrom({ eyesight: 10, focus: 10 }).senses.sight;
  let last = blurRadius(sight, 0);
  let biggest = 0;
  for (let a = 0.001; a <= Math.PI / 2; a += 0.001) {
    const r = blurRadius(sight, a);
    biggest = Math.max(biggest, Math.abs(r - last));
    last = r;
  }
  assert.ok(biggest < 0.05, `largest per-mrad jump ${biggest}`);
  assert.ok(sampleDensity(sight, 1.2) < sampleDensity(sight, 0));
});

test("cell cap floors coarseness at low trace sizes but still follows skill", () => {
  assert.equal(CELL_FLOOR_WIDTH, 160);
  assert.equal(cellCap(228, 3), 1.5);
  assert.ok(cellCap(1920, 4) > cellCap(380, 4));
  assert.equal(cellCap(4000, 1), 2);
});

test("footsteps wear grass to dirt to path; decay heals it; merge is max-wins", () => {
  const wear = createWear();
  for (let n = 0; n < 40; n += 1) stepWear(wear, 1.1, 2.2);
  const level = wearAt(wear, 1.1, 2.2);
  assert.ok(level > PATH_AT);
  assert.equal(wearStage(0), 0);
  assert.equal(wearStage(WORN_AT), 1);
  assert.equal(wearStage(255), 2);
  const batches = takeWearBatches(wear);
  assert.ok(batches.every((b) => b.length <= WEAR_BATCH * 3));
  const peer = createWear();
  for (const b of batches) mergeWear(peer, b);
  for (const b of batches) assert.equal(mergeWear(peer, b), 0);
  assert.equal(wearAt(peer, 1.1, 2.2), level);
  assert.deepEqual(packWear(unpackWear(packWear(peer))), packWear(peer));
  decayWear(peer, 255);
  assert.equal(peer.cells.size, 0);
});

test("voxels are 25 cm with derived constants", () => {
  assert.equal(VOXEL_CM, 25);
  assert.equal(VOXEL_CM3, 15625);
  assert.equal(DIG_SAMPLE_MM, 250);
  const crust = new Crust();
  crust.overrides.set("4,4,-3", DIG_SAMPLE_MM);
  assert.equal(columnFloor(crust, 1.1, 1.1), -0.75);
});

test("v1 world saves migrate to 25 cm voxels and drop voxel-indexed frames", () => {
  const store = new Map();
  store.set("w", JSON.stringify({ blocks: [{ x: 1 }], frames: ["03aa", "0bcc", "09dd"], sheets: {}, crust: [["2,3,-1", 500]] }));
  const world = loadWorld(store, "w");
  assert.equal(world.version, WORLD_VERSION);
  assert.equal(world.crust.length, 8);
  assert.ok(world.crust.every(([, s]) => s === 250));
  assert.deepEqual(world.crust.map(([k]) => k).sort(), ["4,6,-1", "4,6,-2", "4,7,-1", "4,7,-2", "5,6,-1", "5,6,-2", "5,7,-1", "5,7,-2"]);
  assert.deepEqual(world.frames, ["09dd"]);
  assert.deepEqual(world.blocks, []);
  const crust = new Crust();
  for (const [k, s] of world.crust) crust.overrides.set(k, s);
  assert.equal(columnFloor(crust, 1.1, 1.6), -0.5);
  saveWorld(store, world, "w");
  assert.equal(JSON.parse(store.get("w")).version, 2);
  assert.equal(migrateWorld(world), world);
});
