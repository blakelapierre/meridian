// The north landmark: a mountain with a spring near the top, a stream that widens downhill into a
// small lake, and a river from the lake out to the sea. Pines on the slopes, reeds and bushes on the
// banks, and fog banks that sit in the valley and over the lake.
//
// Everything here is a pure function of the world seed. The mountain noise uses integer hashing
// and arithmetic only (no Math.sin), so every peer bakes the same grid. The voxel crust is not
// touched: chunk hashes still cover only dug and filled voxels, so they match as before.
//
// The bake is a 0.5 m grid over the north of the island. The walk (life.js duneHeight) and the
// picture (gpu.js, as a texture) read the same numbers, so what you see is what you stand on.

import { diamondSquare, sampleField } from "./diamond.js?v=1";

export const LAND_SEED = "atoll-slice-1";
export const LAND_CELL = 0.5;
export const LAND_X0 = -160;
export const LAND_Y0 = 24;
export const LAND_NX = 832;
export const LAND_NY = 464;
export const LAND_W = LAND_NX * LAND_CELL;
export const LAND_H = LAND_NY * LAND_CELL;
export const ISLAND_R = 256;

export const MOUNTAIN = { x: -40, y: 160, radius: 104, height: 44 };
export const LAKE = { x: 70, y: 96, radius: 14, level: 2.2, depth: 1.6 };
// Tallest thing the land can hold: peak plus noise plus a pine on top. The trace starts its march below this.
export const LAND_TOP = 64;
export const PINE_CELL = 4.5;

function fnv(text) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) h = Math.imul(h ^ text.charCodeAt(i), 16777619) >>> 0;
  return h >>> 0;
}

// Integer hash of a lattice point, the same bits as hashU in the shader.
export function hashU(i, j, seed) {
  let h = (Math.imul(i | 0, 0x27d4eb2d) ^ Math.imul(j | 0, 0x165667b1) ^ seed) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35) >>> 0;
  return (h ^ (h >>> 16)) >>> 0;
}

function hash01(i, j, seed) {
  return (hashU(i, j, seed) >>> 8) / 16777216;
}

function fade(t) {
  return t * t * (3 - 2 * t);
}

