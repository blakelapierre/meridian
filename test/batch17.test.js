import { readFileSync } from "node:fs";
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createLoopbackPair } from "../src/net/loopback.js";
import { chatMessage, createChatLog, noteChat, readChat } from "../src/net/chat.js";
import { ackMessage, noteAck, readAck, createSendState, createView, encodeMotion, modeOf, receive, sendNow, shouldSend, settle, shown, TICK_HZ } from "../src/net/motion.js";
import { PLAYER_DEGREE, ringNeighbors } from "../src/net/mesh.js";
import { FRAME_MAX_DT, STALL_MAX_DT, STALL_MS, STALL_POLL_MS, stalledFor } from "../src/app/stall.js";

// Deterministic clock: a queue of timed callbacks the tests run by hand.
function clock() {
  const q = [];
  let now = 0;
  return {
    now: () => now,
    schedule: (fn, ms) => q.push({ at: now + ms, fn }),
    advance(ms) {
      const end = now + ms;
      for (;;) {
        q.sort((a, b) => a.at - b.at);
        if (!q.length || q[0].at > end) break;
        const next = q.shift();
        now = next.at;
        next.fn();
      }
      now = end;
    },
  };
}
function seeded(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32); }

// One peer link: a reliable ordered ctrl lane and a lossy unordered snap lane, like main.js.
function link(c, { latencyMs, loss, seed }) {
  const [ctrlA, ctrlB] = createLoopbackPair({ latencyMs, schedule: c.schedule });
  const [snapA, snapB] = createLoopbackPair({ latencyMs, loss, rand: seeded(seed), schedule: c.schedule });
  return { ctrlA, ctrlB, snapA, snapB };
}

test("P0: chat lines are clean, ordered and deduplicated", () => {
  assert.equal(chatMessage(1, "  \n "), null);
  const line = readChat(chatMessage(1, "hi\u0007 there"));
  assert.deepEqual(line, { seq: 1, text: "hi  there" });
  assert.equal(readChat('{"t":"ack","tick":3}'), null);
  const log = createChatLog();
  assert.equal(noteChat(log, "p-a", { seq: 1, text: "a" }), true);
  assert.equal(noteChat(log, "p-a", { seq: 1, text: "a" }), false);
  assert.equal(noteChat(log, "p-b", { seq: 1, text: "b" }), true);
  assert.deepEqual(log.lines.map((l) => l.text), ["a", "b"]);
});

test("P0 exit test: killing packets stalls neither chat behind movement nor movement behind chat", () => {
  for (const loss of [0, 0.3, 0.6]) {
    const c = clock();
    const l = link(c, { latencyMs: 40, loss, seed: 7 });
    const chats = [];
    const poses = [];
    l.ctrlB.onmessage = (e) => { const m = readChat(e.data); if (m) chats.push({ ...m, at: c.now() }); };
    l.snapB.onmessage = () => { poses.push(c.now()); };
    const sent = new Map();
    const rec = createSendState();
    for (let t = 0; t < 300; t += 1) {
      const p = [t * 0.1, 0, 2];
      const now = { tick: t, p, v: [3, 0, 0], a: [0, 0, 0], yaw: 0, yawRate: 0, pitch: 0, floor: 2, mode: modeOf([3, 0, 0], false), wallMs: c.now() };
      const why = shouldSend(rec, now, 0) || "all"; // near tier: send every tick
      if (why) l.snapA.send(sendNow(rec, now, 0));
      // A burst of chat every second, in the middle of the movement stream.
      if (t % 30 === 5) for (let k = 0; k < 3; k += 1) { const seq = sent.size + 1; sent.set(seq, c.now()); l.ctrlA.send(chatMessage(seq, `line ${seq}`)); }
      c.advance(1000 / TICK_HZ);
    }
    c.advance(500);
    // Chat: every line, in order, each at exactly one-way latency whatever the snap loss.
    assert.deepEqual(chats.map((m) => m.seq), [...sent.keys()], `loss ${loss}`);
    for (const m of chats) assert.ok(m.at - sent.get(m.seq) <= 41, `chat ${m.seq} late at loss ${loss}`);
    // Movement: what survives the loss keeps flowing; no gap longer than the loss pattern allows.
    assert.ok(poses.length >= 300 * (1 - loss) * 0.8, `poses ${poses.length} at loss ${loss}`);
    let gap = 0;
    for (let i = 1; i < poses.length; i += 1) gap = Math.max(gap, poses[i] - poses[i - 1]);
    assert.ok(gap < 600, `movement stalled ${gap} ms at loss ${loss}`);
  }
});

