// Measures what the crust voxel size costs: a fixed dig session (a 3 m x 3 m pit, 1 m deep, dug by
// brush strokes on a 0.25 m aim grid) through brushWrites, then counts and times the results.
// Usage: node --expose-gc tools/measure-cells.mjs [path/to/crust.js]
import { pathToFileURL } from "node:url";
import { encode } from "../src/sim/cbor.js";

const target = process.argv[2] ? pathToFileURL(process.argv[2]).href : "../src/sim/crust.js";
const { Crust, brushWrites, columnFloor, VOXEL_CM, CHUNK_VOXELS } = await import(target);

const heap = () => { globalThis.gc?.(); return process.memoryUsage().heapUsed; };
const crust = new Crust();
const before = heap();
let writes = [];
let ops = 0;
let opBytes = 0;
const t0 = performance.now();
for (let depth = -25; depth >= -100; depth -= 25) {
  for (let x = -150; x <= 150; x += 25) {
    for (let y = -150; y <= 150; y += 25) {
      const w = brushWrites(crust, { eye: [x, y - 200, 150], aim: [x, y, depth], mode: "dig", ticks: 30, skill: 50 });
      if (!w.length) continue;
      ops += 1;
      opBytes += encode({ writes: w.map((v) => [v.i, v.j, v.k, v.sdf_mm]) }).length;
      writes = writes.concat(w);
    }
  }
}
const digMs = performance.now() - t0;
const after = heap();
const chunks = new Set([...crust.overrides.keys()].map((key) => key.split(",").map((n) => Math.floor(Number(n) / CHUNK_VOXELS)).join(",")));
const t1 = performance.now();
for (const chunk of chunks) crust.hash(...chunk.split(",").map(Number));
const hashMs = performance.now() - t1;
const t2 = performance.now();
const CALLS = 2000;
for (let n = 0; n < CALLS; n += 1) columnFloor(crust, (n % 30) / 10 - 1.5, ((n / 30) | 0) % 30 / 10 - 1.5);
const floorUs = ((performance.now() - t2) / CALLS) * 1000;
const columns = new Set([...crust.overrides].filter(([, s]) => s > 0).map(([key]) => key.split(",").slice(0, 2).join(",")));
const save = JSON.stringify([...crust.overrides.entries()]);
console.log(JSON.stringify({
  voxelCm: VOXEL_CM,
  overrides: crust.overrides.size,
  writes: writes.length,
  ops,
  opBytes,
  saveBytes: save.length,
  heapBytes: Math.max(0, after - before),
  gpuColumns: columns.size,
  chunks: chunks.size,
  digMs: +digMs.toFixed(1),
  hashAllMs: +hashMs.toFixed(2),
  columnFloorUs: +floorUs.toFixed(2),
}));
