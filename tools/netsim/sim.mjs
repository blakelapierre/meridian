// Headless pose-traffic simulator (Batch 6). It runs N players with the real movement sim
// (src/sim/hands.js stepHands) and the real pose encoders, in a full mesh, and measures the
// bytes and messages each client sends and receives, plus the receiver-side position error.
//
//   node tools/netsim/sim.mjs [--mode v2|v3|both] [--n 25] [--seconds 60] [--loss 0.01] [--scale]
//
// v2 = PR #21 behaviour: change-only 13–15 B poses at the sim tick, 1 Hz keepalive, 80 m interest
//      cut; the receiver shows the last pose it got.
// v3 = Batch 6: per-receiver tiers + dead reckoning (src/net/motion.js); the receiver shows the
//      prediction plus a fading correction.
import { createPlayer, createPlayerWorld, createStamina } from "../../src/sim/player.js";
import { stepHands } from "../../src/sim/hands.js";
import { BASE_FOV } from "../../src/sim/sight.js";
import { encodePoseV2, poseDue, wrapYaw } from "../../src/net/wire.js";
import {
  TICK_HZ, TIERS, createEstimator, createSendState, createView, estimate, modeOf, observe, receive,
  sendNow, settle, shouldSend, shown, tierFor, noteAck,
} from "../../src/net/motion.js";

const HFOV = 2 * Math.atan(Math.tan((BASE_FOV * Math.PI) / 360) * (16 / 9));
const RANGE = 80;
const WIRE_OVERHEAD = 60; // IPv4 20 + UDP 8 + DTLS ~13 + SCTP common 12 + DATA chunk 16 ≈ 60–70 B per message

function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Activities, chosen every 2–7 s: idle, walk, run, turn in place, hop (walk + jumps).
const ACTS = [["idle", 0.22], ["walk", 0.33], ["run", 0.2], ["turn", 0.1], ["hop", 0.15]];

function makeClients(n, rand) {
  const clients = [];
  const clustered = Math.max(2, Math.round(n * 0.4));
  for (let i = 0; i < n; i += 1) {
    const inCluster = i < clustered;
    const home = inCluster ? [rand() * 30 - 15, rand() * 30 - 15] : [rand() * 600 - 300, rand() * 600 - 300];
    const player = createPlayer([home[0], home[1], 0]);
    const world = createPlayerWorld(player);
    world.ground = 0;
    world.drop = 0;
    world.gravity = [0, 0, -9.81];
    clients.push({
      i, player, world, stamina: createStamina(), home, inCluster, yaw: rand() * 6.28, pitch: 0, yawRate: 0,
      act: "idle", until: 0, est: createEstimator(),
      up: 0, down: 0, upMsg: 0, downMsg: 0, moving: 0,
    });
  }
  return clients;
}

function drive(c, tick, rand) {
  if (tick >= c.until) {
    let r = rand();
    for (const [name, w] of ACTS) { if ((r -= w) <= 0) { c.act = name; break; } }
    c.until = tick + Math.round((2 + rand() * 5) * TICK_HZ);
    c.yawRate = (rand() - 0.5) * (c.act === "turn" ? 3 : 0.8);
  }
  // Steer back home when wandering off (clustered players stay within ~20 m of the cluster centre).
  const leash = c.inCluster ? 20 : 120;
  const dx = c.home[0] - c.player.position[0];
  const dy = c.home[1] - c.player.position[1];
  if (Math.hypot(dx, dy) > leash) {
    const want = Math.atan2(dx, dy);
    c.yawRate = Math.max(-2, Math.min(2, wrapYaw(want - c.yaw) * 2));
  } else if (rand() < 0.02) c.yawRate += (rand() - 0.5) * 0.6;
  c.yaw = wrapYaw(c.yaw + c.yawRate / TICK_HZ);
  c.pitch = Math.max(-0.5, Math.min(0.5, c.pitch + (rand() - 0.5) * 0.02));
  const go = c.act === "walk" || c.act === "run" || c.act === "hop";
  return {
    yaw: c.yaw, forward: go ? 1 : 0, strafe: 0, sprint: c.act === "run",
    jump: c.act === "hop" && rand() < 0.04,
  };
}

