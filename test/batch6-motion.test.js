import test from "node:test";
import assert from "node:assert/strict";
import {
  TIERS, createEstimator, createSendState, createView, decodeMotion, encodeMotion, estimate, isMotion, modeOf,
  observe, predict, receive, sendNow, settle, shouldSend, shown, tierFor, noteAck, COAST_M,
} from "../src/net/motion.js";
import { simulate } from "../tools/netsim/sim.mjs";

const base = { tick: 1000, p: [12.345, -67.891, 1.234], v: [3.21, -1.07, 0], a: [0.6, -0.4, 0], yaw: 1.2345, yawRate: 0.5, pitch: -0.2, floor: 1.234 };

test("v3 motion encodes compactly within its quantization bounds", () => {
  const { bytes, state } = encodeMotion(base, modeOf(base.v, false));
  assert.ok(isMotion(bytes));
  assert.ok(bytes.length <= 24 && bytes.length !== 16 && bytes.length !== 24, `len ${bytes.length}`);
  for (let k = 0; k < 3; k += 1) {
    assert.ok(Math.abs(state.p[k] - base.p[k]) <= 0.005 + 1e-9);
    assert.ok(Math.abs(state.v[k] - base.v[k]) <= 0.01 + 1e-9);
    assert.ok(Math.abs(state.a[k] - base.a[k]) <= 0.125 + 1e-9);
  }
  assert.ok(Math.abs(state.yaw - base.yaw) < 1e-4);
  const idle = encodeMotion({ ...base, v: [0, 0, 0], a: [0, 0, 0], yawRate: 0 }, modeOf([0, 0, 0], false));
  assert.ok(idle.bytes.length < bytes.length);
});

test("sender and receiver run the identical prediction from the sent state", () => {
  const rec = createSendState();
  const bytes = sendNow(rec, { ...base, mode: 1 });
  const view = createView();
  receive(view, bytes, base.tick);
  for (const t of [base.tick, base.tick + 7, base.tick + 30, base.tick + 200]) {
    assert.deepEqual(predict(view.state, t), predict(rec.verified, t));
  }
  // Prediction is capped and grounded states do not sink.
  const sent = decodeMotion(bytes, base.floor);
  const far = predict({ ...sent, v: [sent.v[0], sent.v[1], -3] }, base.tick + 10000);
  assert.ok(far.p[2] >= sent.p[2] - 1e-9);
});

test("tiers: near or on-screen is sharp, behind/far is coarse, out of range is keepalive", () => {
  const view = { x: 0, y: 0, yaw: 0, fov: 1.78, range: 80 };
  assert.equal(tierFor(view, [0, 20, 0]), 0); // ahead, close
  assert.equal(tierFor(view, [0, 50, 0]), 1); // ahead, mid
  assert.equal(tierFor(view, [0, -30, 0]), 2); // behind
  assert.equal(tierFor(view, [0, -3, 0]), 0); // arm's reach
  assert.equal(tierFor(view, [0, 150, 0]), 3); // beyond perception
  assert.ok(TIERS[3].minGap >= 60 && TIERS[0].minGap === 1);
});

test("shouldSend fires on first, mode change, drift and keepalive only", () => {
  const rec = createSendState();
  const now = { ...base, mode: 1 };
  assert.equal(shouldSend(rec, now, 0), "first");
  sendNow(rec, now, 0);
  noteAck(rec, rec.verified.tick);
  const on = (tick) => { const g = predict(rec.verified, tick); return { ...now, tick, p: g.p, yaw: g.yaw }; };
  assert.equal(shouldSend(rec, on(base.tick + 5), 0), null); // still on the prediction
  const off = on(base.tick + 5); off.p = [off.p[0] + 0.2, off.p[1], off.p[2]];
  assert.equal(shouldSend(rec, off, 0), "error");
  rec.tier = 2;
  assert.equal(shouldSend(rec, off, 2), null); // unseen tier tolerates 20 cm, and the gap is inside minGap
  const far = on(base.tick + 5);
  far.p = [far.p[0] + 2, far.p[1], far.p[2]];
  assert.equal(shouldSend(rec, far, 2), "error"); // bound wins over minGap
  rec.tier = 0;
  assert.equal(shouldSend(rec, { ...on(base.tick + 5), mode: 2 }, 0), "mode");
  assert.equal(shouldSend(rec, on(base.tick + TIERS[0].keepalive), 0), "keepalive");
});

test("receiver smooths a correction instead of snapping", () => {
  const view = createView();
  const rec = createSendState();
  receive(view, sendNow(rec, { ...base, mode: 1 }), base.tick);
  const before = shown(view, base.tick + 10);
  receive(view, sendNow(rec, { ...base, tick: base.tick + 10, p: [base.p[0] + 1, base.p[1], base.p[2]], mode: 1 }), base.tick + 10);
  const after = shown(view, base.tick + 10);
  assert.ok(Math.hypot(after.p[0] - before.p[0], after.p[1] - before.p[1]) < 1e-6, "no visible jump");
  for (let i = 0; i < 12; i += 1) settle(view);
  assert.ok(Math.hypot(...view.offset) < 0.01, "offset gone within ~0.4 s");
});

