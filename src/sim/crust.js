import { blake3 } from "@noble/hashes/blake3.js";

// Voxel edge. Halved from 50 cm in save format 2 (see migrateWorld in persist.js).
export const VOXEL_CM = 25;
export const VOXEL_M = VOXEL_CM / 100;
export const CHUNK_VOXELS = 64;
export const CHUNK_CM = VOXEL_CM * CHUNK_VOXELS;
export const LAND_RADIUS_CM = 25600;
export const VOXEL_CM3 = VOXEL_CM ** 3;
// Signed distance written for a dug (air) or filled voxel: one voxel edge, in mm.
export const DIG_SAMPLE_MM = VOXEL_CM * 10;
export const AIR_SAMPLE_MM = VOXEL_CM * 10;

export function isqrt(n) {
  if (n <= 0) return 0;
  let x = Math.floor(n);
  let y = Math.floor((x + 1) / 2);
  while (y < x) {
    x = y;
    y = Math.floor((x + Math.floor(n / x)) / 2);
  }
  return x;
}

export function seedSampleMm(cx, cy, cz) {
  const h2 = cx * cx + cy * cy;
  const plane = cz * 10;
  if (h2 > LAND_RADIUS_CM * LAND_RADIUS_CM) {
    const coast = (isqrt(h2) - LAND_RADIUS_CM) * 10;
    return Math.min(2000, Math.max(coast, 1));
  }
  if (plane > 0) return Math.min(2000, plane);
  return Math.max(-2000, plane);
}

function voxelIndex(cm) {
  return Math.floor(cm / VOXEL_CM);
}

function centerCm(index) {
  return index * VOXEL_CM + VOXEL_CM / 2;
}

export class Crust {
  constructor(worldSeed = "atoll-slice-1", cellId = "atoll-0") {
    this.worldSeed = worldSeed;
    this.cellId = cellId;
    this.overrides = new Map();
    this.budgetCm3 = 0;
  }

  key(i, j, k) {
    return `${i},${j},${k}`;
  }

  sampleIndex(i, j, k) {
    const hit = this.overrides.get(this.key(i, j, k));
    if (hit !== undefined) return hit;
    return seedSampleMm(centerCm(i), centerCm(j), centerCm(k));
  }

  sampleMeters(point) {
    const i = voxelIndex(point[0] * 100);
    const j = voxelIndex(point[1] * 100);
    const k = voxelIndex(point[2] * 100);
    return this.sampleIndex(i, j, k) / 1000;
  }

  write(i, j, k, sample) {
    const seeded = seedSampleMm(centerCm(i), centerCm(j), centerCm(k));
    const key = this.key(i, j, k);
    if (sample === seeded) this.overrides.delete(key);
    else this.overrides.set(key, sample);
  }

  hash(chunkX, chunkY, chunkZ) {
    const writes = [];
    for (const [key, sample] of this.overrides) {
      const [i, j, k] = key.split(",").map(Number);
      const cx = Math.floor(i / CHUNK_VOXELS);
      const cy = Math.floor(j / CHUNK_VOXELS);
      const cz = Math.floor(k / CHUNK_VOXELS);
      if (cx !== chunkX || cy !== chunkY || cz !== chunkZ) continue;
      writes.push({
        i: i - cx * CHUNK_VOXELS,
        j: j - cy * CHUNK_VOXELS,
        k: k - cz * CHUNK_VOXELS,
        sample,
      });
    }
    writes.sort((a, b) => a.k - b.k || a.j - b.j || a.i - b.i);
    const seed = new TextEncoder().encode(this.worldSeed);
    const cell = new TextEncoder().encode(this.cellId);
    const body = new Uint8Array(16 + writes.length * 8);
    const view = new DataView(body.buffer);
    view.setInt32(0, chunkX, true);
    view.setInt32(4, chunkY, true);
    view.setInt32(8, chunkZ, true);
    view.setInt32(12, writes.length, true);
    writes.forEach((write, index) => {
      const at = 16 + index * 8;
      view.setInt16(at, write.i, true);
      view.setInt16(at + 2, write.j, true);
      view.setInt16(at + 4, write.k, true);
      view.setInt16(at + 6, write.sample, true);
    });
    const bytes = new Uint8Array(seed.length + 1 + cell.length + 1 + body.length);
    bytes.set(seed, 0);
    bytes[seed.length] = 0;
    bytes.set(cell, seed.length + 1);
    bytes[seed.length + 1 + cell.length] = 0;
    bytes.set(body, seed.length + 1 + cell.length + 1);
    return blake3(bytes);
  }
}

function dist2(a, b) {
  const dx = a[0] - b[0];
  const dy = a[1] - b[1];
  const dz = a[2] - b[2];
  return dx * dx + dy * dy + dz * dz;
}

