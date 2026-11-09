// What the heightfield cannot hold: the ice castle on the mountain's summit, and two cave systems
// (lava tubes in the volcano, gem caverns in the east). A pure function of the world seed and the
// ground, the same on every peer.
//
// The caves are a 2.5D volume: per 2D cell a floor F and a ceiling C (absolute heights). Air is
// where F < z < C, rock is everything else under the ground. That keeps them to one baked grid the
// picture samples like the land (no 3D texture), and stalactites, stalagmites and columns are just
// dips in C and bumps in F. A cave whose C rises above the ground is open to the sky: an entrance.
// The castle is a handful of analytic shapes (boxes, cylinders, cones), the same signed-distance
// rule in JS and in the shader. Walk, collision and the picture all read `solidAt`.
import { LAND_SEED, MOUNTAIN, hashU } from "./land.js?v=2";
import { VOLCANO } from "./volcano.js?v=1";

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

// ---- The ice castle ----------------------------------------------------------------------------
// A square curtain wall with battlements, four corner towers and a keep with conical spires, a gate
// in the north wall and an ice ramp down to the snow. The courtyard floor is packed snow.
export function castlePlan(ground) {
  // On the summit: the highest ground near the peak, on a 1 m lattice.
  let best = { x: MOUNTAIN.x, y: MOUNTAIN.y, z: -1e9 };
  for (let x = MOUNTAIN.x - 16; x <= MOUNTAIN.x + 16; x += 1) {
    for (let y = MOUNTAIN.y - 16; y <= MOUNTAIN.y + 16; y += 1) {
      const z = ground(x, y);
      if (z > best.z) best = { x, y, z };
    }
  }
  const half = 11;
  const floor = Math.round((best.z - 1.4) * 10) / 10;
  const gateOut = ground(best.x, best.y + half + 12);
  return {
    x: best.x, y: best.y, z: floor, summit: best.z, half, wallT: 1.4, wallH: 7, towerR: 2.4, towerH: 11, spireH: 7,
    keepR: 3.4, keepH: 15, keepSpire: 9, gateW: 3.6, gateH: 4.8, rampL: 12, rampDrop: Math.max(0, floor - gateOut),
  };
}
function sdBox(px, py, pz, bx, by, bz) {
  const qx = Math.abs(px) - bx;
  const qy = Math.abs(py) - by;
  const qz = Math.abs(pz) - bz;
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0), Math.max(qz, 0)) + Math.min(Math.max(qx, qy, qz), 0);
}
function sdCyl(px, py, pz, r, z0, z1) {
  const d = Math.hypot(px, py) - r;
  const hz = (z1 - z0) / 2;
  const e = Math.abs(pz - (z0 + z1) / 2) - hz;
  return Math.min(Math.max(d, e), 0) + Math.hypot(Math.max(d, 0), Math.max(e, 0));
}
// A cone standing on z0 with base radius r and height h (bounded, not exact: fine for marching).
function sdCone(px, py, pz, r, z0, h) {
  const t = Math.max(0, Math.min(1, (pz - z0) / h));
  const d = (Math.hypot(px, py) - r * (1 - t)) * (h / Math.hypot(h, r));
  return Math.max(d, z0 - pz, pz - z0 - h);
}
// Signed distance to castle ice (negative inside). kind: 1 wall/tower ice, 2 spire ice, 3 snow floor/ramp.
export function castleSDF(c, x, y, z) {
  const px = x - c.x;
  const py = y - c.y;
  const pz = z - c.z;
  let d = 1e9;
  let kind = 0;
  const take = (v, k) => {
    if (v < d) {
      d = v;
      kind = k;
    }
  };
  // Courtyard floor slab (top at the floor height), buried 8 m.
  take(sdBox(px, py, pz + 4, c.half, c.half, 4), 3);
  // The ramp outside the gate, falling rampDrop over rampL to the north.
  {
    const along = py - c.half;
    const top = -c.rampDrop * Math.max(0, Math.min(1, along / c.rampL));
    const v = Math.max(Math.abs(px) - (c.gateW / 2 + 0.6), -along - 0.2, along - c.rampL, pz - top, top - 3 - pz);
    take(v * 0.8, 3);
  }
  // Curtain wall with battlements: merlons every other meter along the wall.
  {
    const s = Math.abs(px) > Math.abs(py) ? py : px;
    const merlon = ((((s + 100) % 2) + 2) % 2) < 1 ? 1.1 : 0;
    const hTop = c.wallH + merlon;
    const outer = sdBox(px, py, pz - (hTop - 10) / 2, c.half, c.half, (hTop + 10) / 2);
    const inner = sdBox(px, py, pz, c.half - c.wallT, c.half - c.wallT, 100);
    let wall = Math.max(outer, -inner);
    // The gate: a box under a round arch, through the north wall.
    const arch = c.gateH - c.gateW / 2;
    const gx = px;
    const gy = py - c.half;
    const cut = Math.min(
      sdBox(gx, gy, pz - arch / 2, c.gateW / 2, c.wallT + 1, arch / 2 + 0.01),
      Math.max(Math.hypot(gx, pz - arch) - c.gateW / 2, Math.abs(gy) - c.wallT - 1),
    );
    wall = Math.max(wall, -cut);
    take(wall, 1);
  }
  for (const [sx, sy] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
    const tx = px - sx * c.half;
    const ty = py - sy * c.half;
    take(sdCyl(tx, ty, pz, c.towerR, -10, c.towerH), 1);
    take(sdCone(tx, ty, pz, c.towerR + 0.5, c.towerH, c.spireH), 2);
  }
  const kx = px;
  const ky = py + c.half * 0.45;
  take(sdCyl(kx, ky, pz, c.keepR, -10, c.keepH), 1);
  take(sdCone(kx, ky, pz, c.keepR + 0.6, c.keepH, c.keepSpire), 2);
  return { d, kind };
}
// Where the castle clears the mountain away: the courtyard and the gate passage.
export function castleAir(c, x, y, z) {
  const px = x - c.x;
  const py = y - c.y;
  const pz = z - c.z;
  if (pz > 0 && Math.abs(px) < c.half - c.wallT && Math.abs(py) < c.half - c.wallT) return true;
  if (pz > 0 && pz < c.gateH && Math.abs(px) < c.gateW / 2 && py > 0 && py < c.half + 1) return true;
  // (The ramp only adds ice: where the hill rises over it, you walk the snow.)
  return false;
}
export function castleBox(c) {
  const r = c.half + c.towerR + 1;
  return { x0: c.x - r, y0: c.y - r, x1: c.x + r, y1: c.y + c.half + c.rampL + 2, z0: c.z - 11, z1: c.z + c.keepH + c.keepSpire + 1 };
}

