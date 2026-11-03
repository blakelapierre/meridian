import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createNotify, wrap, unwrap, KIND, bareAckDue, isNotify } from "../src/net/notify.js";
import { createBudget, pick, adapt, weightOf } from "../src/net/budget.js";
import { createState, setField, addReceiver, packFor, onLoss, readState, pendingMask, FIELD } from "../src/net/dirty.js";
import { createLoopbackPair } from "../src/net/loopback.js";
import { netGraphLines, rateTracker, sampleRate } from "../src/app/netgraph.js";
import { helloMessage, readHello } from "../src/net/wire.js";
import { createSendState, sendNow, createView, receive, noteAck, shouldSend } from "../src/net/motion.js";

function seeded(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32); }

// Drive two notify ends over a simulated link: one-way latency in ticks, random loss both ways.
function simulate({ ticks = 600, loss = 0, latency = 3, seed = 7 }) {
  const rand = seeded(seed);
  const a = createNotify(); const b = createNotify();
  const toB = []; const toA = [];
  const acked = new Set(); const lost = new Set(); let received = 0;
  for (let t = 0; t < ticks; t++) {
    const ms = t * 33;
    const f = wrap(a, [{ kind: KIND.pose, bytes: Uint8Array.of(t & 255), meta: t }], ms);
    if (rand() >= loss) toB.push({ at: t + latency, f });
    for (const m of toB.filter((m) => m.at === t)) { const u = unwrap(b, m.f, ms); if (u?.items.length) received += 1; }
    if (bareAckDue(b, ms, 0)) { const r = wrap(b, [], ms); if (rand() >= loss) toA.push({ at: t + latency, f: r }); }
    for (const m of toA.filter((m) => m.at === t)) { const u = unwrap(a, m.f, ms); for (const x of u.acked) acked.add(x.items[0].meta); for (const x of u.lost) lost.add(x.items[0].meta); }
  }
  return { a, acked, lost, received };
}

test("notify: clean link acks everything and measures RTT", () => {
  const { a, acked, lost } = simulate({ loss: 0, latency: 3 });
  assert.equal(lost.size, 0);
  assert.ok(acked.size > 590);
  assert.ok(Math.abs(a.stats.rtt - 6 * 33) < 40, `rtt ${a.stats.rtt}`);
});

test("notify: 10% loss is detected, no packet is both acked and lost", () => {
  const { a, acked, lost, received } = simulate({ loss: 0.1, latency: 2, seed: 3 });
  for (const s of lost) assert.ok(!acked.has(s));
  assert.ok(a.stats.loss > 0.05 && a.stats.loss < 0.35, `loss ${a.stats.loss}`);
  // Every packet that arrived was eventually acked (cumulative window survives lost acks).
  assert.ok(acked.size >= received - 10, `${acked.size} vs ${received}`);
});

test("notify: malformed and duplicate frames are harmless", () => {
  const a = createNotify(); const b = createNotify();
  assert.equal(unwrap(b, Uint8Array.of(0xc4, 1), 0), null);
  const f = wrap(a, [{ kind: 1, bytes: Uint8Array.of(9), meta: 0 }], 0);
  assert.ok(isNotify(f));
  assert.equal(unwrap(b, f, 1).items.length, 1);
  assert.equal(unwrap(b, f, 2).items.length, 0);
});

test("budget: starved candidates accumulate priority and eventually send", () => {
  const b = createBudget({ start: 30, burst: 1 });
  const sent = { near: 0, far: 0 };
  for (let t = 0; t < 60; t++) {
    const out = pick(b, [{ key: "near", bytes: 24, weight: weightOf({ tier: 0, inView: true }) }, { key: "far", bytes: 24, weight: weightOf({ tier: 3 }) }]);
    for (const c of out) sent[c.key] += 1;
  }
  assert.ok(sent.near > sent.far);
  assert.ok(sent.far > 0, "beyond-tier item must not starve");
  assert.ok(b.spent <= 30 * 60);
});

test("budget: shrinks on loss, regrows when clean", () => {
  const b = createBudget();
  const start = b.perTick;
  for (let i = 0; i < 20; i++) adapt(b, 0.2, 0);
  assert.ok(b.perTick < start * 0.1 + b.min + 1);
  for (let i = 0; i < 200; i++) adapt(b, 0, 0);
  assert.ok(b.perTick > start);
});

test("dirty masks: only changed fields are sent; loss resends only still-current ones", () => {
  const s = createState();
  setField(s, "hp", 100); setField(s, "held", "bit");
  addReceiver(s, "p");
  const first = packFor(s, "p");
  assert.deepEqual(readState(first.bytes), { held: "bit", hp: 100 });
  assert.equal(packFor(s, "p"), null);
  setField(s, "stance", { crouch: true });
  const second = packFor(s, "p");
  assert.deepEqual(readState(second.bytes), { stance: { crouch: true } });
  // second is lost but stance changed again before the loss is known: no stale resend
  setField(s, "stance", { crouch: false });
  assert.equal(onLoss(s, second.meta), 0);
  assert.equal(pendingMask(s, "p"), FIELD.stance);
  const third = packFor(s, "p");
  // first lost: held and hp unchanged, both come back
  assert.equal(onLoss(s, first.meta), FIELD.held | FIELD.hp);
  assert.deepEqual(Object.keys(readState(packFor(s, "p").bytes)).sort(), ["held", "hp"]);
  assert.ok(third);
});

