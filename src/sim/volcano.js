// The volcano: a seeded cinder cone in the southwest of the island, with a glowing lava lake in its
// crater, lava channels down its flanks, lava bombs on a shared clock, cinders and ash downwind, a
// smoke plume, and a heat field that makes the air shimmer. A pure function of the world seed, baked
// once to its own 0.5 m grid (like the north land in land.js). The voxel crust is not touched.
//
// Grid channels: R ground offset over the dunes, G lava cover (0..1), B distance along the lava
// (m, for the flow animation), A baked heat of the ground (0..1: lava, the crater, hot rock near it).
import { diamondSquare, sampleField } from "./diamond.js?v=1";
import { LAND_SEED, hashU } from "./land.js?v=2";

export const VOLCANO = { x: -155, y: -55, radius: 72, height: 38, rim: 12, lakeRadius: 6.5, depth: 8 };
export const VOLC_CELL = 0.5;
export const VOLC_N = 320;
export const VOLC_W = VOLC_N * VOLC_CELL;
export const VOLC_X0 = VOLCANO.x - VOLC_W / 2;
export const VOLC_Y0 = VOLCANO.y - VOLC_W / 2;
// Ash and cinders drift with this wind (unit vector, toward the west-southwest, out to sea).
export const WIND = { x: -0.83, y: -0.55 };
export const PLUME_TOP = 95;
export const GRAVITY = 9.8;
export const ERUPT_PERIOD = 6;
export const MAX_BOMBS = 12;
export const BOMB_COOL = 4;
const FLOWS = 3;
const DS_LEVELS = 8;

