// Batch 19: networked P2 (witnessed hits) and P3 (late joiner rebuilds a dug trench).
// Peers talk over createLoopbackPair channels (latency + jitter), the same RTCDataChannel shape
// the game uses, so these run in node without WebRTC.
import assert from "node:assert/strict";
import test from "node:test";
import { cast } from "../src/engine/cast.js";
import { createLoopbackPair } from "../src/net/loopback.js";
import { createIdentity } from "../src/net/identity.js";
import { encodeShot } from "../src/net/shots.js";
import { createTerrain } from "../src/net/terrain.js";
import { createShotTally, witnessBallot } from "../src/net/witness.js";
import { bitAim } from "../src/sim/bit.js";
import { decode, encode } from "../src/sim/cbor.js";
import { applyDummyHit, classifyDummy } from "../src/sim/fire.js";
import { catchUp, signCheckpoint } from "../src/sim/oplog.js";

const settle = (ms = 60) => new Promise((done) => setTimeout(done, ms));
const hex = (bytes) => [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
const bytesOf = (data) => (typeof data === "string" ? data : new Uint8Array(data));

// A mesh of named peers joined by loopback channels.
function mesh(names, opts = { latencyMs: 5, jitterMs: 10 }) {
  const links = new Map(names.map((n) => [n, new Map()]));
  const inbox = new Map(names.map((n) => [n, []]));
  for (let a = 0; a < names.length; a++) {
    for (let b = a + 1; b < names.length; b++) {
      const [x, y] = createLoopbackPair(opts);
      links.get(names[a]).set(names[b], x);
      links.get(names[b]).set(names[a], y);
      x.onmessage = (e) => inbox.get(names[a]).push({ from: names[b], data: bytesOf(e.data) });
      y.onmessage = (e) => inbox.get(names[b]).push({ from: names[a], data: bytesOf(e.data) });
    }
  }
  return {
    send: (from, to, data) => links.get(from).get(to).send(data),
    broadcast: (from, data) => { for (const ch of links.get(from).values()) ch.send(data); },
    drain: (name) => inbox.get(name).splice(0),
  };
}

// ---------- P2 ----------
const DUMMY = { type: "sphere", origin: [10, 0, 0.9], radius: 0.35, color: [1, 0, 0, 1], body: "dummy" };
const objects = [DUMMY];
const SHOOTER_AT = [0, 0];
const EYE = [0, 0, 1.65];
const unit = (v) => { const l = Math.hypot(...v); return v.map((c) => c / l); };
const AT_DUMMY = unit([10, 0, 0.9 - 1.65]);
const AWAY = unit([0, 1, 0]);

function honestHitbox(origin, dir) { return classifyDummy(cast(origin, dir, objects)) || "miss"; }

// Witnesses W1, W2 each judge every shot the shooter sends, broadcast their ballot, and certify
// only when two distinct witnesses agree. `liar` names a witness that votes "hit" regardless.
async function round(shots, { liar = null } = {}) {
  const names = ["S", "W1", "W2"];
  const net = mesh(names);
  const shooter = createIdentity();
  const shooterKey = hex(shooter.pubkey);
  const ids = { W1: "w1", W2: "w2" };
  const tallies = { W1: createShotTally(), W2: createShotTally() };
  const dummies = { W1: { health: 100, quiet: 0 }, W2: { health: 100, quiet: 0 } };
  const certified = { W1: new Set(), W2: new Set() };
  for (const shot of shots) net.broadcast("S", encodeShot(shooter, shot));
  await settle();
  for (const w of ["W1", "W2"]) {
    for (const { data } of net.drain(w)) {
      const b = witnessBallot(data, objects, SHOOTER_AT);
      const ballot = w === liar ? { ...b, ballot: "hit", hitbox: "head" } : b;
      net.broadcast(w, encode({ shooter: b.shooter, nonce: b.nonce, ballot: ballot.ballot, hitbox: ballot.hitbox }));
      tallies[w].add(b.shooter, b.nonce, ids[w], ballot.ballot);
    }
  }
  await settle();
  for (const w of ["W1", "W2"]) {
    for (const { from, data } of net.drain(w)) {
      if (from === "S") continue;
      const v = decode(data);
      tallies[w].add(v.shooter, v.nonce, ids[from], v.ballot);
    }
    for (const shot of shots) {
      if (tallies[w].result(shooterKey, shot.nonce) === "hit" && !certified[w].has(shot.nonce)) {
        certified[w].add(shot.nonce);
        applyDummyHit(dummies[w], honestHitbox(shot.origin, shot.dir));
      }
    }
  }
  return { dummies, certified, tallies, shooterKey };
}

test("P2: a client that reports every shot as a hit is rejected unless two witnesses agree", async () => {
  const cheats = [
    { nonce: 1, origin: EYE, dir: AWAY, hitbox: "head" },              // aims away, claims head
    { nonce: 2, origin: EYE, dir: AWAY, hitbox: "chest" },             // aims away, claims chest
    { nonce: 3, origin: [9.2, 0, 1.65], dir: [1, 0, -0.5], hitbox: "head" }, // fake origin by the dummy
    { nonce: 4, origin: EYE, dir: AT_DUMMY, hitbox: "head" },          // real hit, wrong hitbox
  ];
  const honest = await round(cheats);
  for (const w of ["W1", "W2"]) {
    assert.equal(honest.dummies[w].health, 100, `${w}: no cheat shot certifies`);
    for (const s of cheats) assert.equal(honest.tallies[w].result(honest.shooterKey, s.nonce), "miss");
  }
  // One colluding witness is not enough: a hit plus a miss certifies nothing.
  const collude = await round(cheats, { liar: "W1" });
  for (const w of ["W1", "W2"]) {
    assert.equal(collude.dummies[w].health, 100);
    for (const s of cheats) assert.equal(collude.tallies[w].result(collude.shooterKey, s.nonce), null);
  }
});

test("P2: an honest hit certifies once two witnesses agree, and only once", async () => {
  const real = { nonce: 7, origin: EYE, dir: AT_DUMMY, hitbox: honestHitbox(EYE, AT_DUMMY) };
  assert.notEqual(real.hitbox, "miss");
  const out = await round([real, real]); // replayed frame
  for (const w of ["W1", "W2"]) {
    assert.equal(out.tallies[w].result(out.shooterKey, 7), "hit");
    assert.ok(out.dummies[w].health < 100);
    assert.equal(out.certified[w].size, 1);
  }
  assert.equal(out.dummies.W1.health, out.dummies.W2.health);
});

test("P2: the shooter's own ballot never counts", () => {
  const tally = createShotTally();
  assert.equal(tally.add("s", 1, "s", "hit"), null);
  assert.equal(tally.add("s", 1, "w1", "hit"), null);
  assert.equal(tally.add("s", 1, "w1", "hit"), null, "one witness voting twice is still one");
  assert.equal(tally.add("s", 1, "w2", "hit"), "hit");
});

// ---------- P3 ----------
async function digTrench({ net, leader, witness, steps }) {
  const pump = async () => {
    for (let quiet = 0; quiet < 3;) {
      let moved = 0;
      for (const f of leader.take()) { net.send("L", "W", f); moved++; }
      for (const f of witness.take()) { net.send("W", "L", f); moved++; }
      await settle(25);
      for (const { data } of net.drain("W")) witness.receive(data);
      for (const { data } of net.drain("L")) leader.receive(data);
      quiet = moved ? 0 : quiet + 1;
    }
  };
  for (const x of steps) {
    const aim = bitAim([x, -150, 0], 0, -1.2);
    for (let d = 0; d < 3; d++) {
      leader.dig(aim.eye, aim.aim, { peer: true });
      await pump();
    }
  }
}

// The game's CBOR carries numbers, strings, bytes, arrays and maps only: booleans ride as 0/1.
function plain(value) {
  if (value === true || value === false) return value ? 1 : 0;
  if (value instanceof Uint8Array) return value;
  if (Array.isArray(value)) return value.map(plain);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).filter(([, v]) => v != null).map(([k, v]) => [k, plain(v)]));
  }
  return value;
}
const wire = (op) => encode(plain(op));
const unwire = (bytes) => decode(bytes);

