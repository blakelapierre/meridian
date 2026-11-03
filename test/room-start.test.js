import assert from "node:assert/strict";
import test from "node:test";
import { startRoom } from "../src/net/room.js";

// Regression: game clients on a busy machine marked the lighthouse unreachable after 3 s,
// closed the socket and stayed solo for 30 s, so the scale bench saw 0/1 peers.
test("a slow lighthouse socket is kept and the room comes up when it opens", async () => {
  let open;
  const room = { start: () => new Promise((resolve) => { open = resolve; }), close: () => assert.fail("closed a slow socket") };
  const states = [];
  const ready = startRoom(room, { slowMs: 10, onState: (s) => states.push(s) });
  await new Promise((r) => setTimeout(r, 30));
  assert.deepEqual(states, ["connecting", "slow"]);
  open();
  assert.equal(await ready, room);
  assert.deepEqual(states, ["connecting", "slow", "up"]);
});

test("a failed lighthouse socket still rejects", async () => {
  const states = [];
  const room = { start: () => Promise.reject(new Error("lighthouse failed")) };
  await assert.rejects(startRoom(room, { slowMs: 10, onState: (s) => states.push(s) }), /lighthouse failed/);
  assert.deepEqual(states, ["connecting", "failed"]);
});

test("the game page keeps waiting on a slow lighthouse instead of racing a 3 s timeout", async () => {
  const { readFile } = await import("node:fs/promises");
  const main = await readFile(new URL("../src/app/main.js", import.meta.url), "utf8");
  assert.match(main, /startRoom\(room/);
  assert.doesNotMatch(main, /reject\(new Error\("lighthouse timeout"\)\)/);
});

// Regression: two game pages linked (v3 hello) but no poses arrived. A still body in a tab
// whose frames had stopped never repeated its first state, and that first state rides the
// unreliable lane. A wall-clock keepalive repeats it.
test("a still body repeats its state by wall time even when ticks stop", async () => {
  const { createSendState, sendNow, shouldSend, TIERS } = await import("../src/net/motion.js");
  const rec = createSendState();
  const now = { tick: 100, p: [0, -150, 2], v: [0, 0, 0], a: [0, 0, 0], yaw: 0, yawRate: 0, pitch: 0, floor: 2, mode: 0, wallMs: 0 };
  assert.equal(shouldSend(rec, now, 0), "first");
  sendNow(rec, now, 0);
  assert.equal(shouldSend(rec, { ...now, wallMs: 500 }, 0), null);
  assert.equal(shouldSend(rec, { ...now, wallMs: (TIERS[0].keepalive / 30) * 1000 }, 0), "keepalive");
});

test("the game page publishes its pose on a timer when frames stall", async () => {
  const { readFile } = await import("node:fs/promises");
  const main = await readFile(new URL("../src/app/main.js", import.meta.url), "utf8");
  assert.match(main, /setInterval\(\(\) => \{ if \(performance\.now\(\) - lastPublishMs > 900\) publishPose\(\); \}, 1000\)/);
});