export function simulate({ n = 25, seconds = 60, mode = "v3", loss = 0.01, seed = 7 } = {}) {
  const rand = rng(seed * 1000 + n);
  const lossRand = rng(seed * 7 + 3);
  const clients = makeClients(n, rand);
  const ticks = seconds * TICK_HZ;
  const pair = clients.map(() => clients.map(() => ({ last: null, send: createSendState(), view: createView(), shownPose: null, viewOf: null })));
  const err = TIERS.map(() => ({ sum: 0, max: 0, count: 0, samples: [] }));
  const errAll = { sum: 0, max: 0, count: 0, samples: [] };
  const reasons = {};
  let corrections = 0;
  let sendsNear = 0;
  let pairBytesMoving = 0;
  let pairTicksMoving = 0;
  const warm = 2 * TICK_HZ;

  for (let tick = 0; tick < ticks; tick += 1) {
    for (const c of clients) {
      const input = drive(c, tick, rand);
      stepHands(c.world, c.player, c.stamina, input);
      observe(c.est, tick, c.player.position, c.yaw);
      if (Math.hypot(c.player.velocity[0], c.player.velocity[1]) > 0.3) c.moving += 1;
    }
    for (const s of clients) {
      const truth = { tick, x: s.player.position[0], y: s.player.position[1], z: s.player.position[2], yaw: s.yaw, pitch: s.pitch };
      const airborne = s.player.position[2] > 0.12;
      const e = estimate(s.est);
      const now = { tick, p: [...s.player.position], v: e.v, a: e.a, yaw: s.yaw, yawRate: e.yawRate, pitch: s.pitch, floor: 0, mode: modeOf(e.v, airborne) };
      const sMoving = Math.hypot(s.player.velocity[0], s.player.velocity[1]) > 0.3;
      let encodedV2 = null;
      for (const r of clients) {
        if (r === s) continue;
        const link = pair[s.i][r.i];
        const d = Math.hypot(r.player.position[0] - truth.x, r.player.position[1] - truth.y);
        // The sender learns the receiver's view for free: the receiver's own pose stream, as the
        // sender currently draws it, plus fov/range from the hello (sent once, not counted here).
        if (mode === "v3") {
          const seen = shown(pair[r.i][s.i].view, tick);
          link.viewOf = seen ? { x: seen.p[0], y: seen.p[1], yaw: seen.yaw, fov: HFOV, range: RANGE } : null;
        }
        let bytes = null;
        if (mode === "v2") {
          const known = link.shownPose;
          const reach = 80;
          if (!(known && d > reach) && poseDue(link.last, truth, (tick * 1000) / TICK_HZ)) {
            link.last = { ...truth, at: (tick * 1000) / TICK_HZ };
            encodedV2 ||= encodePoseV2(truth);
            bytes = encodedV2;
            reasons.v2 = (reasons.v2 || 0) + 1;
          }
        } else {
          const tierIdx = tierFor(link.viewOf, now.p);
          const why = shouldSend(link.send, now, tierIdx);
          if (why) {
            bytes = sendNow(link.send, now, tierIdx);
            reasons[why] = (reasons[why] || 0) + 1;
          }
        }
        if (bytes) {
          s.up += bytes.length; s.upMsg += 1;
          if (sMoving) pairBytesMoving += bytes.length;
          if (lossRand() >= loss) {
            r.down += bytes.length; r.downMsg += 1;
            if (mode === "v2") link.shownPose = { p: [truth.x, truth.y, truth.z] };
            else {
              receive(link.view, bytes, tick, 0);
              noteAck(link.send, link.send.verified?.tick);
            }
          }
        }
        if (sMoving) pairTicksMoving += 1;
        // What r draws for s this tick, against where s really is.
        let drawn = null;
        if (mode === "v2") drawn = link.shownPose?.p;
        else { const pose = shown(link.view, tick); drawn = pose?.p; settle(link.view); }
        if (!drawn || tick < warm) continue;
        const e2 = Math.hypot(drawn[0] - truth.x, drawn[1] - truth.y, drawn[2] - truth.z);
        // Error is graded by the tier the receiver would see s in right now (true view, not stale).
        const tierIdx = tierFor({ x: r.player.position[0], y: r.player.position[1], yaw: r.yaw, fov: HFOV, range: RANGE }, [truth.x, truth.y]);
        for (const bucket of [err[tierIdx], errAll]) {
          bucket.sum += e2; bucket.count += 1; if (e2 > bucket.max) bucket.max = e2;
          if (bucket.samples.length < 400000) bucket.samples.push(e2);
        }
        if (tierIdx === 0 && bytes) sendsNear += 1;
      }
    }
  }
  for (const row of pair) for (const link of row) corrections += link.view.corrections;
  const secs = seconds;
  const per = clients.map((c) => ({ up: c.up / secs, down: c.down / secs, upMsg: c.upMsg / secs, downMsg: c.downMsg / secs }));
  const sum = (k) => per.reduce((a, p) => a + p[k], 0);
  const p99 = (arr) => { if (!arr.length) return 0; const s = [...arr].sort((a, b) => a - b); return s[Math.floor(s.length * 0.99)]; };
  const pairs = n * (n - 1);
  return {
    mode, n, seconds, loss,
    perClient: { up: sum("up") / n, down: sum("down") / n, upMsg: sum("upMsg") / n, downMsg: sum("downMsg") / n, maxUp: Math.max(...per.map((p) => p.up)) },
    total: { bytes: sum("up"), msgs: sum("upMsg"), wire: sum("up") + sum("upMsg") * WIRE_OVERHEAD },
    perPairMoving: pairTicksMoving ? (pairBytesMoving / pairTicksMoving) * TICK_HZ : 0,
    perPairAll: sum("up") / pairs,
    movingShare: clients.reduce((a, c) => a + c.moving, 0) / (n * ticks),
    error: {
      all: { mean: errAll.sum / Math.max(1, errAll.count), p99: p99(errAll.samples), max: errAll.max },
      tiers: err.map((b, k) => ({ tier: TIERS[k].name, share: b.count / Math.max(1, errAll.count), mean: b.sum / Math.max(1, b.count), p99: p99(b.samples), max: b.max })),
    },
    correctionsPerPairPerS: corrections / pairs / secs,
    reasons,
  };
}