function fnv(text) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) h = Math.imul(h ^ text.charCodeAt(i), 16777619) >>> 0;
  return h >>> 0;
}
function u01(h) {
  return (h >>> 8) / 16777216;
}
function smoothstep(a, b, v) {
  const t = Math.max(0, Math.min(1, (v - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

const dsCache = new Map();
export function volcanoFractal(seed) {
  let f = dsCache.get(seed);
  if (!f) {
    f = diamondSquare(DS_LEVELS, (seed ^ 0x1f3a5c77) >>> 0, 0.58);
    dsCache.set(seed, f);
  }
  return f;
}
function fractal(x, y, seed, scale = 1) {
  const cell = VOLC_W / (1 << DS_LEVELS);
  return sampleField(volcanoFractal(seed), ((x - VOLC_X0) / cell) * scale, ((y - VOLC_Y0) / cell) * scale);
}

export function inVolcano(x, y) {
  return x >= VOLC_X0 && y >= VOLC_Y0 && x < VOLC_X0 + VOLC_W && y < VOLC_Y0 + VOLC_W;
}

// The rim's radius at a bearing: a little ragged.
function rimAt(x, y, seed) {
  const a = Math.atan2(y - VOLCANO.y, x - VOLCANO.x);
  return VOLCANO.rim * (1 + 0.1 * fractal(VOLCANO.x + Math.cos(a) * 30, VOLCANO.y + Math.sin(a) * 30, seed, 0.5));
}
export const LAVA_LEVEL = VOLCANO.height - VOLCANO.depth + 1.2;

// The cone before the lava cuts it: concave flanks, a lipped rim, a bowl, and diamond-square ridges
// and gullies strongest mid-flank. Zero at the foot.
export function coneHeight(x, y, seed = fnv(LAND_SEED)) {
  const r = Math.hypot(x - VOLCANO.x, y - VOLCANO.y);
  if (r >= VOLCANO.radius) return 0;
  const rim = rimAt(x, y, seed);
  const H = VOLCANO.height;
  const floor = H - VOLCANO.depth;
  let h;
  let u = 0;
  if (r >= rim) {
    u = (r - rim) / (VOLCANO.radius - rim);
    h = H * Math.pow(1 - u, 1.75);
  } else {
    const q = smoothstep(VOLCANO.lakeRadius * 0.4, rim, r);
    h = floor + (H - floor) * q * q;
  }
  h += 1.6 * Math.exp(-(((r - rim) / 2.6) ** 2));
  const env = r >= rim ? Math.pow(Math.sin(Math.PI * Math.min(1, u * 1.15)), 0.7) : 0.25;
  const ds = fractal(x, y, seed);
  const ridge = 1 - Math.abs(fractal(x, y, seed, 0.45));
  const a = Math.atan2(y - VOLCANO.y, x - VOLCANO.x);
  const gully = Math.sin(a * 11 + ds * 2.5) * 0.9;
  h += env * (ds * 1.8 + (ridge - 0.6) * 3.2 + gully);
  return Math.max(0, h) * smoothstep(VOLCANO.radius, VOLCANO.radius - 6, r);
}

// The cone stands on the dunes: a smooth max, so its heights (and the crater's) are its own.
function smax(a, b, k) {
  const h = Math.max(0, Math.min(1, 0.5 + (0.5 * (b - a)) / k));
  return a + (b - a) * h + k * h * (1 - h);
}
function coneGround(dune, x, y, seed) {
  const base = dune(x, y);
  const r = Math.hypot(x - VOLCANO.x, y - VOLCANO.y);
  if (r >= VOLCANO.radius) return base;
  return base + (smax(base, coneHeight(x, y, seed), 1.5) - base) * smoothstep(VOLCANO.radius, VOLCANO.radius - 4, r);
}

// Downhill on the uncut cone: a lava path from the crater lake out through a breach in the rim.
function planLava(dune, seed) {
  const ground = (x, y) => coneGround(dune, x, y, seed);
  const base = u01(hashU(3, 9, seed)) * Math.PI * 2;
  const flows = [];
  for (let f = 0; f < FLOWS; f += 1) {
    const bearing = base + (f * Math.PI * 2) / FLOWS + (u01(hashU(f, 41, seed)) - 0.5) * 0.9;
    let x = VOLCANO.x + Math.cos(bearing) * VOLCANO.lakeRadius;
    let y = VOLCANO.y + Math.sin(bearing) * VOLCANO.lakeRadius;
    let dx = Math.cos(bearing);
    let dy = Math.sin(bearing);
    const reach = VOLCANO.radius * (0.74 + 0.12 * u01(hashU(f, 43, seed)));
    const phase = u01(hashU(f, 47, seed)) * 6.28;
    const pts = [];
    let surface = LAVA_LEVEL - 0.05;
    let s = 0;
    for (let n = 0; n < 400; n += 1) {
      const r = Math.hypot(x - VOLCANO.x, y - VOLCANO.y);
      const g = ground(x, y);
      const f01 = Math.min(1, s / reach);
      surface = n === 0 ? surface : Math.min(surface - 0.012, g - 0.12);
      pts.push({ x, y, surface, half: 1.1 + 1.6 * f01, s, f: f01 });
      if (r > reach) break;
      // Out through the rim on the bearing, then down the steepest slope with a little wander.
      const e = 1;
      const gx = (ground(x + e, y) - ground(x - e, y)) / (2 * e);
      const gy = (ground(x, y + e) - ground(x, y - e)) / (2 * e);
      const ox = (x - VOLCANO.x) / (r || 1);
      const oy = (y - VOLCANO.y) / (r || 1);
      const downhill = r > VOLCANO.rim + 3 ? 1.6 : 0;
      const wander = 0.35 * Math.sin(n * 0.11 + phase);
      let nx = dx * 2.2 - gx * downhill * 3 + ox * 0.9 + -oy * wander;
      let ny = dy * 2.2 - gy * downhill * 3 + oy * 0.9 + ox * wander;
      const l = Math.hypot(nx, ny) || 1;
      dx = nx / l;
      dy = ny / l;
      x += dx;
      y += dy;
      s += 1;
    }
    flows.push(pts);
  }
  return flows;
}

const cache = new Map();
export function bakeVolcano(dune, seed = LAND_SEED, { fresh = false } = {}) {
  const hit = cache.get(seed);
  if (!fresh && hit && hit.dune === dune) return hit;
  const s = fnv(seed);
  const flows = planLava(dune, s);
  const n = VOLC_N * VOLC_N;
  const delta = new Float32Array(n);
  const lava = new Float32Array(n);
  const along = new Float32Array(n);
  const heat = new Float32Array(n);
  const near = new Float32Array(n).fill(1e9);
  const nearAt = new Float32Array(n).fill(-1);
  const nearF = new Int8Array(n).fill(-1);
  const center = (i, j) => [VOLC_X0 + (i + 0.5) * VOLC_CELL, VOLC_Y0 + (j + 0.5) * VOLC_CELL];
  for (let j = 0; j < VOLC_N; j += 1) {
    for (let i = 0; i < VOLC_N; i += 1) {
      const [x, y] = center(i, j);
      delta[j * VOLC_N + i] = coneGround(dune, x, y, s) - dune(x, y);
    }
  }
  flows.forEach((pts, fi) => {
    for (let v = 0; v + 1 < pts.length; v += 1) {
      const a = pts[v];
      const b = pts[v + 1];
      const pad = b.half + 14;
      const i0 = Math.max(0, Math.floor((Math.min(a.x, b.x) - pad - VOLC_X0) / VOLC_CELL));
      const i1 = Math.min(VOLC_N - 1, Math.ceil((Math.max(a.x, b.x) + pad - VOLC_X0) / VOLC_CELL));
      const j0 = Math.max(0, Math.floor((Math.min(a.y, b.y) - pad - VOLC_Y0) / VOLC_CELL));
      const j1 = Math.min(VOLC_N - 1, Math.ceil((Math.max(a.y, b.y) + pad - VOLC_Y0) / VOLC_CELL));
      const ex = b.x - a.x;
      const ey = b.y - a.y;
      const e2 = ex * ex + ey * ey || 1;
      for (let j = j0; j <= j1; j += 1) {
        for (let i = i0; i <= i1; i += 1) {
          const [x, y] = center(i, j);
          const t = Math.max(0, Math.min(1, ((x - a.x) * ex + (y - a.y) * ey) / e2));
          const d = Math.hypot(x - (a.x + ex * t), y - (a.y + ey * t));
          const k = j * VOLC_N + i;
          if (d < near[k]) {
            near[k] = d;
            nearAt[k] = v + t;
            nearF[k] = fi;
          }
        }
      }
    }
  });
  for (let j = 0; j < VOLC_N; j += 1) {
    for (let i = 0; i < VOLC_N; i += 1) {
      const k = j * VOLC_N + i;
      const [x, y] = center(i, j);
      const base = dune(x, y);
      let g = base + delta[k];
      let cover = 0;
      let s0 = 0;
      let hot = 0;
      const r = Math.hypot(x - VOLCANO.x, y - VOLCANO.y);
      // The crater lake: lava fills the bowl up to LAVA_LEVEL.
      if (g < LAVA_LEVEL && r < VOLCANO.rim) {
        cover = smoothstep(0, 0.35, LAVA_LEVEL - g);
        g = Math.max(g, LAVA_LEVEL - 0.6);
        if (cover > 0.5) g = LAVA_LEVEL;
      }
      hot = Math.max(hot, Math.exp(-Math.max(0, r - VOLCANO.lakeRadius) / 5) * (r < VOLCANO.rim + 4 ? 1 : 0.6));
      const inLake = cover > 0.5;
      if (nearAt[k] >= 0 && !inLake) {
        const pts = flows[nearF[k]];
        const v = Math.floor(nearAt[k]);
        const t = nearAt[k] - v;
        const a = pts[v];
        const b = pts[Math.min(pts.length - 1, v + 1)];
        const surface = a.surface + (b.surface - a.surface) * t;
        const half = a.half + (b.half - a.half) * t;
        const sAlong = a.s + (b.s - a.s) * t;
        const d = near[k];
        const cut = g - surface;
        const bandW = Math.min(12, Math.max(2.5, cut * 1.3));
        if (d < half) {
          g = surface;
          cover = Math.max(cover, 1 - smoothstep(half - 0.7, half, d));
          s0 = sAlong;
        } else if (d < half + bandW && cut > 0) {
          const q = smoothstep(half, half + bandW, d);
          const levee = surface + 0.5 * Math.exp(-((d - half - 0.8) ** 2) / 0.8);
          g = levee + (g - levee) * q;
        } else if (d < half + 1.8) {
          g += 0.5 * Math.exp(-((d - half - 0.8) ** 2) / 0.8);
        }
        if (d < half + 0.6 && s0 === 0) s0 = sAlong;
        const cool = 1 - 0.55 * (a.f + (b.f - a.f) * t);
        hot = Math.max(hot, Math.exp(-Math.max(0, d - half) / 2.6) * cool);
      }
      lava[k] = cover;
      along[k] = s0;
      heat[k] = Math.min(1, hot);
      delta[k] = g - base;
    }
  }
  const field = { dune, seed, seedHash: s, delta, lava, along, heat, flows };
  if (!fresh) cache.set(seed, field);
  return field;
}

function bilinear(grid, x, y) {
  const fx = (x - VOLC_X0) / VOLC_CELL - 0.5;
  const fy = (y - VOLC_Y0) / VOLC_CELL - 0.5;
  const i = Math.max(0, Math.min(VOLC_N - 2, Math.floor(fx)));
  const j = Math.max(0, Math.min(VOLC_N - 2, Math.floor(fy)));
  const u = Math.max(0, Math.min(1, fx - i));
  const v = Math.max(0, Math.min(1, fy - j));
  const k = j * VOLC_N + i;
  const a = grid[k];
  const b = grid[k + 1];
  const c = grid[k + VOLC_N];
  const d = grid[k + VOLC_N + 1];
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
export function volcanoDelta(field, x, y) {
  return inVolcano(x, y) ? bilinear(field.delta, x, y) : 0;
}
export function lavaAt(field, x, y) {
  return inVolcano(x, y) ? bilinear(field.lava, x, y) : 0;
}
export function groundHeat(field, x, y) {
  return inVolcano(x, y) ? bilinear(field.heat, x, y) : 0;
}

// Air temperature, 0..1: hot ground warms the air just over it, and the crater's plume rises and
// leans downwind. Exactly zero away from those (the shader's heatField is the same rule).
export function plumeShape(x, y, z) {
  const dz = z - LAVA_LEVEL;
  if (dz < -1 || dz > PLUME_TOP) return 0;
  const lean = Math.max(0, dz) * 0.35;
  const cx = VOLCANO.x + WIND.x * lean;
  const cy = VOLCANO.y + WIND.y * lean;
  const w = 5 + Math.max(0, dz) * 0.22;
  const d2 = (x - cx) ** 2 + (y - cy) ** 2;
  return Math.exp(-d2 / (w * w)) * (1 - dz / PLUME_TOP);
}
export function heatAt(field, x, y, z, ground) {
  let h = 0;
  if (inVolcano(x, y)) {
    const a = groundHeat(field, x, y);
    const g = ground ?? field.dune(x, y) + volcanoDelta(field, x, y);
    const up = z - g;
    if (a > 0.02 && up > -0.5) h += a * Math.exp(-Math.max(0, up) / 7);
  }
  h += 0.9 * plumeShape(x, y, z);
  h = Math.min(1, h);
  return h < 0.02 ? 0 : h;
}

// Ash and cinders: where they hang in the air, downwind of the plume and around the cone.
export function ashDensity(x, y, z) {
  const ox = x - VOLCANO.x;
  const oy = y - VOLCANO.y;
  const down = ox * WIND.x + oy * WIND.y;
  const side = -ox * WIND.y + oy * WIND.x;
  if (z < 0 || z > LAVA_LEVEL + 60) return 0;
  const along = Math.max(0, down + 20);
  const spread = 14 + along * 0.4;
  const d = Math.exp(-(side * side) / (spread * spread)) * Math.exp(-along / 110) * smoothstep(-25, 0, down);
  const v = d * smoothstep(LAVA_LEVEL + 60, LAVA_LEVEL + 20, z);
  return v < 0.02 ? 0 : v;
}

// Lava bombs. Burst e (every ERUPT_PERIOD seconds of the shared clock) is a pure function of e and
// the seed, so every peer that agrees on the time sees the same rocks without a byte on the network.
export function burst(e, seedHash) {
  const h = hashU(e, 77, seedHash);
  if (u01(h) >= 0.8) return [];
  const count = 2 + (h % 6);
  const bombs = [];
  for (let i = 0; i < count; i += 1) {
    const a = hashU(e, i + 1, seedHash ^ 0xb0b5);
    const b = hashU(e, i + 101, seedHash ^ 0xb0b5);
    const c = hashU(e, i + 201, seedHash ^ 0xb0b5);
    const az = u01(a) * Math.PI * 2;
    const el = 0.95 + 0.5 * u01(b);
    const speed = 15 + 13 * u01(c);
    bombs.push({
      id: `${e}:${i}`,
      t0: e * ERUPT_PERIOD + u01(hashU(e, i + 301, seedHash)) * ERUPT_PERIOD * 0.6,
      x0: VOLCANO.x + Math.cos(az) * 2,
      y0: VOLCANO.y + Math.sin(az) * 2,
      z0: LAVA_LEVEL + 0.5,
      vx: Math.cos(az) * Math.cos(el) * speed,
      vy: Math.sin(az) * Math.cos(el) * speed,
      vz: Math.sin(el) * speed,
      r: 0.3 + 0.5 * u01(hashU(e, i + 401, seedHash)),
    });
  }
  return bombs;
}

// When and where a bomb comes down: fixed steps against the ground, so the same answer everywhere.
const landed = new Map();
export function landing(bomb, ground) {
  let hit = landed.get(bomb.id);
  if (hit && hit.ground === ground) return hit;
  const dt = 1 / 32;
  let t = 0;
  let x = bomb.x0;
  let y = bomb.y0;
  let z = bomb.z0;
  for (let n = 0; n < 32 * 12; n += 1) {
    t = (n + 1) * dt;
    x = bomb.x0 + bomb.vx * t;
    y = bomb.y0 + bomb.vy * t;
    z = bomb.z0 + bomb.vz * t - 0.5 * GRAVITY * t * t;
    const vz = bomb.vz - GRAVITY * t;
    if (vz < 0 && z <= ground(x, y) + bomb.r * 0.5) break;
  }
  hit = { ground, t, x, y, z: ground(x, y) + bomb.r * 0.5 };
  if (landed.size > 512) landed.clear();
  landed.set(bomb.id, hit);
  return hit;
}

// The rocks in the air (and the ones still glowing where they fell) at time t, newest first.
export function bombsAt(t, seedHash, ground) {
  const out = [];
  const e1 = Math.floor(t / ERUPT_PERIOD);
  for (let e = e1; e >= e1 - 3; e -= 1) {
    for (const bomb of burst(e, seedHash)) {
      const age = t - bomb.t0;
      if (age < 0) continue;
      const down = landing(bomb, ground);
      if (age > down.t + BOMB_COOL) continue;
      if (age < down.t) {
        out.push({
          id: bomb.id,
          x: bomb.x0 + bomb.vx * age,
          y: bomb.y0 + bomb.vy * age,
          z: bomb.z0 + bomb.vz * age - 0.5 * GRAVITY * age * age,
          r: bomb.r,
          vx: bomb.vx,
          vy: bomb.vy,
          vz: bomb.vz - GRAVITY * age,
          heat: 1,
          flying: true,
        });
      } else {
        out.push({ id: bomb.id, x: down.x, y: down.y, z: down.z, r: bomb.r, vx: 0, vy: 0, vz: 0, heat: 1 - (age - down.t) / BOMB_COOL, flying: false });
      }
    }
  }
  return out.slice(0, MAX_BOMBS);
}

// The shared clock: wall time in seconds (every peer's clock, so eruptions line up to within the
// peers' clock skew). ?vtime=<seconds> pins its start for repeatable screenshots.
export function volcanoClock(pinned, startedMs, nowMs) {
  if (Number.isFinite(pinned)) return pinned + (nowMs - startedMs) / 1000;
  return nowMs / 1000;
}

// ?volcano=0 turns the live effects off (bombs, cinders, plume, moving lava); the cone stays, it is
// ground. ?heat=0 turns the shimmer off. Bots default both off.
export function volcanoLevel(raw, bot = false) {
  if (raw == null || raw === "") return bot ? 0 : 1;
  const v = Number(raw);
  if (!Number.isFinite(v)) return bot ? 0 : 1;
  return v > 0 ? 1 : 0;
}
export const heatLevel = volcanoLevel;

// For the picture: packed RGBA half floats, row-major from VOLC_Y0 upward.
export function volcanoTexels(field) {
  const out = new Float32Array(VOLC_N * VOLC_N * 4);
  for (let k = 0; k < VOLC_N * VOLC_N; k += 1) {
    out[k * 4] = field.delta[k];
    out[k * 4 + 1] = field.lava[k];
    out[k * 4 + 2] = field.along[k];
    out[k * 4 + 3] = field.heat[k];
  }
  return out;
}

export function volcanoDigest(field) {
  let h = 2166136261;
  for (const arr of [field.delta, field.lava, field.heat]) {
    const bytes = new Uint8Array(arr.buffer, arr.byteOffset, arr.byteLength);
    for (let i = 0; i < bytes.length; i += 5) h = Math.imul(h ^ bytes[i], 16777619) >>> 0;
  }
  return h.toString(16);
}

// ?look=volcano: out past the end of the first lava flow, facing the crater.
export function volcanoView(field) {
  const pts = field.flows[0];
  const end = pts[pts.length - 1];
  const ox = end.x - VOLCANO.x;
  const oy = end.y - VOLCANO.y;
  const l = Math.hypot(ox, oy) || 1;
  const x = end.x + (ox / l) * 22 + (-oy / l) * 8;
  const y = end.y + (oy / l) * 22 + (ox / l) * 8;
  return { x, y, yaw: Math.atan2(VOLCANO.x - x, VOLCANO.y - y), pitch: 0.16 };
}