test("a client that has been running does not fling a peer who just joined", () => {
  const view = createView();
  const rec = createSendState();
  const local = base.tick + 240;
  receive(view, sendNow(rec, { ...base, mode: 1 }), local);
  const seen = shown(view, local);
  const sent = predict(rec.verified, base.tick);
  assert.ok(Math.hypot(seen.p[0] - sent.p[0], seen.p[1] - sent.p[1]) < 0.02, `seen ${seen.p}`);
  const later = shown(view, local + 15);
  const expected = predict(rec.verified, base.tick + 15);
  assert.ok(Math.hypot(later.p[0] - expected.p[0], later.p[1] - expected.p[1]) < 0.02, `later ${later.p}`);
  const flung = predict(rec.verified, local);
  assert.ok(Math.hypot(flung.p[0] - sent.p[0], flung.p[1] - sent.p[1]) > 1);
});

test("estimator recovers speed from local history", () => {
  const est = createEstimator();
  for (let t = 0; t < 12; t += 1) observe(est, t, [t * 0.2, 0, 0], 0); // 6 m/s
  const e = estimate(est);
  assert.ok(Math.abs(e.v[0] - 6) < 1e-6);
  assert.ok(Math.abs(e.a[0]) < 1e-6);
});

test("a slow sender is coasted at its tick rate, not at 30 Hz", () => {
  const view = createView();
  const rec = createSendState();
  const moving = { tick: 1000, p: [0, 0, 0], v: [6, 0, 0], a: [0, 0, 0], yaw: 0, yawRate: 0, pitch: 0, floor: 0, mode: 1 };
  receive(view, sendNow(rec, moving), moving.tick, 0, 1000);
  // Position matches a 30 Hz coast so the blend offset stays put; the tick gap says 15 Hz.
  const next = { ...moving, tick: moving.tick + 15, p: [6, 0, 0] };
  receive(view, sendNow(rec, next), next.tick, 0, 2000);
  assert.ok(Math.abs(view.senderHz - 15) < 0.01, `hz ${view.senderHz}`);
  const seen = shown(view, next.tick, 2200);
  const coast = seen.p[0] - view.state.p[0];
  // 6 m/s of sim, run at 15 Hz, is 3 m/s of wall time. 0.2 s → 0.6 m (30 Hz would be 1.2 m).
  assert.ok(Math.abs(coast - 0.6) < 0.08, `coast ${coast}`);
});

test("a dropped correction is resent until the peer confirms it", () => {
  const rec = createSendState();
  const still = { tick: 1000, p: [0, 0, 0], v: [0, 0, 0], a: [0, 0, 0], yaw: 0, yawRate: 0, pitch: 0, floor: 0, mode: 1 };
  sendNow(rec, still, 2);
  noteAck(rec, rec.verified.tick);
  const moved = { ...still, tick: 1004, p: [3, 0, 0] };
  assert.equal(shouldSend(rec, moved, 2), "error");
  sendNow(rec, moved, 2);
  // Unseen minGap is 15. The newest state predicts the body, so the error bound stays
  // quiet — but the peer has not confirmed it, and the acked state is 3 m off.
  const held = { ...moved, tick: 1008 };
  assert.equal(shouldSend(rec, held, 2), "loss");
  sendNow(rec, held, 2);
  noteAck(rec, rec.verified.tick);
  assert.equal(shouldSend(rec, { ...moved, tick: 1012 }, 2), null);
  // Near tier corrects on the next tick anyway, so a missing ack is not a second stream.
  const near = createSendState();
  sendNow(near, still, 0);
  noteAck(near, near.verified.tick);
  sendNow(near, moved, 0);
  assert.equal(shouldSend(near, { ...moved, tick: 1008 }, 0), null);
});

test("a page behind 30 Hz sends before that coast leaves the body", () => {
  const rec = createSendState();
  const now = { tick: 1000, p: [0, 0, 0], v: [6, 0, 0], a: [0, 0, 0], yaw: 0, yawRate: 0, pitch: 0, floor: 0, mode: 1, wallMs: 5000 };
  sendNow(rec, now, 2);
  noteAck(rec, rec.verified.tick);
  const tick = now.tick + 3;
  const matched = predict(rec.verified, tick);
  const slow = { ...now, tick, p: matched.p, yaw: matched.yaw, wallMs: now.wallMs + 500 };
  assert.equal(shouldSend(rec, slow, 2), "wall");
  const kept = { ...slow, wallMs: now.wallMs + (3 / 30) * 1000 };
  assert.equal(shouldSend(rec, kept, 2), null);
});

test("a coast stops two metres out instead of running off", () => {
  const state = { tick: 0, p: [0, 0, 0], v: [6, 0, 0], a: [0, 0, 0], yaw: 0, yawRate: 0, pitch: 0, floor: 0, mode: 1 };
  const far = predict(state, 30);
  assert.ok(Math.hypot(far.p[0], far.p[1]) <= COAST_M + 0.01, far.p[0]);
  const near = predict(state, 5);
  assert.ok(Math.abs(near.p[0] - 1) < 0.05, near.p[0]);
});

test("simulated 10 clients: v3 is far cheaper than v2 with small near error", () => {
  const v2 = simulate({ n: 10, seconds: 20, mode: "v2" });
  const v3 = simulate({ n: 10, seconds: 20, mode: "v3" });
  assert.ok(v3.total.bytes < v2.total.bytes / 2, `${v3.total.bytes} vs ${v2.total.bytes}`);
  assert.ok(v3.perPairMoving < 150);
  assert.ok(v3.error.tiers[0].mean < 0.1, `near mean ${v3.error.tiers[0].mean}`);
});