// ---- Caves -------------------------------------------------------------------------------------
export const GEMS = ["amethyst", "emerald", "ruby", "sapphire"];
export const MAGMA = 5;
export const LAVA_N = 128;
export const GEM_N = 288;
export const GEM_CELL = 0.25;
export const GEM_AT = { x: 150, y: -100 };

// Tubes and rooms: a floor along the axis, a domed ceiling, walls that wobble a little.
function carve(sys, prim, ground) {
  const { cells, n, cell, x0, y0 } = sys;
  const pad = (prim.kind === "tube" ? prim.w : prim.r) + 1;
  const bx0 = prim.kind === "tube" ? Math.min(prim.a.x, prim.b.x) - pad : prim.c.x - pad;
  const bx1 = prim.kind === "tube" ? Math.max(prim.a.x, prim.b.x) + pad : prim.c.x + pad;
  const by0 = prim.kind === "tube" ? Math.min(prim.a.y, prim.b.y) - pad : prim.c.y - pad;
  const by1 = prim.kind === "tube" ? Math.max(prim.a.y, prim.b.y) + pad : prim.c.y + pad;
  const i0 = Math.max(0, Math.floor((bx0 - x0) / cell));
  const i1 = Math.min(n - 1, Math.ceil((bx1 - x0) / cell));
  const j0 = Math.max(0, Math.floor((by0 - y0) / cell));
  const j1 = Math.min(n - 1, Math.ceil((by1 - y0) / cell));
  for (let j = j0; j <= j1; j += 1) {
    for (let i = i0; i <= i1; i += 1) {
      const x = x0 + (i + 0.5) * cell;
      const y = y0 + (j + 0.5) * cell;
      let d;
      let fz;
      let w;
      let h;
      if (prim.kind === "tube") {
        const ex = prim.b.x - prim.a.x;
        const ey = prim.b.y - prim.a.y;
        const t = Math.max(0, Math.min(1, ((x - prim.a.x) * ex + (y - prim.a.y) * ey) / (ex * ex + ey * ey || 1)));
        d = Math.hypot(x - (prim.a.x + ex * t), y - (prim.a.y + ey * t));
        fz = prim.a.z + (prim.b.z - prim.a.z) * t;
        w = prim.w * (1 + 0.12 * Math.sin(x * 0.9 + y * 0.7 + prim.phase));
        h = prim.h;
      } else {
        const a = Math.atan2(y - prim.c.y, x - prim.c.x);
        d = Math.hypot(x - prim.c.x, y - prim.c.y);
        fz = prim.c.z;
        w = prim.r * (1 + 0.1 * Math.sin(a * 3 + prim.phase) + 0.06 * Math.sin(a * 7 + prim.phase * 2));
        h = prim.h;
      }
      if (d >= w) continue;
      const q = d / w;
      const F = fz + 0.35 * Math.min(w, 3) * q ** 4;
      const C = fz + h * Math.sqrt(1 - q * q) ** 0.7;
      if (C - F < 0.3) continue;
      const k = (j * n + i) * 4;
      if (cells[k + 1] < cells[k]) {
        cells[k] = F;
        cells[k + 1] = C;
      } else {
        cells[k] = Math.min(cells[k], F);
        cells[k + 1] = Math.max(cells[k + 1], C);
      }
    }
  }
}
function newSystem(name, cx, cy, n, cell) {
  const cells = new Float32Array(n * n * 4);
  for (let k = 0; k < n * n; k += 1) {
    cells[k * 4] = 0;
    cells[k * 4 + 1] = -1; // C < F: no air
  }
  return { name, n, cell, x0: cx - (n * cell) / 2, y0: cy - (n * cell) / 2, size: n * cell, cells, prims: [], path: [], lights: [], spikes: [], gems: [], pools: [] };
}
function tube(sys, a, b, w, h, phase) {
  sys.prims.push({ kind: "tube", a, b, w, h, phase });
}
function room(sys, c, r, h, phase) {
  sys.prims.push({ kind: "room", c, r, h, phase });
}
// A walkable chain of tubes along points (each {x,y,z} is a floor height).
function chain(sys, pts, w, h, seed) {
  for (let k = 0; k + 1 < pts.length; k += 1) tube(sys, pts[k], pts[k + 1], w, h, u01(hashU(k, 5, seed)) * 6.28);
  for (let k = 0; k + 1 < pts.length; k += 1) {
    const a = pts[k];
    const b = pts[k + 1];
    const steps = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / 0.25));
    for (let s = 0; s < steps; s += 1) {
      const t = s / steps;
      sys.path.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
    }
  }
}
// A winding run from a to b: n bends offset sideways by up to `wiggle`.
function wind(a, b, bends, wiggle, seed, salt) {
  const pts = [a];
  const ex = b.x - a.x;
  const ey = b.y - a.y;
  const l = Math.hypot(ex, ey) || 1;
  for (let k = 1; k < bends; k += 1) {
    const t = k / bends;
    const side = (u01(hashU(k, salt, seed)) - 0.5) * 2 * wiggle;
    pts.push({ x: a.x + ex * t + (-ey / l) * side, y: a.y + ey * t + (ex / l) * side, z: a.z + (b.z - a.z) * t });
  }
  pts.push(b);
  return pts;
}

