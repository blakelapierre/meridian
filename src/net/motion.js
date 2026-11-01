// Pose wire v3: interest-tiered dead reckoning (Batch 6).
//
// The sender and each receiver run the same deterministic predictor from the last state the sender
// actually put on the wire, after quantization (the "verified" state). The sender keeps one copy of
// that state per receiver and sends only when the receiver's prediction would drift past an error
// bound for that receiver's tier, when the motion mode changes (start, stop, jump, land), or on a
// slow keepalive. The receiver blends each correction in over CORRECT_S instead of snapping.
//
// Frame (snap channel): 0xB3, flags, varint tick, zigzag x/y/z (cm), [zigzag vx/vy/vz (2 cm/s)],
// [int8 ax/ay/az (0.25 m/s²)], uint16 yaw (2pi/65536), [int8 yaw rate (0.04 rad/s)], int8 pitch
// (0.0125 rad). Quantization errors are well below the smallest error bound (5 cm).
import { wrapYaw } from "./wire.js";

export const POSE_V3 = 0xb3;
export const TICK_HZ = 30;
export const CORRECT_S = 0.2;
const MAX_PREDICT_S = 1.5; // past this, hold position rather than extrapolate into walls
const A_MAX = [8, 8, 12]; // m/s^2
const ACCEL_S = 0.5; // acceleration only shapes the first half second

// Receiver interest tiers. err is a position bound in metres, yawErr in radians, minGap the least
// number of ticks between two sends, keepalive the most.
export const TIERS = [
  { name: "near-visible", err: 0.05, yawErr: 0.05, minGap: 1, keepalive: 60 }, // up to 30 Hz
  { name: "mid-visible", err: 0.25, yawErr: 0.15, minGap: 5, keepalive: 90 }, // up to 6 Hz
  { name: "unseen", err: 1.0, yawErr: 0.6, minGap: 15, keepalive: 150 }, // up to 2 Hz
  { name: "beyond", err: 4.0, yawErr: Math.PI, minGap: 60, keepalive: 300 }, // up to 0.5 Hz, 10 s keepalive
];
// Yaw also steers the receiver's frustum test on the *other* side, so within perception range a
// turn goes out within VIEW_GAP ticks once it passes VIEW_YAW, whatever the tier.
const VIEW_YAW = 0.3;
const VIEW_GAP = 8;

// view: what the receiver advertises (position, yaw, horizontal fov in radians, perception range in m).
export function tierFor(view, at) {
  if (!view) return 1;
  const dx = at[0] - view.x;
  const dy = at[1] - view.y;
  const d = Math.hypot(dx, dy);
  if (d > (view.range || 80) + 20) return 3; // 20 m margin: sharpen before it enters perception range
  const ahead = [Math.sin(view.yaw), Math.cos(view.yaw)];
  const cos = d < 1e-6 ? 1 : (dx * ahead[0] + dy * ahead[1]) / d;
  const half = (view.fov || 1.4) / 2 + 0.25; // margin so a peer is already sharp when it slides into view
  const onScreen = cos >= Math.cos(Math.min(Math.PI, half));
  if (d < 6) return 0; // within arm's reach, behind or not
  if (onScreen) return d < 35 ? 0 : 1;
  return d < 15 ? 1 : 2;
}

// View advert on ctrl, sent at most every second: JSON so a v2 peer that doesn't know it ignores it.
export function viewMessage({ x, y, yaw, fov, range }) {
  return JSON.stringify({ t: "view", x: Math.round(x), y: Math.round(y), yaw: Math.round(wrapYaw(yaw) * 100) / 100, fov: Math.round(fov * 100) / 100, range: Math.round(range) });
}

export function readView(text) {
  try {
    const m = JSON.parse(typeof text === "string" ? text : new TextDecoder().decode(text));
    if (m?.t !== "view") return null;
    return { x: +m.x || 0, y: +m.y || 0, yaw: +m.yaw || 0, fov: +m.fov || 1.4, range: +m.range || 80 };
  } catch {
    return null;
  }
}

// Velocity and acceleration from local history (sender side): least-squares slope over the
// last few ticks, then the difference of two such slopes for acceleration.
export function createEstimator(size = 6) {
  return { size, hist: [] };
}

export function observe(est, tick, pos, yaw) {
  est.hist.push({ tick, p: [pos[0], pos[1], pos[2]], yaw });
  if (est.hist.length > est.size * 2) est.hist.shift();
}