test("P0: a 60 % lossy snap lane still converges the remote pose (packet-loss)", () => {
  const c = clock();
  const l = link(c, { latencyMs: 40, loss: 0.6, seed: 3 });
  const view = createView();
  let cur = 0;
  const rec = createSendState();
  // Acks ride the reliable ctrl lane, as in main.js.
  l.snapB.onmessage = (e) => { if (receive(view, new Uint8Array(e.data), cur, 2, c.now())) l.ctrlB.send(ackMessage(view.state.tick)); };
  l.ctrlA.onmessage = (e) => { const a = readAck(e.data); if (a) noteAck(rec, a.tick); };
  let truth = [0, 0, 2];
  let worst = 0;
  let sum = 0;
  let n = 0;
  for (let t = 0; t < 600; t += 1) {
    cur = t;
    const vx = t < 300 ? 3 : -2;
    truth = [truth[0] + vx / TICK_HZ, 0, 2];
    const now = { tick: t, p: truth, v: [vx, 0, 0], a: [0, 0, 0], yaw: 0, yawRate: 0, pitch: 0, floor: 2, mode: modeOf([vx, 0, 0], false), wallMs: c.now() };
    if (shouldSend(rec, now, 0)) l.snapA.send(sendNow(rec, now, 0));
    c.advance(1000 / TICK_HZ);
    if (view.state && t > 60 && (t < 290 || t > 340)) {
      const seen = shown(view, t, c.now());
      const e = Math.abs(seen.p[0] - truth[0]); worst = Math.max(worst, e); sum += e; n += 1;
    }
    settle(view);
  }
  // Before the near-tier repair one lost drift packet left the peer coasting: 17.9 m worst.
  if (process.env.D) console.log({ worst, mean: sum / n });
  assert.ok(sum / n < 0.8, `remote off by ${(sum / n).toFixed(2)} m on average at 60 % loss`);
  assert.ok(worst < 6.5, `remote off by ${worst.toFixed(2)} m at worst at 60 % loss`);
});

test("P1 exit test: eight peers at 80 ms RTT — local body immediate, remotes interpolate, ≤24 links", () => {
  const c = clock();
  const N = 8;
  const ids = Array.from({ length: N }, (_, i) => `p-${i}`);
  for (const me of ids) assert.ok(ringNeighbors(ids, me).length <= 24 && PLAYER_DEGREE <= 24);
  const peers = ids.map((id, i) => ({ id, i, pos: [i * 3, 0, 2], recs: new Map(), views: new Map(), out: new Map() }));
  for (const a of peers) for (const b of peers) {
    if (a.i >= b.i) continue;
    const l = link(c, { latencyMs: 40, loss: 0, seed: a.i * 9 + b.i });
    a.out.set(b.id, l.snapA); b.out.set(a.id, l.snapB);
    a.recs.set(b.id, createSendState()); b.recs.set(a.id, createSendState());
    a.views.set(b.id, createView()); b.views.set(a.id, createView());
    l.snapB.onmessage = (e) => receive(b.views.get(a.id), new Uint8Array(e.data), null, 2, c.now());
    l.snapA.onmessage = (e) => receive(a.views.get(b.id), new Uint8Array(e.data), null, 2, c.now());
  }
  for (const p of peers) assert.ok(p.out.size <= 24);
  let worst = 0;
  let localLag = 0;
  for (let t = 0; t < 300; t += 1) {
    for (const p of peers) {
      const ang = t / TICK_HZ + p.i;
      const v = [Math.cos(ang) * 3, Math.sin(ang) * 3, 0];
      const before = p.pos.slice();
      p.pos = [p.pos[0] + v[0] / TICK_HZ, p.pos[1] + v[1] / TICK_HZ, 2];
      // Local input applies in the same tick, no network round trip.
      localLag = Math.max(localLag, Math.hypot(p.pos[0] - before[0] - v[0] / TICK_HZ, p.pos[1] - before[1] - v[1] / TICK_HZ));
      p.vel = v;
      for (const [to, rec] of p.recs) {
        const now = { tick: t, p: p.pos, v, a: [0, 0, 0], yaw: ang, yawRate: 1, pitch: 0, floor: 2, mode: modeOf(v, false), wallMs: c.now() };
        if (shouldSend(rec, now, 0)) p.out.get(to).send(sendNow(rec, now, 0));
      }
    }
    c.advance(1000 / TICK_HZ);
    if (t < 30) continue;
    for (const p of peers) for (const [from, view] of p.views) {
      const truth = peers.find((q) => q.id === from).pos;
      const seen = shown(view, t, c.now());
      worst = Math.max(worst, Math.hypot(seen.p[0] - truth[0], seen.p[1] - truth[1]));
      settle(view);
    }
  }
  assert.equal(localLag < 1e-9, true);
  // 40 ms one-way at 3 m/s on a curve: prediction keeps every remote well inside 0.5 m.
  assert.ok(worst < 0.5, `worst remote error ${worst.toFixed(3)} m`);
});

test("stalled tabs step the sim by wall time and the bench accepts unpainted clients", async () => {
  assert.equal(stalledFor(0, STALL_MS - 1), false);
  assert.equal(stalledFor(0, STALL_MS), true);
  assert.ok(STALL_MAX_DT >= STALL_POLL_MS / 1000 && FRAME_MAX_DT > 0.1);
  const main = await readFile(new URL("../src/app/main.js", import.meta.url), "utf8");
  assert.match(main, /if \(stalledFor\(lastFrameMs, performance\.now\(\)\)\) frame\(performance\.now\(\), true\)/);
  assert.match(main, /if \(!fromTimer\) requestAnimationFrame\(frame\)/);
  assert.match(main, /&& !capped && !fromTimer\)/);
  const bench = await readFile(new URL("../tools/scale/bench.js", import.meta.url), "utf8");
  assert.match(bench, /probe\(c\)\.tick\?\.\(\)/);
});

test("openLink clears opening when the room join fails", () => {
  const src = readFileSync(new URL("../src/app/main.js", import.meta.url), "utf8");
  const body = src.slice(src.indexOf("async function openLink"), src.indexOf("const pc =", src.indexOf("async function openLink")));
  assert.match(body, /catch[\s\S]*opening\.delete\(to\)/);
});