test("P3: a late joiner rebuilds a dug trench from a checkpoint plus ops and computes the same chunk hash", { timeout: 20000 }, async () => {
  const net = mesh(["L", "W", "J"], { latencyMs: 5, jitterMs: 15 });
  const leaderId = createIdentity();
  const leader = createTerrain({ identity: leaderId, leader: true });
  const witness = createTerrain({ identity: createIdentity(), leader: false });
  await digTrench({ net, leader, witness, steps: [-1, -0.5, 0, 0.5, 1] });
  assert.ok(leader.log.seq >= 5, `trench committed (${leader.log.seq} ops)`);
  assert.equal(witness.log.seq, leader.log.seq, "witness kept up");
  const chunks = [...new Map(leader.log.ops.map((op) => {
    const c = decode(op.proposal).body?.chunk;
    return [String(c), c];
  })).values()].filter(Boolean);
  assert.ok(chunks.length >= 1);
  const checkpoint = signCheckpoint(leaderId, leader.log, { cell: "atoll-0", chunk: chunks[0], solo: false });

  // More trench after the checkpoint: the suffix the joiner must replay too.
  await digTrench({ net, leader, witness, steps: [1.5, 2] });
  assert.ok(leader.log.seq > checkpoint.seq);

  // The joiner arrives: leader sends the checkpoint, the witness serves the ops (any member can).
  net.send("L", "J", encode(plain({ kind: "checkpoint", ...checkpoint })));
  for (const op of witness.log.ops) net.send("W", "J", encode({ kind: "op", op: wire(op) }));
  await settle(80);
  let got = null;
  const ops = [];
  for (const { data } of net.drain("J")) {
    const m = decode(data);
    if (m.kind === "checkpoint") got = { ...m, solo: Boolean(m.solo) }; else ops.push(unwire(m.op));
  }
  assert.ok(got);
  const joined = catchUp(got, ops);
  assert.equal(joined.ok, true, JSON.stringify(joined.reason));
  assert.equal(joined.seq, leader.log.seq);
  for (const c of chunks) {
    assert.deepEqual([...joined.crust.hash(...c)], [...leader.log.crust.hash(...c)], `chunk ${c} hash`);
  }

  // A tampered checkpoint or a missing op is refused.
  const forged = { ...got, hash: new Uint8Array(got.hash).map((b, i) => (i ? b : b ^ 1)) };
  assert.equal(catchUp(forged, ops).ok, false);
  const holey = ops.filter((op) => op.seq !== 2);
  assert.equal(catchUp(got, holey).ok, false);
});