function slope(samples, pick) {
  const n = samples.length;
  if (n < 2) return 0;
  let st = 0;
  let sv = 0;
  for (const s of samples) { st += s.tick; sv += pick(s); }
  const mt = st / n;
  const mv = sv / n;
  let num = 0;
  let den = 0;
  for (const s of samples) { num += (s.tick - mt) * (pick(s) - mv); den += (s.tick - mt) ** 2; }
  return den ? (num / den) * TICK_HZ : 0;
}

export function estimate(est) {
  const h = est.hist;
  const recent = h.slice(-Math.min(3, h.length));
  const older = h.slice(-est.size, -est.size + 3 || undefined);
  const v = [0, 1, 2].map((k) => slope(recent, (s) => s.p[k]));
  const vOld = [0, 1, 2].map((k) => slope(older, (s) => s.p[k]));
  const span = older.length && recent.length ? (recent.at(-1).tick - older.at(-1).tick) / TICK_HZ : 0;
  // Clamp to what a body can actually do; start/stop spikes would otherwise fling the prediction.
  const a = span > 0 ? v.map((value, k) => Math.max(-A_MAX[k], Math.min(A_MAX[k], (value - vOld[k]) / span))) : [0, 0, 0];
  const yawRate = recent.length >= 2 ? wrapYaw(recent.at(-1).yaw - recent[0].yaw) / ((recent.at(-1).tick - recent[0].tick) / TICK_HZ) : 0;
  return { v, a, yawRate };
}

// Shared deterministic predictor. Both sides call this on the same verified state.
export function predict(state, tick) {
  const dt = Math.max(0, Math.min(MAX_PREDICT_S, (tick - state.tick) / TICK_HZ));
  const da = Math.min(dt, ACCEL_S);
  const p = [0, 1, 2].map((k) => state.p[k] + state.v[k] * dt + state.a[k] * (da * dt - da * da / 2));
  // A body on flat ground does not keep sinking: a falling prediction stops at the sender's last ground.
  if (state.floor !== undefined && p[2] < state.floor) p[2] = state.floor;
  return { p, yaw: wrapYaw(state.yaw + state.yawRate * dt), pitch: state.pitch };
}

const q = (value, step) => Math.round(value / step);
const MODE = { idle: 0, move: 1, air: 2 };
export function modeOf(v, airborne) {
  if (airborne) return MODE.air;
  return Math.hypot(v[0], v[1]) > 0.3 ? MODE.move : MODE.idle;
}

class W {
  constructor() { this.b = []; }
  u8(v) { this.b.push(v & 255); }
  i8(v) { this.u8(Math.max(-127, Math.min(127, v))); }
  u16(v) { this.u8(v); this.u8(v >> 8); }
  varint(v) { v >>>= 0; while (v >= 0x80) { this.u8((v & 0x7f) | 0x80); v >>>= 7; } this.u8(v); }
  zz(v) { this.varint(((v << 1) ^ (v >> 31)) >>> 0); }
}

// Encode a send and return both the bytes and the verified state the receiver will rebuild.
export function encodeMotion({ tick, p, v, a, yaw, yawRate, pitch, floor }, mode) {
  const moving = mode !== MODE.idle;
  const vq = moving ? v.map((x) => q(x, 0.02)) : [0, 0, 0];
  const aq = a.map((x) => Math.max(-127, Math.min(127, q(x, 0.25))));
  const hasA = moving && aq.some((x) => x !== 0);
  const rq = Math.max(-127, Math.min(127, q(yawRate, 0.04)));
  const hasR = rq !== 0;
  const w = new W();
  w.u8(POSE_V3);
  w.u8((moving ? 1 : 0) | (hasA ? 2 : 0) | (hasR ? 4 : 0) | (mode << 3));
  w.varint(tick);
  for (const x of p) w.zz(q(x, 0.01));
  if (moving) for (const x of vq) w.zz(x);
  if (hasA) for (const x of aq) w.i8(x);
  w.u16(Math.round(((wrapYaw(yaw) + Math.PI) / (Math.PI * 2)) * 65536) & 0xffff);
  if (hasR) w.i8(rq);
  w.i8(q(pitch, 0.0125));
  const bytes = Uint8Array.from(w.b);
  return { bytes, state: decodeMotion(bytes, floor) };
}

