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

test("a second witness voting late does not stall the later pits", () => {
  const leader = createTerrain({ identity: createIdentity(), leader: true });
  const second = createTerrain({ identity: createIdentity(), leader: false });
  const follow = createTerrain({ identity: createIdentity(), leader: false });
  const aim = bitAim([0, -150, 0], 0, -1.2);
  for (let step = 0; step < 160; step++) {
    const shift = step * 40;
    leader.dig(
      [aim.eye[0] + shift, aim.eye[1], aim.eye[2]],
      [aim.aim[0] + shift, aim.aim[1], aim.aim[2]],
      { peer: true },
    );
  }
  const nodes = [leader, second, follow];
  for (let turn = 0; turn < 80; turn++) {
    let moved = false;
    for (const node of nodes) {
      const frames = node.take();
      if (!frames.length) continue;
      moved = true;
      for (const other of nodes) {
        if (other === node) continue;
        for (const frame of frames) other.receive(frame);
      }
    }
    if (!moved) break;
  }
  const dug = (terrain) => [...terrain.log.crust.overrides.keys()].sort().join("|");
  assert.ok(leader.log.crust.overrides.size >= 3);
  assert.equal(dug(second), dug(leader));
  assert.equal(dug(follow), dug(leader));
  assert.equal(second.log.seq, leader.log.seq);
  assert.equal(follow.log.seq, leader.log.seq);
});