const f = (x, d = 0) => x.toFixed(d);
function table(rows) {
  const out = [];
  out.push("| mode | clients | up B/s per client | down B/s per client | up msg/s per client | total B/s (payload) | total B/s (+~60 B/msg wire est.) | B/s per pair, sender moving |");
  out.push("|---|---|---|---|---|---|---|---|");
  for (const r of rows) out.push(`| ${r.mode} | ${r.n} | ${f(r.perClient.up)} | ${f(r.perClient.down)} | ${f(r.perClient.upMsg, 1)} | ${f(r.total.bytes)} | ${f(r.total.wire)} | ${f(r.perPairMoving, 1)} |`);
  return out.join("\n");
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const arg = (name, dflt) => { const i = process.argv.indexOf(`--${name}`); return i > 0 ? process.argv[i + 1] : dflt; };
  const n = Number(arg("n", 25));
  const seconds = Number(arg("seconds", 60));
  const loss = Number(arg("loss", 0.01));
  const modes = arg("mode", "both") === "both" ? ["v2", "v3"] : [arg("mode")];
  const results = modes.map((mode) => simulate({ n, seconds, mode, loss }));
  console.log(table(results));
  for (const r of results) {
    console.log(`\n${r.mode}: moving ${f(r.movingShare * 100)}% of the time; corrections/pair/s ${f(r.correctionsPerPairPerS, 3)}; send reasons ${JSON.stringify(r.reasons)}`);
    console.log(`error all: mean ${f(r.error.all.mean, 3)} m, p99 ${f(r.error.all.p99, 3)} m, max ${f(r.error.all.max, 3)} m`);
    for (const t of r.error.tiers) console.log(`  ${t.tier}: ${f(t.share * 100, 1)}% of samples, mean ${f(t.mean, 3)} m, p99 ${f(t.p99, 3)} m, max ${f(t.max, 3)} m`);
  }
  if (process.argv.includes("--scale")) {
    const rows = [];
    for (const size of [2, 5, 10, 25, 50]) for (const mode of modes) rows.push(simulate({ n: size, seconds: Math.min(seconds, 30), mode, loss }));
    console.log(`\nScaling (${Math.min(seconds, 30)} s each)\n${table(rows)}`);
  }
}
