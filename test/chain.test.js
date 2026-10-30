import assert from "node:assert/strict";
import test from "node:test";
import { createIdentity } from "../src/net/identity.js";
import { createTerrain } from "../src/net/terrain.js";
import { decodeBlock, encodeBlock } from "../src/net/blocks.js";
import { bitAim } from "../src/sim/bit.js";
import { decode } from "../src/sim/cbor.js";
import {
  acceptBlock,
  blocksByMiner,
  chainEdits,
  createChain,
  installTip,
  mine,
  prepareBlock,
  tipOf,
  workOf,
} from "../src/sim/chain.js";
import { Crust } from "../src/sim/crust.js";
import { keepOf } from "../src/sim/keeper.js";

function edits() {
  const terrain = createTerrain({ identity: createIdentity(), leader: true });
  const aim = bitAim([0, -150, 0], 0, -1.2);
  for (let step = 0; step < 80; step += 1) terrain.dig(aim.eye, aim.aim, { peer: false });
  return terrain.log.ops.map((op) => {
    const body = decode(op.proposal).body;
    return {
      seq: op.seq,
      eye: body.eye,
      aim: body.aim,
      chunk: body.chunk,
      before: body.before,
      mode: body.mode,
      writes: body.writes,
    };
  });
}

function mined(chain, ops, miner, bits) {
  const parent = tipOf(chain);
  const prepared = prepareBlock({
    parent: parent.block,
    crust: chain.crusts.get(chain.tip),
    ops,
    miner,
    time: parent.block.time + 1,
    bits,
  });
  assert.equal(prepared.ok, true, prepared.reason);
  const found = mine(prepared.block, { limit: 200000 });
  assert.ok(found, "work");
  return found.block;
}

test("a mined block officiates the hole, and a lighter fork does not", () => {
  const ops = edits();
  assert.ok(ops.length >= 2);
  const chain = createChain();
  const light = mined(chain, [ops[0]], "light", 8);
  assert.equal(acceptBlock(chain, light).tip, true);
  const child = mined(chain, [ops[1]], "light", 8);
  assert.equal(acceptBlock(chain, child).tip, true);
  assert.equal(tipOf(chain).block.miner, "light");
  assert.equal(workOf(10) > workOf(8) + workOf(8), true);
  const heavyParent = createChain();
  const heavy = mined(heavyParent, [ops[0]], "heavy", 10);
  assert.equal(acceptBlock(chain, heavy).tip, true);
  assert.equal(tipOf(chain).block.miner, "heavy");
  assert.equal(blocksByMiner(chain, "heavy"), 1);
  assert.equal(blocksByMiner(chain, "light"), 0);
  assert.equal(keepOf({ blocks: blocksByMiner(chain, "heavy") }), 10);
});

test("a block that does not meet its work, or lies about the crust, is refused", () => {
  const [op] = edits();
  const chain = createChain();
  const parent = tipOf(chain);
  const prepared = prepareBlock({
    parent: parent.block,
    crust: chain.crusts.get(chain.tip),
    ops: [op],
    miner: "miner",
    time: 1,
    bits: 8,
  });
  const lazy = { ...prepared.block, nonce: 1, state: prepared.block.state, ops: prepared.block.ops };
  assert.equal(acceptBlock(chain, lazy).reason, "work");
  prepared.block.state = new Uint8Array(32);
  const forged = mine(prepared.block, { limit: 200000 });
  assert.ok(forged);
  assert.equal(acceptBlock(chain, forged.block).reason, "state");
  assert.equal(acceptBlock(chain, { ...parent.block, height: 1, miner: "x", ops: [] }).reason, "empty");
});

test("a signed block round-trips and still has to pass the work check", () => {
  const [op] = edits();
  const identity = createIdentity();
  const chain = createChain();
  const block = mined(chain, [op], [...identity.pubkey].map((byte) => byte.toString(16).padStart(2, "0")).join(""), 8);
  const frame = encodeBlock(identity, block);
  const decoded = decodeBlock(frame);
  assert.equal(decoded.ok, true, decoded.reason);
  assert.equal(acceptBlock(chain, decoded.block).tip, true);
  decoded.block.miner = "someone-else";
  const lied = encodeBlock(identity, decoded.block);
  assert.equal(decodeBlock(lied).reason, "miner");
});

function lone(shift) {
  const terrain = createTerrain({ identity: createIdentity(), leader: true });
  const aim = bitAim([shift, -150, 0], 0, -1.2);
  for (let step = 0; step < 40; step += 1) terrain.dig(aim.eye, aim.aim, { peer: false });
  const op = terrain.log.ops[0];
  const body = decode(op.proposal).body;
  return {
    seq: op.seq,
    eye: body.eye,
    aim: body.aim,
    chunk: body.chunk,
    before: body.before,
    mode: body.mode,
    writes: body.writes,
  };
}

test("the heaviest tip is what a client draws, and a local prediction survives it", () => {
  const left = lone(0);
  const right = lone(80);
  const chain = createChain();
  assert.equal(acceptBlock(chain, mined(chain, [left], "miner", 8)).tip, true);
  const viewer = new Crust();
  const fromChain = new Set();
  viewer.write(1, 2, 3, 500);
  installTip(viewer, chain, fromChain);
  const [i, j, k] = left.writes[0];
  assert.equal(viewer.sampleIndex(i, j, k), 500);
  assert.equal(viewer.sampleIndex(1, 2, 3), 500);
  const heavyParent = createChain();
  assert.equal(acceptBlock(chain, mined(heavyParent, [right], "other", 10)).tip, true);
  installTip(viewer, chain, fromChain);
  assert.equal(viewer.sampleIndex(i, j, k) > 0, false);
  const [u, v, w] = right.writes[0];
  assert.equal(viewer.sampleIndex(u, v, w), 500);
  assert.equal(viewer.sampleIndex(1, 2, 3), 500);
  const numbered = chainEdits(chain, [{ ...left, seq: 99 }, { ...right, seq: 40 }]);
  assert.equal(numbered.length, 1);
  assert.equal(numbered[0].seq, tipOf(chain).block.seq + 1);
  assert.equal(numbered[0].writes[0][0], left.writes[0][0]);
});