function smoothstep(a, b, v) {
  const t = Math.max(0, Math.min(1, (v - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

function noise(x, y, seed) {
  const i = Math.floor(x);
  const j = Math.floor(y);
  const u = fade(x - i);
  const v = fade(y - j);
  const a = hash01(i, j, seed);
  const b = hash01(i + 1, j, seed);
  const c = hash01(i, j + 1, seed);
  const d = hash01(i + 1, j + 1, seed);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

// One diamond-square field per seed: 513² over the land box, about 0.8 m a cell.
export const DS_LEVELS = 9;
const DS_CELL = LAND_W / (1 << DS_LEVELS);
const dsCache = new Map();
export function landFractal(seed = fnv(LAND_SEED)) {
  let field = dsCache.get(seed);
  if (!field) {
    field = diamondSquare(DS_LEVELS, (seed ^ 0x6d2b79f5) >>> 0, 0.56);
    dsCache.set(seed, field);
  }
  return field;
}
// The fractal at a point: [-1, 1].
export function fractalAt(x, y, seed = fnv(LAND_SEED), scale = 1) {
  return sampleField(landFractal(seed), ((x - LAND_X0) / DS_CELL) * scale, ((y - LAND_Y0) / DS_CELL) * scale);
}
// Gentle fractal rolls over the north half only: zero at the land box's edges and south of it.
export function northFade(x, y) {
  return smoothstep(LAND_Y0, LAND_Y0 + 36, y) * smoothstep(LAND_Y0 + LAND_H, LAND_Y0 + LAND_H - 30, y)
    * smoothstep(LAND_X0, LAND_X0 + 30, x) * smoothstep(LAND_X0 + LAND_W, LAND_X0 + LAND_W - 30, x);
}

// Ridges and gullies from the diamond-square field, craggier toward the top. Zero outside the footprint.
export function mountainHeight(x, y, seed = fnv(LAND_SEED)) {
  const dx = x - MOUNTAIN.x;
  const dy = y - MOUNTAIN.y;
  const d = Math.sqrt(dx * dx + dy * dy);
  const wobble = 0.86 + 0.28 * noise(x * 0.012 + 3.1, y * 0.012 + 7.7, seed ^ 0x51);
  const u = d / (MOUNTAIN.radius * wobble);
  if (u >= 1) return 0;
  const s = 1 - u;
  const shape = s * s * (3 - 2 * s);
  const ds = fractalAt(x, y, seed);
  const ridge = 1 - Math.abs(fractalAt(x, y, seed, 0.5));
  const rough = (ridge - 0.62) * 0.36 + ds * 0.1;
  return Math.max(0, MOUNTAIN.height * shape * (1 + rough * Math.min(1, s * 2.2)));
}

function lakeRadius(x, y, seed) {
  return LAKE.radius * (0.88 + 0.26 * noise(x * 0.09 + 11, y * 0.09 - 4, seed ^ 0x77));
}

// Terrain before the water cuts it: dunes + mountain, with the lake basin pressed in.
function shapedGround(dune, x, y, seed) {
  let g = dune(x, y) + mountainHeight(x, y, seed) + 0.7 * fractalAt(x, y, seed, 0.35) * northFade(x, y);
  const r = Math.hypot(x - LAKE.x, y - LAKE.y);
  const rl = lakeRadius(x, y, seed);
  if (r < rl) {
    const q = r / rl;
    g = LAKE.level - 0.12 - LAKE.depth * (1 - q * q);
  } else if (r < rl + 14) {
    const t = smoothstep(rl, rl + 14, r);
    const bank = LAKE.level + 0.12 + 0.07 * (r - rl);
    g = bank + (g - bank) * t;
  }
  return g;
}

function walkPath(start, stop, step, seed, pick) {
  const pts = [start.slice()];
  let p = start.slice();
  let heading = null;
  for (let n = 0; n < 900; n += 1) {
    const dir = pick(p, n);
    let hx = dir[0];
    let hy = dir[1];
    if (heading) {
      hx = heading[0] * 0.55 + hx * 0.45;
      hy = heading[1] * 0.55 + hy * 0.45;
    }
    const len = Math.hypot(hx, hy) || 1;
    heading = [hx / len, hy / len];
    p = [p[0] + heading[0] * step, p[1] + heading[1] * step];
    pts.push(p);
    if (stop(p)) break;
  }
  return pts;
}

function smoothPath(pts, passes = 3) {
  let out = pts.map((p) => p.slice());
  for (let k = 0; k < passes; k += 1) {
    const next = [out[0]];
    for (let i = 1; i < out.length - 1; i += 1) {
      next.push([(out[i - 1][0] + out[i][0] * 2 + out[i + 1][0]) / 4, (out[i - 1][1] + out[i][1] * 2 + out[i + 1][1]) / 4]);
    }
    next.push(out[out.length - 1]);
    out = next;
  }
  return out;
}

function arcLengths(pts) {
  const s = [0];
  for (let i = 1; i < pts.length; i += 1) s.push(s[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  return s;
}

// The stream: from the spring, steepest descent with a pull toward the lake and a seeded meander.
// The river: from the lake's outlet toward the sea, with the same meander.
function planWater(dune, seed) {
  const ground = (x, y) => shapedGround(dune, x, y, seed);
  const toLake = [LAKE.x - MOUNTAIN.x, LAKE.y - MOUNTAIN.y];
  const tl = Math.hypot(toLake[0], toLake[1]);
  const phase = hash01(1, 2, seed) * 6.283;
  // The stream winds most of the way around the mountain: a spiral out from the spring, about 270°
  // around the peak, with meander bends, ending on the foot facing the lake. Then it runs to the lake.
  const lakeBearing = Math.atan2(toLake[1], toLake[0]);
  const sweep = Math.PI * (1.45 + 0.1 * hash01(5, 6, seed));
  const turn = hash01(7, 8, seed) < 0.5 ? 1 : -1;
  const start = lakeBearing - turn * sweep;
  const r0 = MOUNTAIN.radius * 0.24;
  const r1 = MOUNTAIN.radius * 0.92;
  const spring = [MOUNTAIN.x + Math.cos(start) * r0, MOUNTAIN.y + Math.sin(start) * r0];
  const spiral = [spring.slice()];
  let at = spring.slice();
  for (let k = 0; k < 4000; k += 1) {
    const t = Math.min(1, k / 3999);
    const ang = start + turn * sweep * t;
    const bends = Math.sin(t * Math.PI * 2 * 7 + phase) * (2 + 5 * t) + (noise(t * 9 + phase, 2.5, seed ^ 0x21) - 0.5) * 4 * t;
    const r = r0 + (r1 - r0) * Math.pow(t, 0.85) + bends * Math.min(1, t * 6);
    const p = [MOUNTAIN.x + Math.cos(ang) * r, MOUNTAIN.y + Math.sin(ang) * r];
    if (Math.hypot(p[0] - at[0], p[1] - at[1]) >= 1.5 || t === 1) {
      spiral.push(p);
      at = p;
    }
  }
  const foot = walkPath(at, (p) => Math.hypot(p[0] - LAKE.x, p[1] - LAKE.y) < LAKE.radius * 0.6, 1.5, seed, (p, n) => {
    const lx = LAKE.x - p[0];
    const ly = LAKE.y - p[1];
    const ll = Math.hypot(lx, ly) || 1;
    const wander = 0.6 * Math.sin(n * 0.25 + phase);
    return [lx / ll - (ly / ll) * wander, ly / ll + (lx / ll) * wander];
  });
  const up = [...spiral, ...foot.slice(1)];
  const outAngle = -0.12 + (hash01(3, 4, seed) - 0.5) * 0.16;
  const sea = [Math.cos(outAngle) * (ISLAND_R + 10), Math.sin(outAngle) * (ISLAND_R + 10) + LAKE.y * 0.9];
  const ox = sea[0] - LAKE.x;
  const oy = sea[1] - LAKE.y;
  const ol = Math.hypot(ox, oy);
  const outlet = [LAKE.x + (ox / ol) * LAKE.radius * 0.6, LAKE.y + (oy / ol) * LAKE.radius * 0.6];
  const down = walkPath(outlet, (p) => Math.hypot(p[0], p[1]) > ISLAND_R + 6, 1.5, seed, (p, n) => {
    const sx = sea[0] - p[0];
    const sy = sea[1] - p[1];
    const sl = Math.hypot(sx, sy) || 1;
    // Meander bends: the heading swings across the line to the sea, wider near the lake, calmer by the coast.
    const calm = 1 - smoothstep(ISLAND_R - 60, ISLAND_R, Math.hypot(p[0], p[1]));
    const wander = (1.05 * Math.sin(n * 0.085 + phase * 2) + 0.6 * (noise(n * 0.05 + phase, 1.5, seed ^ 0x43) - 0.5)) * (0.3 + 0.7 * calm);
    const c = Math.cos(wander);
    const sn = Math.sin(wander);
    return [(sx / sl) * c - (sy / sl) * sn, (sx / sl) * sn + (sy / sl) * c];
  });
  const upPts = smoothPath(up);
  const downPts = smoothPath(down);
  const upS = arcLengths(upPts);
  const downS = arcLengths(downPts);
  const upLen = upS[upS.length - 1];
  const downLen = downS[downS.length - 1];
  // Stream surface: strictly falling. It follows the ground where the ground falls, cuts through where
  // it rises, and never drops below a floor that itself falls to the lake's level at the end.
  const upSurf = [];
  let last = Infinity;
  for (let i = 0; i < upPts.length; i += 1) {
    const f = upS[i] / upLen;
    const g = ground(upPts[i][0], upPts[i][1]) - 0.1;
    const floor = LAKE.level + 0.4 * (1 - f);
    last = Math.max(floor, Math.min(last - 0.004 * (i ? upS[i] - upS[i - 1] : 0), g));
    upSurf.push(last);
  }
  // River surface: strictly falling from just under lake level to just over the sea.
  const downSurf = [];
  last = LAKE.level - 0.02;
  for (let i = 0; i < downPts.length; i += 1) {
    const f = downS[i] / downLen;
    const plan = (LAKE.level - 0.02) * (1 - f) + 0.04 * f;
    const floor = 0.05 * (1 - f) + 0.02 * f;
    const ds = i ? downS[i] - downS[i - 1] : 0;
    last = i === 0 ? last : Math.max(floor, Math.min(last - 0.0002 * ds, plan, ground(downPts[i][0], downPts[i][1]) - 0.08));
    downSurf.push(last);
  }
  const reach = (pts, s, len, surf, kind) => pts.map((p, i) => {
    const f = s[i] / len;
    const width = kind === "stream" ? 0.5 + 1.6 * f * f + 0.3 * f : 2.4 + 1.8 * f;
    const depth = kind === "stream" ? 0.12 + 0.45 * f : 0.7 + 0.35 * f;
    return { x: p[0], y: p[1], s: s[i], f, surface: surf[i], half: width, depth, kind };
  });
  return {
    spring: { x: spring[0], y: spring[1], z: upSurf[0] },
    stream: reach(upPts, upS, upLen, upSurf, "stream"),
    river: reach(downPts, downS, downLen, downSurf, "river"),
  };
}

const cache = new Map();

// Bake the grid: R ground offset over the dunes, G water surface (or under the ground where dry),
// B pine density, A bank wetness (reeds, lush grass, mud).
export function bakeLand(dune, seed = LAND_SEED, { fresh = false } = {}) {
  const hit = cache.get(seed);
  if (!fresh && hit && hit.dune === dune) return hit;
  const s = fnv(seed);
  const plan = planWater(dune, s);
  const n = LAND_NX * LAND_NY;
  const delta = new Float32Array(n);
  const water = new Float32Array(n);
  const pine = new Float32Array(n);
  const bank = new Float32Array(n);
  const base = new Float32Array(n);
  const near = new Float32Array(n).fill(1e9);
  const nearAt = new Int32Array(n).fill(-1);
  const verts = [...plan.stream, ...plan.river];
  const center = (i, j) => [LAND_X0 + (i + 0.5) * LAND_CELL, LAND_Y0 + (j + 0.5) * LAND_CELL];
  for (let j = 0; j < LAND_NY; j += 1) {
    for (let i = 0; i < LAND_NX; i += 1) {
      const [x, y] = center(i, j);
      const k = j * LAND_NX + i;
      base[k] = dune(x, y);
      delta[k] = shapedGround(dune, x, y, s);
    }
  }
  // Rasterize each reach segment into its band: nearest centerline point per cell.
  const segs = [];
  for (const list of [plan.stream, plan.river]) {
    for (let v = 0; v + 1 < list.length; v += 1) segs.push([list[v], list[v + 1], verts.indexOf(list[v])]);
  }
  for (const [a, b, ai] of segs) {
    const pad = Math.max(a.half, b.half) + 18;
    const i0 = Math.max(0, Math.floor((Math.min(a.x, b.x) - pad - LAND_X0) / LAND_CELL));
    const i1 = Math.min(LAND_NX - 1, Math.ceil((Math.max(a.x, b.x) + pad - LAND_X0) / LAND_CELL));
    const j0 = Math.max(0, Math.floor((Math.min(a.y, b.y) - pad - LAND_Y0) / LAND_CELL));
    const j1 = Math.min(LAND_NY - 1, Math.ceil((Math.max(a.y, b.y) + pad - LAND_Y0) / LAND_CELL));
    const ex = b.x - a.x;
    const ey = b.y - a.y;
    const e2 = ex * ex + ey * ey || 1;
    for (let j = j0; j <= j1; j += 1) {
      for (let i = i0; i <= i1; i += 1) {
        const [x, y] = center(i, j);
        const t = Math.max(0, Math.min(1, ((x - a.x) * ex + (y - a.y) * ey) / e2));
        const d = Math.hypot(x - (a.x + ex * t), y - (a.y + ey * t));
        const k = j * LAND_NX + i;
        if (d < near[k]) {
          near[k] = d;
          nearAt[k] = ai + t;
        }
      }
    }
  }
  const along = (pos) => {
    const v = Math.floor(pos);
    const t = pos - v;
    const a = verts[v];
    const b = verts[Math.min(verts.length - 1, v + 1)];
    const same = a.kind === b.kind;
    const mix = (key) => (same ? a[key] + (b[key] - a[key]) * t : a[key]);
    return { surface: mix("surface"), half: mix("half"), depth: mix("depth"), kind: a.kind, f: mix("f") };
  };
  for (let j = 0; j < LAND_NY; j += 1) {
    for (let i = 0; i < LAND_NX; i += 1) {
      const k = j * LAND_NX + i;
      const [x, y] = center(i, j);
      let g = delta[k];
      let w = -1e3;
      let wet = 0;
      const r = Math.hypot(x - LAKE.x, y - LAKE.y);
      const rl = lakeRadius(x, y, s);
      if (r < rl) {
        w = LAKE.level;
        wet = 1;
      } else {
        wet = Math.max(wet, 1 - smoothstep(rl, rl + 7, r));
      }
      if (nearAt[k] >= 0 && r >= rl - 0.5) {
        const d = near[k];
        const at = along(nearAt[k]);
        // A deeper cut gets a wider band, so the walls of a gully slope instead of standing straight.
        const bandW = Math.min(16, Math.max(4, at.half * 1.5 + 3, (g - at.surface) * 1.4));
        if (d < at.half) {
          const q = d / at.half;
          g = at.surface - at.depth * (1 - q * q) - 0.02;
          w = Math.max(w, at.surface);
          wet = 1;
        } else if (d < at.half + bandW) {
          const t = smoothstep(at.half, at.half + bandW, d);
          const bankZ = at.surface + 0.1 + 0.3 * (d - at.half);
          g = bankZ + (g - bankZ) * t;
        }
        wet = Math.max(wet, 1 - smoothstep(at.half, at.half + 3.5, d));
      }
      const ds = Math.hypot(x - plan.spring.x, y - plan.spring.y);
      if (ds < 1.8) {
        const q = ds / 1.8;
        g = Math.min(g, plan.spring.z - 0.35 * (1 - q * q) - 0.02);
        w = Math.max(w, plan.spring.z);
        wet = 1;
      }
      if (w < g) w = g - 0.3;
      const m = mountainHeight(x, y, s);
      const patch = smoothstep(0.2, 0.5, noise(x * 0.035 + 5, y * 0.035 - 2, s ^ 0x5a));
      const slopeBand = smoothstep(3.5, 9, m) * (1 - smoothstep(MOUNTAIN.height * 0.6, MOUNTAIN.height * 0.76, g));
      const shore = r > rl + 4 && r < rl + 34 ? 0.55 * (1 - smoothstep(rl + 16, rl + 34, r)) : 0;
      let dens = Math.max(slopeBand, shore) * patch;
      if (wet > 0.05 || w > g) dens = 0;
      if (nearAt[k] >= 0) dens *= smoothstep(along(nearAt[k]).half + 1.5, along(nearAt[k]).half + 4.5, near[k]);
      if (Math.hypot(x, y) > ISLAND_R - 6) dens = 0;
      pine[k] = dens;
      bank[k] = wet;
      water[k] = w;
      delta[k] = g - base[k];
    }
  }
  const fogBanks = [
    { x: LAKE.x, y: LAKE.y, radius: 30, z: LAKE.level },
    ...[0.45, 0.72, 0.9].map((f) => {
      const v = plan.stream[Math.floor(f * (plan.stream.length - 1))];
      return { x: v.x, y: v.y, radius: 16, z: v.surface - 0.5 };
    }),
    ...[0.25, 0.55].map((f) => {
      const v = plan.river[Math.floor(f * (plan.river.length - 1))];
      return { x: v.x, y: v.y, radius: 20, z: v.surface - 0.3 };
    }),
  ];
  const field = { dune, seed, seedHash: s, delta, water, pine, bank, plan, fogBanks };
  if (!fresh) cache.set(seed, field);
  return field;
}

export function inLand(x, y) {
  return x >= LAND_X0 && y >= LAND_Y0 && x < LAND_X0 + LAND_W && y < LAND_Y0 + LAND_H;
}

function bilinear(grid, x, y) {
  const fx = (x - LAND_X0) / LAND_CELL - 0.5;
  const fy = (y - LAND_Y0) / LAND_CELL - 0.5;
  const i = Math.max(0, Math.min(LAND_NX - 2, Math.floor(fx)));
  const j = Math.max(0, Math.min(LAND_NY - 2, Math.floor(fy)));
  const u = Math.max(0, Math.min(1, fx - i));
  const v = Math.max(0, Math.min(1, fy - j));
  const k = j * LAND_NX + i;
  const a = grid[k];
  const b = grid[k + 1];
  const c = grid[k + LAND_NX];
  const d = grid[k + LAND_NX + 1];
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

export function landDelta(field, x, y) {
  return inLand(x, y) ? bilinear(field.delta, x, y) : 0;
}

export function landWater(field, x, y) {
  return inLand(x, y) ? bilinear(field.water, x, y) : -1e3;
}

export function landPineDensity(field, x, y) {
  return inLand(x, y) ? bilinear(field.pine, x, y) : 0;
}

export function landBank(field, x, y) {
  return inLand(x, y) ? bilinear(field.bank, x, y) : 0;
}

// One pine per PINE_CELL cell at most, the same rule the shader uses (hashU, the B channel).
export function pineInCell(field, ci, cj) {
  const h = hashU(ci, cj, field.seedHash ^ 0x9172);
  const roll = (h >>> 8) / 16777216;
  const cx = (ci + 0.5) * PINE_CELL;
  const cy = (cj + 0.5) * PINE_CELL;
  const dens = landPineDensity(field, cx, cy);
  if (!(roll < dens * 0.9)) return null;
  const jx = ((h & 255) / 255 - 0.5) * 1.2;
  const jy = (((h >>> 24) & 255) / 255 - 0.5) * 1.2;
  const size = ((h >>> 16) & 255) / 255;
  return { x: cx + jx, y: cy + jy, radius: 1.25 + 0.4 * size, height: 4.2 + 3.6 * size };
}

export function allPines(field) {
  const out = [];
  const i0 = Math.floor(LAND_X0 / PINE_CELL);
  const i1 = Math.floor((LAND_X0 + LAND_W) / PINE_CELL);
  const j0 = Math.floor(LAND_Y0 / PINE_CELL);
  const j1 = Math.floor((LAND_Y0 + LAND_H) / PINE_CELL);
  for (let cj = j0; cj <= j1; cj += 1) {
    for (let ci = i0; ci <= i1; ci += 1) {
      const p = pineInCell(field, ci, cj);
      if (p) out.push(p);
    }
  }
  return out;
}

// Reeds and bushes on the banks: a fixed list from the plan, so every peer draws the same ones.
export function bankPlants(field) {
  if (field.plants) return field.plants;
  const s = field.seedHash ^ 0x4411;
  const plants = [];
  const place = (x, y, n) => {
    if (!inLand(x, y)) return;
    if (landWater(field, x, y) > field.dune(x, y) + landDelta(field, x, y)) return;
    const roll = hash01(n, 7, s);
    plants.push({ x, y, kind: roll < 0.68 ? "reed" : "bush", size: 0.8 + 0.4 * hash01(n, 9, s) });
  };
  let n = 0;
  for (const list of [field.plan.stream, field.plan.river]) {
    for (let v = 2; v < list.length - 1; v += 3) {
      const a = list[v];
      const b = list[v + 1];
      const tx = b.x - a.x;
      const ty = b.y - a.y;
      const tl = Math.hypot(tx, ty) || 1;
      const side = hash01(v, n, s) < 0.5 ? -1 : 1;
      const off = a.half + 0.5 + hash01(v, 3, s) * 1.2;
      place(a.x - (ty / tl) * off * side, a.y + (tx / tl) * off * side, n++);
      if (a.kind === "river" || a.f > 0.5) place(a.x + (ty / tl) * off * side, a.y - (tx / tl) * off * side, n++);
    }
  }
  for (let k = 0; k < 40; k += 1) {
    const ang = (k / 40) * Math.PI * 2 + hash01(k, 1, s) * 0.1;
    const edge = lakeRadius(LAKE.x + Math.cos(ang) * LAKE.radius, LAKE.y + Math.sin(ang) * LAKE.radius, field.seedHash);
    const rl = edge + 0.7 + hash01(k, 2, s) * 1.6;
    place(LAKE.x + Math.cos(ang) * rl, LAKE.y + Math.sin(ang) * rl, n++);
  }
  field.plants = plants;
  return plants;
}

// A small digest of the baked grid, for the determinism test: identical bakes give identical digests.
export function landDigest(field) {
  let h = 2166136261;
  const mix = (arr) => {
    const bytes = new Uint8Array(arr.buffer, arr.byteOffset, arr.byteLength);
    for (let i = 0; i < bytes.length; i += 7) h = Math.imul(h ^ bytes[i], 16777619) >>> 0;
  };
  mix(field.delta);
  mix(field.water);
  mix(field.pine);
  return h.toString(16);
}

// Pack for the picture: RGBA float, row-major from LAND_Y0 upward.
export function landTexels(field) {
  const out = new Float32Array(LAND_NX * LAND_NY * 4);
  for (let k = 0; k < LAND_NX * LAND_NY; k += 1) {
    out[k * 4] = field.delta[k];
    out[k * 4 + 1] = field.water[k];
    out[k * 4 + 2] = field.pine[k];
    out[k * 4 + 3] = field.bank[k];
  }
  return out;
}

// ?fog=0 off, 1 the default bank, 2 a thicker, finer bank. Bots default to off.
export function fogLevel(raw, bot = false) {
  if (raw == null || raw === "") return bot ? 0 : 1;
  const v = Number(raw);
  if (!Number.isFinite(v)) return bot ? 0 : 1;
  return Math.max(0, Math.min(2, Math.round(v)));
}

// Where to stand to see it: ?look=mountain (across the lake from the mountain) or ?look=spring
// (beside the spring, looking down the stream to the lake).
export function landView(field, which) {
  const spring = field.plan.spring;
  if (which === "spring") {
    // Stand in the stream a way down and look back up the channel toward the spring.
    const stream = field.plan.stream;
    const at = stream[Math.min(stream.length - 1, 30)];
    const up = stream[Math.min(stream.length - 1, 18)];
    return { x: at.x, y: at.y, yaw: Math.atan2(up.x - at.x, up.y - at.y), pitch: 0.04 };
  }
  const mx = MOUNTAIN.x - LAKE.x;
  const my = MOUNTAIN.y - LAKE.y;
  const ml = Math.hypot(mx, my);
  const back = LAKE.radius + 5;
  const x = LAKE.x - (mx / ml) * back;
  const y = LAKE.y - (my / ml) * back;
  return { x, y, yaw: Math.atan2(MOUNTAIN.x - x, MOUNTAIN.y - y), pitch: 0.06 };
}