// Carve, then keep a roof: away from the mouth (within `open` m of it the cave may break the
// surface, which is the entrance) the ceiling stays a meter under the ground.
function finish(sys, ground, mouth, open) {
  for (const p of sys.prims) carve(sys, p, ground);
  const { n, cell, x0, y0, cells } = sys;
  for (let j = 0; j < n; j += 1) {
    for (let i = 0; i < n; i += 1) {
      const k = (j * n + i) * 4;
      if (cells[k + 1] <= cells[k]) continue;
      const x = x0 + (i + 0.5) * cell;
      const y = y0 + (j + 0.5) * cell;
      if (Math.hypot(x - mouth.x, y - mouth.y) < open) continue;
      const roof = ground(x, y) - 1.0;
      if (cells[k + 1] > roof) cells[k + 1] = Math.max(cells[k], roof);
    }
  }
  // Keep walk paths unchanged by later bumps: remember the clear corridor.
  sys.clear = (x, y) => {
    let m = 1e9;
    for (const p of sys.path) m = Math.min(m, Math.abs(p.x - x) + Math.abs(p.y - y));
    return m;
  };
}
function cellIndex(sys, x, y) {
  const i = Math.floor((x - sys.x0) / sys.cell);
  const j = Math.floor((y - sys.y0) / sys.cell);
  if (i < 0 || j < 0 || i >= sys.n || j >= sys.n) return -1;
  return j * sys.n + i;
}
// A cone in the floor (stalagmite, up) or ceiling (stalactite, down): radius r, length len.
function spike(sys, x, y, r, len, up) {
  const { n, cell, x0, y0, cells } = sys;
  const i0 = Math.max(0, Math.floor((x - r - x0) / cell));
  const i1 = Math.min(n - 1, Math.ceil((x + r - x0) / cell));
  const j0 = Math.max(0, Math.floor((y - r - y0) / cell));
  const j1 = Math.min(n - 1, Math.ceil((y + r - y0) / cell));
  for (let j = j0; j <= j1; j += 1) {
    for (let i = i0; i <= i1; i += 1) {
      const cx = x0 + (i + 0.5) * cell;
      const cy = y0 + (j + 0.5) * cell;
      const q = Math.hypot(cx - x, cy - y) / r;
      if (q >= 1) continue;
      const k = (j * n + i) * 4;
      if (cells[k + 1] <= cells[k]) continue;
      const lift = len * (1 - q) ** 1.6;
      if (up) cells[k] = Math.min(cells[k + 1], cells[k] + lift);
      else cells[k + 1] = Math.max(cells[k], cells[k + 1] - lift);
    }
  }
}
export function caveAt(sys, x, y) {
  const fx = (x - sys.x0) / sys.cell - 0.5;
  const fy = (y - sys.y0) / sys.cell - 0.5;
  if (fx < -0.5 || fy < -0.5 || fx > sys.n - 0.5 || fy > sys.n - 0.5) return null;
  const i = Math.max(0, Math.min(sys.n - 2, Math.floor(fx)));
  const j = Math.max(0, Math.min(sys.n - 2, Math.floor(fy)));
  const u = Math.max(0, Math.min(1, fx - i));
  const v = Math.max(0, Math.min(1, fy - j));
  const out = [0, 0, 0, 0];
  for (let c = 0; c < 4; c += 1) {
    const a = sys.cells[(j * sys.n + i) * 4 + c];
    const b = sys.cells[(j * sys.n + i + 1) * 4 + c];
    const cc = sys.cells[((j + 1) * sys.n + i) * 4 + c];
    const d = sys.cells[((j + 1) * sys.n + i + 1) * 4 + c];
    out[c] = a + (b - a) * u + (cc - a) * v + (a - b - cc + d) * u * v;
  }
  return { floor: out[0], ceil: out[1], mat: sys.cells[cellIndex(sys, x, y) * 4 + 2] || 0, heat: out[3] };
}