// Parsed "i,j,k" keys. columnFloor runs many times a frame, and at 25 cm voxels a dug pit holds 8x the
// overrides, so re-splitting every key per call cost ~0.85 ms. Keys are immutable strings: caching is safe.
const parsedKeys = new Map();
function parseKey(key) {
  let parsed = parsedKeys.get(key);
  if (!parsed) {
    parsed = key.split(",").map(Number);
    if (parsedKeys.size > 200_000) parsedKeys.clear();
    parsedKeys.set(key, parsed);
  }
  return parsed;
}

export function columnFloor(crust, x, y) {
  const i = Math.floor(x / VOXEL_M);
  const j = Math.floor(y / VOXEL_M);
  let floor = 0;
  for (const [key, sample] of crust.overrides) {
    if (sample <= 0) continue;
    const [di, dj, dk] = parseKey(key);
    if (di !== i || dj !== j) continue;
    const bottom = dk * VOXEL_M;
    if (bottom < floor) floor = bottom;
  }
  return floor;
}

function sampleStep(sample) {
  if (sample > 0) return Math.max(0, sample - DIG_SAMPLE_MM);
  if (sample < 0) return Math.min(0, sample + DIG_SAMPLE_MM);
  return sample;
}

export function offBeachSlump(beach, here, neighbor) {
  if (beach) return null;
  return slumpChoice(here, neighbor);
}

export function bitMode(beach, brush) {
  if (beach || brush !== "smooth") return brush;
  return "slump";
}

export function applySlump(crust, aim) {
  if (!crust || !aim) return null;
  const i = voxelIndex(aim[0]);
  const j = voxelIndex(aim[1]);
  const k = voxelIndex(aim[2]);
  const here = crust.sampleIndex(i, j, k);
  const neighbor = crust.sampleIndex(i, j + 1, k);
  const next = offBeachSlump(false, here, neighbor);
  if (next == null) return null;
  crust.write(i, j, k, next);
  return next;
}

// Off the beach a slump write can be certified. On the beach it cannot.
export function certifySlump(beach) {
  return { mode: "slump", certified: !beach, beach: Boolean(beach) };
}

// Off the beach a certified slump is one the peers can apply. On the beach it is not.
export function peerAcceptsSlump({ beach = true, certified = false } = {}) {
  return certified === true && beach === false;
}

export function acceptCertifiedSlump(crust, aim, slip) {
  if (!slip?.certified || slip.beach) return null;
  return applySlump(crust, aim);
}

export function slumpChoice(here, neighbor) {
  if (here - neighbor < DIG_SAMPLE_MM) return null;
  return here - DIG_SAMPLE_MM / 2;
}

export function brushWrites(crust, { eye, aim, mode = "dig", ticks = 1, skill = 0 }) {
  const grant = 6667 + Math.floor((6667 * skill) / 140);
  crust.budgetCm3 += grant * ticks;
  const writes = [];
  const reach2 = 400 * 400;
  const brush2 = 100 * 100;
  while (crust.budgetCm3 >= VOXEL_CM3) {
    let best = null;
    let bestD = Infinity;
    const minI = voxelIndex(aim[0] - 100);
    const maxI = voxelIndex(aim[0] + 100);
    const minJ = voxelIndex(aim[1] - 100);
    const maxJ = voxelIndex(aim[1] + 100);
    const minK = voxelIndex(aim[2] - 100);
    const maxK = voxelIndex(aim[2] + 100);
    for (let i = minI; i <= maxI; i++) {
      for (let j = minJ; j <= maxJ; j++) {
        for (let k = minK; k <= maxK; k++) {
          const center = [centerCm(i), centerCm(j), centerCm(k)];
          if (dist2(center, aim) > brush2 || dist2(center, eye) > reach2) continue;
          const sample = crust.sampleIndex(i, j, k);
          if (mode === "dig" && sample > 0) continue;
          if (mode === "fill" && sample <= 0) continue;
          if (mode === "smooth" && (sample === 0 || Math.min(DIG_SAMPLE_MM, Math.abs(sample)) === 0)) continue;
          const d = dist2(center, aim);
          if (d < bestD || (d === bestD && best && (i < best.i || (i === best.i && (j < best.j || (j === best.j && k < best.k)))))) {
            bestD = d;
            best = { i, j, k, sample };
          }
        }
      }
    }
    if (!best) break;
    const next = mode === "dig"
      ? DIG_SAMPLE_MM
      : mode === "fill"
        ? -DIG_SAMPLE_MM
        : sampleStep(best.sample);
    if (next === best.sample) break;
    crust.budgetCm3 -= VOXEL_CM3;
    crust.write(best.i, best.j, best.k, next);
    writes.push({ i: best.i, j: best.j, k: best.k, sdf_mm: next });
  }
  return writes;
}
