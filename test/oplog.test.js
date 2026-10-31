import assert from "node:assert/strict";
import test from "node:test";
import { decode, encode } from "../src/sim/cbor.js";
import { appendOp, catchUp, chooseFork, createLog, sealOp, signCheckpoint, signProposal, signVote, terrainBody } from "../src/sim/oplog.js";
import { createIdentity } from "../src/net/identity.js";

function dig(crust, write, nonce, identity) {
  const edit = {
    cell: "atoll-0",
    eye: [25, 25, 165],
    aim: [write.i * 50 + 25, write.j * 50 + 25, write.k * 50 + 25],
    chunk: [0, 0, -1],
    before: crust.hash(0, 0, -1),
    mode: "dig",
    writes: [write],
  };
  return signProposal(identity, { cell: "atoll-0", nonce, body: terrainBody(edit) });
}

test("canonical cbor round-trips a terrain body", () => {
  const body = terrainBody({
    cell: "atoll-0",
    chunk: [0, 0, -1],
    before: new Uint8Array(32).fill(7),
    mode: "dig",
    eye: [25, 25, 165],
    aim: [25, 25, -25],
    writes: [{ i: 0, j: 0, k: -1, sdf_mm: 250 }],
  });
  const bytes = encode(body);
  assert.deepEqual(Buffer.from(encode(body)), Buffer.from(bytes));
  const back = decode(bytes);
  assert.equal(back.chunk[2], -1);
  assert.equal(back.writes[0][3], 250);
  assert.equal(back.before.length, 32);
});

test("a joiner replays the checkpoint and the suffix to the same hole", () => {
  const leader = createIdentity();
  const witness = createIdentity();
  const other = createIdentity();
  const log = createLog();
  const first = sealOp({
    leader,
    proposal: dig(log.crust, { i: 0, j: 0, k: -1, sdf_mm: 250 }, 1, leader),
    seq: 1,
    tick: 30,
    votes: [signVote(witness, 1, true), signVote(other, 1, false)],
  });
  assert.equal(appendOp(log, first, 3).ok, true);
  const checkpoint = signCheckpoint(leader, log, { cell: "atoll-0", chunk: [0, 0, -1], solo: false });
  const second = sealOp({
    leader,
    proposal: dig(log.crust, { i: 1, j: 0, k: -1, sdf_mm: 250 }, 2, leader),
    seq: 2,
    tick: 60,
    votes: [signVote(witness, 2, true)],
  });
  assert.equal(appendOp(log, second, 3).ok, true);
  const joined = catchUp(checkpoint, [first, second]);
  assert.equal(joined.ok, true);
  assert.equal(joined.crust.sampleIndex(0, 0, -1), 250);
  assert.equal(joined.crust.sampleIndex(1, 0, -1), 250);
  assert.equal(Buffer.compare(joined.crust.hash(0, 0, -1), log.crust.hash(0, 0, -1)), 0);

  const alone = createLog();
  const solo = sealOp({
    leader,
    proposal: dig(alone.crust, { i: 2, j: 0, k: -1, sdf_mm: 250 }, 9, leader),
    seq: 1,
    tick: 30,
    solo: true,
  });
  assert.equal(appendOp(alone, solo, 1).ok, true);
  const rewritten = catchUp(checkpoint, [solo]);
  assert.equal(rewritten.reason, "hash");
  const child = { checkpoint, tip: log.crust.hash(0, 0, -1) };
  const fork = { checkpoint: signCheckpoint(leader, alone, { cell: "atoll-0", chunk: [0, 0, -1], solo: true }), tip: alone.crust.hash(0, 0, -1) };
  assert.equal(chooseFork(child, fork), child);
  assert.equal(chooseFork(fork, child), child);
});

test("one signed vote is not a quorum of three", () => {
  const leader = createIdentity();
  const log = createLog();
  const broken = signVote(createIdentity(), 1, true);
  broken.sig[0] ^= 0xff;
  const op = sealOp({
    leader,
    proposal: dig(log.crust, { i: 0, j: 0, k: -1, sdf_mm: 250 }, 1, leader),
    seq: 1,
    tick: 30,
    votes: [broken],
  });
  assert.equal(appendOp(log, op, 3).reason, "cert");
  assert.equal(log.crust.sampleIndex(0, 0, -1) <= 0, true);
});
