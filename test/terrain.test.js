import assert from "node:assert/strict";
import test from "node:test";
import { cast } from "../src/engine/cast.js";
import { createTerrain } from "../src/net/terrain.js";
import { createIdentity } from "../src/net/identity.js";
import { bitAim } from "../src/sim/bit.js";
import { Crust, CHUNK_VOXELS } from "../src/sim/crust.js";
import { catchUp, signCheckpoint } from "../src/sim/oplog.js";

function exchange(a, b) {
  const frames = a.take();
  for (const frame of frames) b.receive(frame);
}

function hold(terrain, peer) {
  const aim = bitAim([0, -150, 0], 0, -1.2);
  for (let tick = 0; tick < 40; tick++) terrain.dig(aim.eye, aim.aim, { peer });
}

test("looking down digs a darker pit and the solo op replays", () => {
  const terrain = createTerrain({ identity: createIdentity(), leader: true });
  hold(terrain, false);
  assert.equal(terrain.voxel(), 500);
  const write = terrain.write();
  const center = [write.i * 0.5 + 0.25, write.j * 0.5 + 0.25, 1.65];
  const before = cast([0, -150, 2], [0, 0, -1], [{ type: "crust", field: new Crust() }]);
  const after = cast(center, [0, 0, -1], [{ type: "crust", field: terrain.log.crust }]);
  assert.ok(after.point[2] < before.point[2] - 0.2);
  assert.ok(after.color[0] < 0.3);
  const chunk = [Math.floor(write.i / CHUNK_VOXELS), Math.floor(write.j / CHUNK_VOXELS), Math.floor(write.k / CHUNK_VOXELS)];
  const checkpoint = signCheckpoint(createIdentity(), terrain.log, { cell: "atoll-0", chunk, solo: true });
  const joined = catchUp(checkpoint, terrain.log.ops);
  assert.equal(joined.ok, true, joined.reason);
  assert.equal(joined.crust.sampleIndex(write.i, write.j, write.k), 500);
});

test("the other browser applies the same dig", () => {
  const leader = createTerrain({ identity: createIdentity(), leader: true });
  const witness = createTerrain({ identity: createIdentity(), leader: false });
  hold(leader, true);
  exchange(leader, witness);
  exchange(witness, leader);
  exchange(leader, witness);
  assert.equal(leader.voxel(), 500);
  assert.equal(witness.voxel(), 500);
  assert.equal(leader.hash(), witness.hash());
});