// The lava tubes: an opening on the volcano's south flank (between the lava channels), a winding tube
// into the cone, a magma chamber under the crater and a side gallery.
function lavaCave(ground, volcanoField, seed) {
  const flows = volcanoField.flows.map((pts) => Math.atan2(pts[pts.length - 1].y - VOLCANO.y, pts[pts.length - 1].x - VOLCANO.x)).sort((a, b) => a - b);
  let gap = -1;
  let bearing = 0;
  for (let k = 0; k < flows.length; k += 1) {
    const a = flows[k];
    const b = k + 1 < flows.length ? flows[k + 1] : flows[0] + Math.PI * 2;
    if (b - a > gap) {
      gap = b - a;
      bearing = (a + b) / 2;
    }
  }
  const out = (r) => ({ x: VOLCANO.x + Math.cos(bearing) * r, y: VOLCANO.y + Math.sin(bearing) * r });
  const mouth = out(VOLCANO.radius * 0.6);
  const mouthZ = ground(mouth.x, mouth.y);
  const chamber = { ...out(VOLCANO.radius * 0.2), z: mouthZ + 1.2 };
  const mid = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
  const sys = newSystem("lava", (mouth.x + VOLCANO.x) / 2, (mouth.y + VOLCANO.y) / 2, LAVA_N, 0.5);
  sys.bearing = bearing;
  // Start a little outside the flank so the floor meets the slope.
  const lip = out(VOLCANO.radius * 0.64);
  const start = { ...lip, z: ground(lip.x, lip.y) };
  const inside = { ...out(VOLCANO.radius * 0.52), z: mouthZ + 0.2 };
  const run = wind(inside, chamber, 5, 5, seed, 11);
  chain(sys, [start, ...run], 2.4, 4.2, seed);
  sys.route = [{ x: out(VOLCANO.radius * 0.7).x, y: out(VOLCANO.radius * 0.7).y }, ...sys.path, { x: chamber.x, y: chamber.y }];
  room(sys, chamber, 9, 6.5, 1.3);
  // A side gallery off the chamber, winding back out under the flank.
  const sideEnd = { x: chamber.x + Math.cos(bearing + 1.9) * 16, y: chamber.y + Math.sin(bearing + 1.9) * 16, z: chamber.z - 0.4 };
  const side = wind(chamber, sideEnd, 4, 3, seed, 13);
  chain(sys, side, 2.0, 3.6, seed ^ 0x51);
  room(sys, sideEnd, 5, 4.5, 2.1);
  finish(sys, ground, start, 9);
  sys.path.push({ x: chamber.x, y: chamber.y });
  // Magma pools in the chamber floor and the gallery, glowing cracks in the walls (A, heat).
  const pools = [
    { x: chamber.x + Math.cos(bearing + Math.PI / 2) * 4.5, y: chamber.y + Math.sin(bearing + Math.PI / 2) * 4.5, r: 2.2 },
    { x: chamber.x + Math.cos(bearing + Math.PI) * 5, y: chamber.y + Math.sin(bearing + Math.PI) * 5, r: 1.8 },
    { x: sideEnd.x, y: sideEnd.y, r: 1.6 },
  ];
  for (const p of pools) {
    const { n, cell, x0, y0, cells } = sys;
    for (let j = 0; j < n; j += 1) {
      for (let i = 0; i < n; i += 1) {
        const x = x0 + (i + 0.5) * cell;
        const y = y0 + (j + 0.5) * cell;
        const d = Math.hypot(x - p.x, y - p.y);
        const k = (j * n + i) * 4;
        if (cells[k + 1] <= cells[k]) continue;
        if (d < p.r) {
          cells[k] -= 0.25 * (1 - (d / p.r) ** 2);
          cells[k + 2] = MAGMA;
        }
        cells[k + 3] = Math.max(cells[k + 3], Math.exp(-Math.max(0, d - p.r) / 3.5));
      }
    }
    const k = cellIndex(sys, p.x, p.y);
    sys.pools.push({ ...p, z: sys.cells[k * 4] });
    sys.lights.push({ x: p.x, y: p.y, z: sys.cells[k * 4] + 0.4, kind: MAGMA });
  }
  // Warm walls everywhere in the tubes, hottest near the chamber.
  for (let k = 0; k < sys.n * sys.n; k += 1) {
    if (sys.cells[k * 4 + 1] <= sys.cells[k * 4]) continue;
    const x = sys.x0 + ((k % sys.n) + 0.5) * sys.cell;
    const y = sys.y0 + (Math.floor(k / sys.n) + 0.5) * sys.cell;
    const near = Math.exp(-Math.hypot(x - chamber.x, y - chamber.y) / 18);
    sys.cells[k * 4 + 3] = Math.max(sys.cells[k * 4 + 3], 0.35 * near);
  }
  sys.entrance = { outside: { x: out(VOLCANO.radius * 0.7).x, y: out(VOLCANO.radius * 0.7).y }, mouth: start, deep: chamber };
  return sys;
}