test("loopback + notify + motion: 20% loss, 40 ms latency, pose still converges and acks flow", async () => {
  const [near, far] = createLoopbackPair({ latencyMs: 20, loss: 0.2, rand: seeded(11) });
  const tx = createNotify(); const rx = createNotify();
  const rec = createSendState(); const view = createView();
  const st = createState(); addReceiver(st, "far");
  let lastState = null;
  far.onmessage = (e) => {
    const u = unwrap(rx, new Uint8Array(e.data), Date.now());
    for (const it of u.items) {
      if (it.kind === KIND.pose) receive(view, it.bytes, 0, undefined, Date.now());
      if (it.kind === KIND.state) lastState = { ...lastState, ...readState(it.bytes) };
    }
    if (bareAckDue(rx, Date.now(), 0)) far.send(wrap(rx, [], Date.now()));
  };
  near.onmessage = (e) => {
    const u = unwrap(tx, new Uint8Array(e.data), Date.now());
    for (const d of u.acked) for (const it of d.items) if (it.kind === KIND.pose) noteAck(rec, it.meta.tick);
    for (const d of u.lost) for (const it of d.items) if (it.kind === KIND.state) onLoss(st, it.meta);
  };
  for (let t = 1; t <= 60; t++) {
    if (t === 5) setField(st, "hp", 80);
    if (t === 30) setField(st, "held", "pick");
    const items = [{ kind: KIND.pose, bytes: sendNow(rec, { tick: t, p: [t * 0.1, 0, 1], v: [3, 0, 0], a: [0, 0, 0], yaw: 0, yawRate: 0, pitch: 0, floor: 1, mode: 1 }, 0), meta: { tick: t } }];
    const p = packFor(st, "far");
    if (p) items.push({ kind: KIND.state, bytes: p.bytes, meta: p.meta });
    near.send(wrap(tx, items, Date.now()));
    await new Promise((r) => setTimeout(r, 5));
  }
  await new Promise((r) => setTimeout(r, 120));
  assert.ok(view.state && view.state.tick > 50, "receiver has a recent pose");
  assert.ok(rec.ackTick > 40, `acked ${rec.ackTick}`);
  assert.deepEqual({ hp: lastState?.hp, held: lastState?.held }, { hp: 80, held: "pick" });
  assert.ok(tx.stats.lost > 0 && tx.stats.rtt > 30, `lost ${tx.stats.lost} rtt ${tx.stats.rtt}`);
  assert.ok(near.dropped > 0);
});

test("hello carries notify, old hellos do not", () => {
  assert.equal(readHello(helloMessage("", 0, 0, true)).notify, true);
  assert.equal(readHello(helloMessage("")).notify, undefined);
});

test("net graph lines", () => {
  const t = rateTracker();
  sampleRate(t, 0, 0, 1000); sampleRate(t, 2048, 1024, 2000);
  assert.equal(t.inRate, 2048);
  const lines = netGraphLines([{ name: "loopback", inRate: t.inRate, outRate: t.outRate, loss: 0.05, rtt: 42, ghosts: 1, budget: 1200 }]);
  assert.match(lines[0], /loss/);
  assert.match(lines[1], /loopback\s+2\.0k\s+1\.0k\s+5\.0%\s+42\s+1\s+1200/);
  assert.deepEqual(netGraphLines([]), []);
});

test("main wires Batch 16 modules and cites sources", () => {
  const main = readFileSync(new URL("../src/app/main.js", import.meta.url), "utf8");
  for (const m of ["notify", "budget", "dirty", "loopback"]) assert.match(main, new RegExp(`net/${m}\\.js\\?v=\\d+`));
  assert.match(main, /netGraphLines\(netGraphRows\(\)\)/);
  const doc = readFileSync(new URL("../docs/netcode.md", import.meta.url), "utf8");
  assert.match(doc, /Frohnmayer/); assert.match(doc, /MIT/);
});

test("keepalive goes out under a starved budget (merge of #45 + #46)", () => {
  const rec = createSendState();
  const m = (tick, wallMs) => ({ tick, p: [0, 0, 1], v: [0, 0, 0], a: [0, 0, 0], yaw: 0, yawRate: 0, pitch: 0, floor: 1, mode: 0, wallMs });
  sendNow(rec, m(1, 0), 0);
  // Ticks frozen (hidden tab), wall time moves on: keepalive is due.
  const why = shouldSend(rec, m(1, 5000), 0);
  assert.equal(why, "keepalive");
  const b = createBudget({ start: 1, burst: 1 });
  b.tokens = 0;
  const out = pick(b, [{ key: "pose", bytes: 24, weight: 1, must: why === "keepalive" }]);
  assert.deepEqual(out.map((c) => c.key), ["pose"]);
  const main = readFileSync(new URL("../src/app/main.js", import.meta.url), "utf8");
  assert.match(main, /why === "keepalive"/);
  assert.match(main, /wallMs: nowMs/);
});
