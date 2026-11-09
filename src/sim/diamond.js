// Diamond-square (Fournier, Fussell & Carpenter 1982): a fractal heightfield on a (2^n + 1)² grid.
// Corners are seeded, then each pass sets square centers (the diamond step) and edge midpoints
// (the square step) to the mean of their neighbours plus a random offset that halves in reach
// every level (scaled by `roughness`). Edges wrap so the field tiles.
//
// The offsets come from an integer hash of (x, y, seed), not from a running random stream, so
// every cell's value depends only on the seed and its position: the same field on every peer,
// whatever the engine, and no Math.random or Math.sin anywhere.

function hashU(i, j, seed) {
  let h = (Math.imul(i | 0, 0x27d4eb2d) ^ Math.imul(j | 0, 0x165667b1) ^ seed) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35) >>> 0;
  return (h ^ (h >>> 16)) >>> 0;
}

// Uniform in [-1, 1).
function jitter(i, j, seed) {
  return (hashU(i, j, seed) >>> 8) / 8388608 - 1;
}

export function seedOf(text) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) h = Math.imul(h ^ text.charCodeAt(i), 16777619) >>> 0;
  return h >>> 0;
}

// Returns { size, cells } with size = 2^levels + 1 and cells normalized to [-1, 1].
export function diamondSquare(levels, seed, roughness = 0.55) {
  const n = 1 << levels;
  const size = n + 1;
  const cells = new Float64Array(size * size);
  const at = (x, y) => ((y + n) % n) * size + ((x + n) % n);
  const get = (x, y) => cells[at(x, y)];
  const set = (x, y, v) => {
    cells[y * size + x] = v;
    // Mirror the wrapped edge so the last row and column equal the first.
    if (x === 0) cells[y * size + n] = v;
    if (y === 0) cells[n * size + x] = v;
    if (x === 0 && y === 0) cells[n * size + n] = v;
  };
  set(0, 0, jitter(0, 0, seed));
  let reach = 1;
  for (let step = n; step > 1; step >>= 1) {
    const half = step >> 1;
    // Diamond: the center of every square.
    for (let y = half; y < n; y += step) {
      for (let x = half; x < n; x += step) {
        const mean = (get(x - half, y - half) + get(x + half, y - half) + get(x - half, y + half) + get(x + half, y + half)) / 4;
        set(x, y, mean + jitter(x, y, seed) * reach);
      }
    }
    // Square: the midpoint of every edge, from its four diamond neighbours.
    for (let y = 0; y < n; y += half) {
      for (let x = (y / half) % 2 === 0 ? half : 0; x < n; x += step) {
        const mean = (get(x - half, y) + get(x + half, y) + get(x, y - half) + get(x, y + half)) / 4;
        set(x, y, mean + jitter(x, y, seed ^ 0x5bd1e995) * reach);
      }
    }
    reach *= roughness;
  }
  let lo = Infinity;
  let hi = -Infinity;
  for (const v of cells) {
    if (v < lo) lo = v;
    if (v > hi) hi = v;
  }
  const span = hi - lo || 1;
  const out = new Float32Array(size * size);
  for (let k = 0; k < cells.length; k += 1) out[k] = ((cells[k] - lo) / span) * 2 - 1;
  return { size, cells: out };
}

// Bilinear read at grid coordinates (wrapping).
export function sampleField(field, gx, gy) {
  const n = field.size - 1;
  const fx = ((gx % n) + n) % n;
  const fy = ((gy % n) + n) % n;
  const i = Math.floor(fx);
  const j = Math.floor(fy);
  const u = fx - i;
  const v = fy - j;
  const s = field.size;
  const a = field.cells[j * s + i];
  const b = field.cells[j * s + i + 1];
  const c = field.cells[(j + 1) * s + i];
  const d = field.cells[(j + 1) * s + i + 1];
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