// The gem caverns: a sinkhole ramp down from the dunes in the east, a branching set of tunnels and
// three chambers with stalactites, stalagmites, columns and gem clusters.
function gemCave(ground, seed) {
  const sys = newSystem("gem", GEM_AT.x, GEM_AT.y, GEM_N, GEM_CELL);
  const top = { x: GEM_AT.x - 26, y: GEM_AT.y + 20 };
  const start = { ...top, z: ground(top.x, top.y) };
  const foot = { x: GEM_AT.x - 14, y: GEM_AT.y + 12, z: start.z - 4.5 };
  const hall = { x: GEM_AT.x, y: GEM_AT.y, z: start.z - 6.5 };
  const east = { x: GEM_AT.x + 20, y: GEM_AT.y + 8, z: hall.z - 1.0 };
  const south = { x: GEM_AT.x + 4, y: GEM_AT.y - 22, z: hall.z - 1.6 };
  chain(sys, [start, foot], 2.6, 4.0, seed);
  chain(sys, wind(foot, hall, 3, 3, seed, 21), 2.4, 4.0, seed ^ 1);
  sys.route = [{ x: top.x - 6, y: top.y + 3 }, ...sys.path, { x: hall.x, y: hall.y }];
  room(sys, hall, 11, 8, 0.7);
  chain(sys, wind(hall, east, 4, 4, seed, 23), 2.0, 3.6, seed ^ 2);
  room(sys, east, 7, 6, 2.4);
  chain(sys, wind(hall, south, 4, 4, seed, 25), 2.2, 3.8, seed ^ 3);
  room(sys, south, 8, 6.5, 4.1);
  // A dead-end branch off the south tunnel.
  const branch = { x: south.x - 16, y: south.y + 4, z: south.z + 0.3 };
  chain(sys, wind(south, branch, 3, 3, seed, 27), 1.8, 3.2, seed ^ 4);
  finish(sys, ground, start, 12);
  for (const p of [hall, east, south]) sys.path.push({ x: p.x, y: p.y });
  // Speleothems: cell candidates on a hashed 1.4 m lattice inside the rooms, away from the walkway.
  const rooms = sys.prims.filter((p) => p.kind === "room");
  let index = 0;
  for (const r of rooms) {
    for (let a = -r.r; a <= r.r; a += 1.4) {
      for (let b = -r.r; b <= r.r; b += 1.4) {
        const h = hashU(Math.round((r.c.x + a) * 10), Math.round((r.c.y + b) * 10), seed ^ 0x5eed);
        if (u01(h) > 0.32) continue;
        const x = r.c.x + a + (u01(hashU(index, 1, seed)) - 0.5) * 0.8;
        const y = r.c.y + b + (u01(hashU(index, 2, seed)) - 0.5) * 0.8;
        index += 1;
        const k = cellIndex(sys, x, y);
        if (k < 0) continue;
        const F = sys.cells[k * 4];
        const C = sys.cells[k * 4 + 1];
        if (C - F < 2.4) continue;
        if (sys.clear(x, y) < 1.9) continue;
        const kind = h % 3; // 0 stalactite, 1 stalagmite, 2 column
        const rad = 0.45 + 0.6 * u01(hashU(index, 3, seed));
        const gap = C - F;
        if (kind === 0) {
          const len = Math.min(gap * 0.55, 0.8 + 2.2 * u01(hashU(index, 4, seed)));
          spike(sys, x, y, rad, len, false);
          sys.spikes.push({ kind: "stalactite", x, y, r: rad, len, top: C });
        } else if (kind === 1) {
          const len = Math.min(gap * 0.5, 0.6 + 1.8 * u01(hashU(index, 4, seed)));
          spike(sys, x, y, rad, len, true);
          sys.spikes.push({ kind: "stalagmite", x, y, r: rad, len, base: F });
        } else {
          spike(sys, x, y, rad * 1.3, gap * 0.62, false);
          spike(sys, x, y, rad * 1.3, gap * 0.62, true);
          // Where the two cones meet the column is solid rock.
          const { n, cell, x0, y0, cells } = sys;
          for (let j = Math.max(0, Math.floor((y - rad - y0) / cell)); j <= Math.min(n - 1, Math.ceil((y + rad - y0) / cell)); j += 1) {
            for (let i = Math.max(0, Math.floor((x - rad - x0) / cell)); i <= Math.min(n - 1, Math.ceil((x + rad - x0) / cell)); i += 1) {
              if (Math.hypot(x0 + (i + 0.5) * cell - x, y0 + (j + 0.5) * cell - y) > rad * 0.45) continue;
              const k = (j * n + i) * 4;
              const mid = (cells[k] + cells[k + 1]) / 2;
              cells[k] = mid;
              cells[k + 1] = mid;
            }
          }
          sys.spikes.push({ kind: "column", x, y, r: rad * 1.3, base: F, top: C });
        }
      }
    }
  }
  // Gem clusters at the foot of the room walls: a patch of crystal (B = 1..4) with sharp little points.
  for (let r = 0; r < rooms.length; r += 1) {
    const room0 = rooms[r];
    const count = 5;
    for (let g = 0; g < count; g += 1) {
      const a = (g / count) * Math.PI * 2 + u01(hashU(r, g, seed ^ 0x6e3)) * 0.9;
      const kind = (r + g) % 4;
      // Walk out from the middle to the last air cell: the wall's foot.
      let x = room0.c.x;
      let y = room0.c.y;
      for (let s = 0; s < room0.r * 1.3; s += 0.25) {
        const nx = room0.c.x + Math.cos(a) * s;
        const ny = room0.c.y + Math.sin(a) * s;
        const k = cellIndex(sys, nx, ny);
        if (k < 0 || sys.cells[k * 4 + 1] - sys.cells[k * 4] < 0.9) break;
        x = nx;
        y = ny;
      }
      x -= Math.cos(a) * 0.6;
      y -= Math.sin(a) * 0.6;
      const size = 1.0 + 0.6 * u01(hashU(r, g + 9, seed));
      for (let j = 0; j < 6; j += 1) {
        const px = x + (u01(hashU(g, j + 20 * r, seed ^ 0x99)) - 0.5) * size;
        const py = y + (u01(hashU(g, j + 20 * r, seed ^ 0x77)) - 0.5) * size;
        spike(sys, px, py, 0.22 + 0.12 * u01(hashU(j, g, seed)), 0.35 + 0.5 * u01(hashU(j, g + 5, seed)), true);
      }
      const { n, cell, x0, y0, cells } = sys;
      for (let j = 0; j < n; j += 1) {
        const cy = y0 + (j + 0.5) * cell;
        if (Math.abs(cy - y) > size + 0.6) continue;
        for (let i = 0; i < n; i += 1) {
          const cx = x0 + (i + 0.5) * cell;
          if (Math.hypot(cx - x, cy - y) < size * 0.75 && cells[(j * n + i) * 4 + 1] > cells[(j * n + i) * 4]) cells[(j * n + i) * 4 + 2] = kind + 1;
        }
      }
      const k = cellIndex(sys, x, y);
      sys.gems.push({ kind: GEMS[kind], x, y, z: sys.cells[k * 4] + 0.3, size });
      sys.lights.push({ x, y, z: sys.cells[k * 4] + 0.6, kind: kind + 1 });
    }
  }
  // Damp limestone: wetness in A, more under the ceilings that drip.
  for (let k = 0; k < sys.n * sys.n; k += 1) {
    if (sys.cells[k * 4 + 1] > sys.cells[k * 4]) sys.cells[k * 4 + 3] = 0.3 + 0.4 * u01(hashU(k % sys.n >> 3, (k / sys.n) >> 3, seed));
  }
  sys.entrance = { outside: { x: top.x - 6, y: top.y + 3 }, mouth: start, deep: hall };
  return sys;
}