export function decodeMotion(bytes, floor) {
  let at = 1;
  const u8 = () => bytes[at++];
  const i8 = () => { const v = bytes[at++]; return v > 127 ? v - 256 : v; };
  const varint = () => { let v = 0; let s = 0; for (;;) { const b = u8(); v += (b & 0x7f) * 2 ** s; if (b < 0x80) return v; s += 7; } };
  const zz = () => { const v = varint(); return v % 2 ? -(v + 1) / 2 : v / 2; };
  const flags = u8();
  const tick = varint();
  const p = [zz() / 100, zz() / 100, zz() / 100];
  const v = flags & 1 ? [zz() * 0.02, zz() * 0.02, zz() * 0.02] : [0, 0, 0];
  const a = flags & 2 ? [i8() * 0.25, i8() * 0.25, i8() * 0.25] : [0, 0, 0];
  const yaw = wrapYaw(((bytes[at] | (bytes[at + 1] << 8)) / 65536) * Math.PI * 2 - Math.PI);
  at += 2;
  const yawRate = flags & 4 ? i8() * 0.04 : 0;
  const pitch = i8() * 0.0125;
  const mode = (flags >> 3) & 3;
  // Airborne states keep their fall; grounded ones are pinned to the height they were sent at.
  return { tick, p, v, a, yaw, yawRate, pitch, mode, floor: mode === MODE.air ? floor : p[2] };
}

export function isMotion(bytes) {
  return bytes[0] === POSE_V3 && bytes.length !== 16 && bytes.length !== 24;
}

// Sender: one record per receiver.
export function createSendState() {
  return { verified: null, lastTick: -1e9, mode: -1, tier: 3 };
}

// Decide whether to send `now` (local truth plus estimate) to a receiver with this tier.
export function shouldSend(rec, now, tierIndex) {
  const tier = TIERS[tierIndex];
  const gap = now.tick - rec.lastTick;
  if (!rec.verified) return "first";
  if (now.mode !== rec.mode && gap >= 1) return "mode";
  const guess = predict(rec.verified, now.tick);
  const turned = Math.abs(wrapYaw(guess.yaw - now.yaw));
  // A receiver that just came into a sharper tier gets a fresh state at once.
  if (tierIndex < (rec.tier ?? 3) && gap >= 1) return "tier";
  if (tierIndex < 3 && gap >= VIEW_GAP && turned > VIEW_YAW) return "view";
  if (gap < tier.minGap) return null;
  if (gap >= tier.keepalive) return "keepalive";
  const err = Math.hypot(guess.p[0] - now.p[0], guess.p[1] - now.p[1], guess.p[2] - now.p[2]);
  if (err > tier.err) return "error";
  // Loss guard: sends are unreliable, so the receiver may still hold the previous state. If that one
  // has drifted badly, resend (cheap: only after big changes, and both copies agree otherwise).
  if (rec.prev) {
    const old = predict(rec.prev, now.tick);
    const oldErr = Math.hypot(old.p[0] - now.p[0], old.p[1] - now.p[1], old.p[2] - now.p[2]);
    if (oldErr > Math.max(4 * tier.err, 0.5) && gap >= Math.max(3, tier.minGap)) { rec.prev = null; return "loss"; }
  }
  if (turned > tier.yawErr) return "yaw";
  return null;
}

export function sendNow(rec, now, tierIndex = 3) {
  rec.tier = tierIndex;
  const { bytes, state } = encodeMotion(now, now.mode);
  rec.prev = rec.verified;
  rec.verified = state;
  rec.lastTick = now.tick;
  rec.mode = now.mode;
  return bytes;
}

// Receiver: predicted pose plus a decaying offset that hides each correction.
export function createView() {
  return { state: null, offset: [0, 0, 0], yawOffset: 0, corrections: 0 };
}

export function receive(view, bytes, tick, floor) {
  const next = decodeMotion(bytes, floor);
  if (view.state && next.tick < view.state.tick) return false;
  if (view.state) {
    const was = shown(view, tick);
    const now = predict(next, tick);
    view.offset = [0, 1, 2].map((k) => was.p[k] - now.p[k]);
    // A jump of more than 3 m is a teleport (respawn, tour): snap.
    if (Math.hypot(...view.offset) > 3) view.offset = [0, 0, 0];
    view.yawOffset = wrapYaw(was.yaw - now.yaw);
    view.corrections += 1;
  }
  view.state = next;
  return true;
}

export function shown(view, tick, dt = 1 / TICK_HZ) {
  if (!view.state) return null;
  const base = predict(view.state, tick);
  return { p: base.p.map((x, k) => x + view.offset[k]), yaw: wrapYaw(base.yaw + view.yawOffset), pitch: base.pitch };
}

// Call once per tick after shown(): the offset fades out over about CORRECT_S.
export function settle(view, dt = 1 / TICK_HZ) {
  const keep = Math.exp(-dt / (CORRECT_S / 3));
  view.offset = view.offset.map((x) => x * keep);
  view.yawOffset *= keep;
}
