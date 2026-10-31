// Trampled paths: a per-cell wear map fed by footsteps from every player and the AI.
// Wear is quantized to 0..255 per ground cell (the crust voxel footprint), decays slowly, and
// shades the ground grass -> worn dirt -> packed path. Peers merge by max, so batches can repeat.
import { VOXEL_CM } from "./crust.js";

export const WEAR_CELL_M = VOXEL_CM / 100;
export const WEAR_MAX = 255;
export const WEAR_STEP = 6; // one footstep
export const WORN_AT = 60; // grass -> worn dirt
export const PATH_AT = 170; // worn dirt -> packed path
// Decay: lose 1 level every DECAY_TICKS ticks (30 ticks/s): an unused packed path (255) fades
// back to grass in about 255 * 240 / 30 / 60 = 34 minutes.
export const DECAY_TICKS = 240;
export const WEAR_KIND = 16;
export const WEAR_BATCH = 64; // cells per op

export function createWear() {
  return { cells: new Map(), dirty: new Set() };
}

export function wearKey(i, j) {
  return `${i},${j}`;
}

export function wearCell(x, y) {
  return [Math.floor(x / WEAR_CELL_M), Math.floor(y / WEAR_CELL_M)];
}

export function wearAt(wear, x, y) {
  const [i, j] = wearCell(x, y);
  return wear.cells.get(wearKey(i, j)) || 0;
}

// A footstep at (x, y) wears its own cell fully and the four neighbours a little.
export function stepWear(wear, x, y, amount = WEAR_STEP) {
  const [i, j] = wearCell(x, y);
  bump(wear, i, j, amount);
  const side = Math.max(1, Math.round(amount / 3));
  bump(wear, i + 1, j, side);
  bump(wear, i - 1, j, side);
  bump(wear, i, j + 1, side);
  bump(wear, i, j - 1, side);
}

function bump(wear, i, j, amount) {
  const key = wearKey(i, j);
  const next = Math.min(WEAR_MAX, (wear.cells.get(key) || 0) + amount);
  wear.cells.set(key, next);
  wear.dirty.add(key);
}

export function decayWear(wear, levels = 1) {
  for (const [key, value] of wear.cells) {
    const next = value - levels;
    if (next <= 0) wear.cells.delete(key);
    else wear.cells.set(key, next);
  }
}

// 0 grass, 1 worn dirt, 2 packed path, blended continuously between.
export function wearStage(value) {
  if (value <= WORN_AT) return value / WORN_AT;
  return 1 + Math.min(1, (value - WORN_AT) / (PATH_AT - WORN_AT));
}

// Batches of dirty cells as [i, j, level] triples, at most WEAR_BATCH per batch.
export function takeWearBatches(wear) {
  const out = [];
  let batch = [];
  for (const key of wear.dirty) {
    const value = wear.cells.get(key) || 0;
    const [i, j] = key.split(",").map(Number);
    batch.push(i, j, value);
    if (batch.length >= WEAR_BATCH * 3) {
      out.push(batch);
      batch = [];
    }
  }
  if (batch.length) out.push(batch);
  wear.dirty.clear();
  return out;
}

// Merge a peer's batch: max wins, so repeats and reordering are harmless.
export function mergeWear(wear, triples) {
  let changed = 0;
  for (let n = 0; n + 2 < triples.length; n += 3) {
    const key = wearKey(triples[n], triples[n + 1]);
    const value = Math.max(0, Math.min(WEAR_MAX, triples[n + 2] | 0));
    if (value > (wear.cells.get(key) || 0)) {
      wear.cells.set(key, value);
      changed += 1;
    }
  }
  return changed;
}

export function packWear(wear) {
  const out = [];
  for (const [key, value] of wear.cells) {
    const [i, j] = key.split(",").map(Number);
    out.push(i, j, value);
  }
  return out;
}

export function unpackWear(triples) {
  const wear = createWear();
  mergeWear(wear, Array.isArray(triples) ? triples : []);
  return wear;
}

// The cells with the most wear near (x, y), for the renderer: [x, y, stage] in meters.
export function nearestWear(wear, x, y, limit) {
  const list = [];
  for (const [key, value] of wear.cells) {
    if (value < 8) continue;
    const [i, j] = key.split(",").map(Number);
    const cx = (i + 0.5) * WEAR_CELL_M;
    const cy = (j + 0.5) * WEAR_CELL_M;
    list.push({ x: cx, y: cy, stage: wearStage(value), d: (cx - x) ** 2 + (cy - y) ** 2 });
  }
  list.sort((a, b) => a.d - b.d);
  return list.slice(0, limit);
}

// A square window of wear stages around (x, y) for the renderer: grid[j * size + i] is
// round(stage / 2 * 255), origin is the world corner of cell (0, 0). Snapped to whole cells.
export function wearWindow(wear, x, y, size, grid = new Uint8Array(size * size)) {
  const [ci, cj] = wearCell(x, y);
  const i0 = ci - (size >> 1);
  const j0 = cj - (size >> 1);
  grid.fill(0);
  for (const [key, value] of wear.cells) {
    const [i, j] = key.split(",").map(Number);
    const gi = i - i0;
    const gj = j - j0;
    if (gi < 0 || gj < 0 || gi >= size || gj >= size) continue;
    grid[gj * size + gi] = Math.round((wearStage(value) / 2) * 255);
  }
  return { origin: [i0 * WEAR_CELL_M, j0 * WEAR_CELL_M], cell: WEAR_CELL_M, grid };
}
