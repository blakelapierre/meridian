import test from "node:test";
import assert from "node:assert/strict";
import WebSocket from "ws";
import { createIdentity } from "../src/net/identity.js";
import { encodePrint } from "../src/net/prints.js";
import { encodePosition, decodePosition } from "../src/net/position.js";
import {
  decodePoseV2, encodeDeflatedPack, encodePack, encodePoseV2, isPoseV2, packState, poseDue, readHello, helloMessage, unwrap, wrapYaw, PROTO,
} from "../src/net/wire.js";
import { createLighthouse } from "../tools/signal/server.js";
import { WORLD_VERSION, FRAME_WIRE, loadWorld, migrateWorld } from "../src/sim/persist.js";

test("hello round-trips and clamps proto", () => {
  assert.deepEqual(readHello(helloMessage("abc")), { proto: PROTO, catalog: "abc" });
  assert.equal(readHello('{"t":"hello","proto":9}').proto, PROTO);
  assert.equal(readHello("garbage"), null);
});

test("pose v2 is compact, distinguishable from v1, wraps yaw", () => {
  const pose = { tick: 123456, x: -12.34, y: -149.99, z: 2.07, yaw: 38.2, pitch: -0.4 };
  const v2 = encodePoseV2(pose);
  assert.ok(v2.length < 24 && v2.length !== 16);
  assert.ok(isPoseV2(v2));
  assert.ok(!isPoseV2(encodePosition(pose)));
  const back = decodePoseV2(v2);
  assert.equal(back.tick, pose.tick);
  assert.equal(back.x, -12.34);
  assert.ok(Math.abs(back.yaw - wrapYaw(38.2)) < 2e-4);
  assert.ok(back.yaw >= -Math.PI && back.yaw < Math.PI);
  assert.equal(decodePosition(encodePosition(pose)).tick, pose.tick);
  for (let tick = 0; tick < 3000; tick += 7) {
    const b = encodePoseV2({ tick, x: 0, y: 0, z: 0 });
    assert.ok(b.length !== 16 && b.length !== 24);
  }
});

test("poseDue sends on change or 1 Hz keepalive only", () => {
  const p = { x: 1, y: 2, z: 3, yaw: 0, pitch: 0 };
  assert.ok(poseDue(null, p, 0));
  const last = { ...p, at: 0 };
  assert.ok(!poseDue(last, p, 500));
  assert.ok(poseDue(last, p, 1000));
  assert.ok(poseDue(last, { ...p, x: 1.02 }, 10));
  assert.ok(poseDue(last, { ...p, yaw: Math.PI * 2 + 0.01 }, 10));
  assert.ok(!poseDue(last, { ...p, yaw: Math.PI * 2 }, 10));
});

function frameWith(identity, kind, payload) {
  const f = encodePrint(identity, { nonce: 1, x: 0, y: 0 });
  const out = new Uint8Array(97 + payload.length);
  out.set(f.subarray(0, 97));
  out[0] = kind;
  out.set(payload, 97);
  return out;
}

test("packs rebuild v1 frames byte for byte, index senders, reference embedded payloads", () => {
  const a = createIdentity();
  const b = createIdentity();
  const proposal = Uint8Array.from({ length: 200 }, (_, i) => (i * 7) & 255);
  const commit = new Uint8Array(400);
  commit.set([1, 2, 3], 0);
  commit.set(proposal, 50);
  const frames = [frameWith(a, 1, proposal), encodePrint(a, { nonce: 5, x: 1, y: 2 }), encodePrint(b, { nonce: 6, x: 1, y: 2 }), frameWith(a, 3, commit)];
  const out = packState();
  const inn = packState();
  const pack = encodePack(frames, out);
  const total = frames.reduce((n, f) => n + f.length, 0);
  assert.ok(pack.length < total - 200 - 31, `${pack.length} vs ${total}`);
  assert.deepEqual(unwrap(pack, inn), frames);
  const again = encodePack([frames[3]], out);
  assert.ok(again.length < frames[3].length - 200);
  assert.deepEqual(unwrap(again, inn), [frames[3]]);
  assert.deepEqual(unwrap(frames[1], inn), [frames[1]]);
});

test("deflated replay pack round-trips", async () => {
  const a = createIdentity();
  const frames = Array.from({ length: 40 }, (_, i) => encodePrint(a, { nonce: i, x: i, y: 0 }));
  const pack = await encodeDeflatedPack(frames);
  assert.ok(pack.length < frames.reduce((n, f) => n + f.length, 0));
  assert.deepEqual(await unwrap(pack, packState()), frames);
});

test("v2 world save migrates and keeps frames", () => {
  const w = migrateWorld({ version: 2, blocks: [], frames: ["09aa", "03bb"], sheets: {} });
  assert.equal(w.version, WORLD_VERSION);
  assert.equal(w.frameWire, FRAME_WIRE);
  assert.deepEqual(w.frames, ["09aa", "03bb"]);
  const store = new Map([["w", JSON.stringify({ version: 3, frames: ["09aa"], replay: "AA==", replayOf: "k" })]]);
  assert.equal(loadWorld(store, "w").replay, "AA==");
});

function client(url) {
  const ws = new WebSocket(url);
  const got = [];
  ws.on("message", (m) => got.push(JSON.parse(m.toString())));
  return new Promise((r) => ws.on("open", () => r({ ws, got, send: (o) => ws.send(JSON.stringify(o)) })));
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

test("lighthouse: v1 list unchanged, v2 subscribe gets roster diffs", async () => {
  const lh = await createLighthouse(0);
  try {
    const old = await client(lh.url);
    const sub = await client(lh.url);
    old.send({ type: "announce", pubkey: "old", cell: "c" });
    sub.send({ type: "subscribe", cell: "c" });
    await wait(50);
    assert.deepEqual(sub.got[0].peers.map((p) => p.pubkey), ["old"]);
    assert.equal(sub.got[0].sub, true);
    const fresh = await client(lh.url);
    fresh.send({ type: "announce", pubkey: "new", cell: "c", proto: 2 });
    fresh.send({ type: "announce", pubkey: "new", cell: "c", proto: 2 });
    old.send({ type: "list", cell: "c" });
    await wait(50);
    const rosters = sub.got.filter((m) => m.type === "roster");
    assert.equal(rosters.length, 1);
    assert.equal(rosters[0].add[0].pubkey, "new");
    const present = old.got.find((m) => m.type === "present");
    assert.deepEqual(present.peers.map((p) => p.pubkey).sort(), ["new", "old"]);
    assert.equal(present.sub, undefined);
    fresh.ws.close();
    await wait(50);
    assert.deepEqual(sub.got.at(-1).drop, ["new"]);
    old.ws.close();
    sub.ws.close();
  } finally {
    await lh.close();
  }
});