// Rock cells take F = C at the mean height of the air beside them, so bilinear reads close the walls
// smoothly (the air pinches shut at mid-height) instead of blending with a far-off default.
function seal(sys) {
  const { n, cells } = sys;
  const air = (i, j) => i >= 0 && j >= 0 && i < n && j < n && cells[(j * n + i) * 4 + 1] > cells[(j * n + i) * 4];
  const next = new Float32Array(n * n).fill(NaN);
  for (let j = 0; j < n; j += 1) {
    for (let i = 0; i < n; i += 1) {
      if (air(i, j)) continue;
      let sum = 0;
      let count = 0;
      for (let dj = -1; dj <= 1; dj += 1) {
        for (let di = -1; di <= 1; di += 1) {
          if (!air(i + di, j + dj)) continue;
          const k = ((j + dj) * n + i + di) * 4;
          sum += (cells[k] + cells[k + 1]) / 2;
          count += 1;
        }
      }
      next[j * n + i] = count ? sum / count : 0;
    }
  }
  for (let k = 0; k < n * n; k += 1) {
    if (Number.isNaN(next[k])) continue;
    cells[k * 4] = next[k];
    cells[k * 4 + 1] = next[k];
  }
}

const cache = new Map();
export function bakeUnder(ground, volcanoField, seed = LAND_SEED) {
  const hit = cache.get(seed);
  if (hit && hit.ground === ground) return hit;
  const s = fnv(seed);
  const castle = castlePlan(ground);
  const lava = lavaCave(ground, volcanoField, (s ^ 0x1a7a) >>> 0);
  const gem = gemCave(ground, (s ^ 0x6e33) >>> 0);
  seal(lava);
  seal(gem);
  const out = { ground, seed, castle, castleBox: castleBox(castle), caves: [lava, gem], lava, gem, lights: [...lava.lights, ...gem.lights] };
  cache.set(seed, out);
  return out;
}

// Rock or ice at a point? The ground is solid under the heightfield except in cave air and where the
// castle clears it; castle ice is solid wherever it is.
export function solidAt(world, ground, x, y, z) {
  const b = world.castleBox;
  if (x >= b.x0 && x <= b.x1 && y >= b.y0 && y <= b.y1 && z >= b.z0 && z <= b.z1) {
    if (castleSDF(world.castle, x, y, z).d < 0) return true;
    if (castleAir(world.castle, x, y, z)) return false;
  }
  const g = ground(x, y);
  if (z >= g) return false;
  for (const sys of world.caves) {
    const c = caveAt(sys, x, y);
    if (c && c.ceil > c.floor && z > c.floor && z < c.ceil) return false;
  }
  return true;
}
export function inUnder(world, x, y) {
  const b = world.castleBox;
  if (x >= b.x0 && x <= b.x1 && y >= b.y0 && y <= b.y1) return true;
  return world.caves.some((s) => x >= s.x0 && y >= s.y0 && x < s.x0 + s.size && y < s.y0 + s.size);
}
// The floor under a body whose feet are at z: the first solid below a probe just over the feet
// (so a small step up is taken), or null when buried (the caller falls back to the ground).
export function floorUnder(world, ground, x, y, z) {
  let probe = z + 0.45;
  if (solidAt(world, ground, x, y, probe)) {
    let up = probe;
    for (let k = 0; k < 20 && solidAt(world, ground, x, y, up); k += 1) up += 0.1;
    if (solidAt(world, ground, x, y, up)) return null;
    probe = up;
  }
  let lo = probe;
  for (let k = 0; k < 600; k += 1) {
    const next = lo - 0.1;
    if (solidAt(world, ground, x, y, next)) {
      let a = next;
      let b = lo;
      for (let r = 0; r < 8; r += 1) {
        const m = (a + b) / 2;
        if (solidAt(world, ground, x, y, m)) a = m;
        else b = m;
      }
      return b;
    }
    lo = next;
  }
  return null;
}
// Is a standing body (feet z, 1.7 m tall) inside rock or ice?
export function bodyBlocked(world, ground, x, y, z) {
  return [0.55, 1.15, 1.7].some((h) => solidAt(world, ground, x, y, z + h));
}
// Under a cave roof: deep enough that the sky is not over you.
export function underground(world, ground, x, y, z) {
  if (z >= ground(x, y) - 0.5) return false;
  return world.caves.some((sys) => {
    const c = caveAt(sys, x, y);
    return c && c.ceil > c.floor && z > c.floor - 0.2 && z < c.ceil;
  });
}

// ?caves=0 turns the heavy cave and castle effects off (lights, sparkle, refraction, cave shimmer);
// the rock, ice and walls stay, since everyone walks in them. Bots default off.
export function cavesLevel(raw, bot = false) {
  if (raw == null || raw === "") return bot ? 0 : 1;
  const v = Number(raw);
  if (!Number.isFinite(v)) return bot ? 0 : 1;
  return v > 0 ? 1 : 0;
}

// ?look=castle (on the ramp below the gate, facing it), ?look=lavacave (in the magma chamber),
// ?look=gemcave (in the gem hall). Feet z included for the caves.
export function underView(world, which) {
  const c = world.castle;
  if (which === "castle") {
    const x = c.x + 5;
    const y = c.y + c.half + c.rampL + 9;
    return { x, y, yaw: Math.atan2(c.x - x, c.y - y), pitch: 0.2 };
  }
  const sys = which === "lavacave" ? world.lava : world.gem;
  const deep = sys.entrance.deep;
  const focus = which === "lavacave" ? sys.pools[0] : sys.gems.find((g) => Math.hypot(g.x - deep.x, g.y - deep.y) < 14) || sys.gems[0];
  const ox = deep.x - focus.x;
  const oy = deep.y - focus.y;
  const l = Math.hypot(ox, oy) || 1;
  const x = deep.x + (ox / l) * 2.5;
  const y = deep.y + (oy / l) * 2.5;
  const k = cellIndex(sys, x, y);
  return { x, y, z: sys.cells[k * 4] + 0.02, yaw: Math.atan2(focus.x - x, focus.y - y), pitch: -0.08 };
}

export function underDigest(world) {
  let h = 2166136261;
  for (const sys of world.caves) {
    const bytes = new Uint8Array(sys.cells.buffer);
    for (let i = 0; i < bytes.length; i += 3) h = Math.imul(h ^ bytes[i], 16777619) >>> 0;
  }
  const c = world.castle;
  for (const v of [c.x, c.y, c.z]) h = Math.imul(h ^ Math.round(v * 100), 16777619) >>> 0;
  return h.toString(16);
}
