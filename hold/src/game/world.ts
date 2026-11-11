import { tangentFrame, vadd, vlen, vnorm, vscale, type V3 } from "./math";

/** Cubic lattice. Person-scale voxels on a globe twice the previous vale. */
export const N = 400;
export const WORLD_W = N;
export const WORLD_H = N;
export const WORLD_D = N;
export const CENTER = N * 0.5;
export const SEA = 176;

export const AIR = 0;
export const GRASS = 1;
export const STONE = 2;
export const TIMBER = 3;
export const PLASTER = 4;
export const THATCH = 5;
export const WATER = 6;
export const BANNER = 7;
export const IRON = 8;
export const LEAVES = 9;
export const PATH = 10;
export const SAND = 11;
export const EMBER = 12;
export const MOSS = 13;
export const HAY = 14;
export const MAGMA = 15;
export const GEM = 16;
export const ASH = 17;
export const SNOW = 18;

export type World = {
  vox: Uint8Array;
  spawn: V3;
  steward: V3;
  camp: V3;
  miller: V3;
  weaver: V3;
  wolfA: V3;
  wolfB: V3;
  vent: V3;
  peak: V3;
  spawnYaw: number;
};

const SPAWN_DIR = vnorm({ x: 0.62, y: 0.42, z: 0.66 });

function hash3(x: number, y: number, z: number): number {
  let n = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(z | 0, 1440662683);
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967295;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function noise3(x: number, y: number, z: number): number {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const z0 = Math.floor(z);
  const fx = x - x0;
  const fy = y - y0;
  const fz = z - z0;
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);
  const sz = fz * fz * (3 - 2 * fz);
  const h000 = hash3(x0, y0, z0);
  const h100 = hash3(x0 + 1, y0, z0);
  const h010 = hash3(x0, y0 + 1, z0);
  const h110 = hash3(x0 + 1, y0 + 1, z0);
  const h001 = hash3(x0, y0, z0 + 1);
  const h101 = hash3(x0 + 1, y0, z0 + 1);
  const h011 = hash3(x0, y0 + 1, z0 + 1);
  const h111 = hash3(x0 + 1, y0 + 1, z0 + 1);
  const x00 = lerp(h000, h100, sx);
  const x10 = lerp(h010, h110, sx);
  const x01 = lerp(h001, h101, sx);
  const x11 = lerp(h011, h111, sx);
  return lerp(lerp(x00, x10, sy), lerp(x01, x11, sy), sz);
}

function fbm(x: number, y: number, z: number): number {
  return noise3(x, y, z) * 0.58 + noise3(x * 2.1, y * 2.1, z * 2.1) * 0.27 + noise3(x * 4.2, y * 4.2, z * 4.2) * 0.15;
}

function vidx(x: number, y: number, z: number): number {
  return x + y * N + z * N * N;
}

export function upOf(x: number, y: number, z: number): V3 {
  return vnorm({ x: x - CENTER, y: y - CENTER, z: z - CENTER });
}

export function radialOf(p: V3): number {
  return Math.hypot(p.x - CENTER, p.y - CENTER, p.z - CENTER);
}

export function voxelAt(world: World, x: number, y: number, z: number): number {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const iz = Math.floor(z);
  if (ix < 0 || iy < 0 || iz < 0 || ix >= N || iy >= N || iz >= N) return AIR;
  return world.vox[vidx(ix, iy, iz)];
}

function blocksBody(id: number): boolean {
  return id === STONE || id === TIMBER || id === PLASTER || id === THATCH || id === IRON || id === MOSS;
}

function isGround(id: number): boolean {
  return id !== AIR && id !== LEAVES && id !== BANNER && id !== EMBER;
}

export function bodyClear(world: World, feet: V3): boolean {
  const up = upOf(feet.x, feet.y, feet.z);
  for (const h of [1.5, 3.1, 4.7]) {
    if (blocksBody(voxelAt(world, feet.x + up.x * h, feet.y + up.y * h, feet.z + up.z * h))) return false;
  }
  return true;
}

export function waterAtPoint(world: World, feet: V3): boolean {
  const up = upOf(feet.x, feet.y, feet.z);
  const id = voxelAt(world, feet.x - up.x * 0.8, feet.y - up.y * 0.8, feet.z - up.z * 0.8);
  return id === WATER;
}

/** Drop a point onto the shell along its radial line. Feet sit just outside the ground. */
export function snapFeet(world: World, x: number, y: number, z: number): V3 | null {
  let dx = x - CENTER;
  let dy = y - CENTER;
  let dz = z - CENTER;
  let len = Math.hypot(dx, dy, dz);
  if (len < 1) {
    dx = SPAWN_DIR.x;
    dy = SPAWN_DIR.y;
    dz = SPAWN_DIR.z;
    len = 1;
  }
  const ux = dx / len;
  const uy = dy / len;
  const uz = dz / len;
  let r = Math.min(N - 2.5, Math.max(len + 8, SEA + 10));
  let hit = -1;
  for (let i = 0; i < 56; i++) {
    if (isGround(voxelAt(world, CENTER + ux * r, CENTER + uy * r, CENTER + uz * r))) {
      hit = r;
      break;
    }
    r -= 0.42;
    if (r < 12) break;
  }
  if (hit < 0) return null;
  let s = hit;
  for (let i = 0; i < 8; i++) {
    const id = voxelAt(world, CENTER + ux * (s + 0.34), CENTER + uy * (s + 0.34), CENTER + uz * (s + 0.34));
    if (!isGround(id)) {
      s += 0.34;
      break;
    }
    s += 0.34;
  }
  return { x: CENTER + ux * s, y: CENTER + uy * s, z: CENTER + uz * s };
}

function setV(vox: Uint8Array, x: number, y: number, z: number, t: number) {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const iz = Math.floor(z);
  if (ix < 1 || iy < 1 || iz < 1 || ix >= N - 1 || iy >= N - 1 || iz >= N - 1) return;
  vox[vidx(ix, iy, iz)] = t;
}

function getV(vox: Uint8Array, x: number, y: number, z: number): number {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const iz = Math.floor(z);
  if (ix < 0 || iy < 0 || iz < 0 || ix >= N || iy >= N || iz >= N) return AIR;
  return vox[vidx(ix, iy, iz)];
}

function relief(dx: number, dy: number, dz: number): number {
  const l = Math.hypot(dx, dy, dz) || 1;
  const n = fbm((dx / l) * 2.35 + 4.2, (dy / l) * 2.35 - 1.7, (dz / l) * 2.35 + 0.4);
  return (n - 0.48) * 8;
}

function rotY(d: V3, ang: number): V3 {
  const c = Math.cos(ang);
  const s = Math.sin(ang);
  return vnorm({ x: d.x * c - d.z * s, y: d.y, z: d.x * s + d.z * c });
}

export function generateWorld(): World {
  const vox = new Uint8Array(N * N * N);
  const rHi = SEA + 10;
  const rLo = SEA - 14;
  const rHi2 = rHi * rHi;
  const rLo2 = rLo * rLo;
  for (let z = 0; z < N; z++) {
    const dz = z + 0.5 - CENTER;
    const dz2 = dz * dz;
    if (dz2 > rHi2) continue;
    for (let y = 0; y < N; y++) {
      const dy = y + 0.5 - CENTER;
      const dyz = dz2 + dy * dy;
      if (dyz > rHi2) continue;
      const span = Math.sqrt(rHi2 - dyz);
      let x0 = Math.floor(CENTER - span);
      let x1 = Math.ceil(CENTER + span);
      if (x0 < 0) x0 = 0;
      if (x1 > N - 1) x1 = N - 1;
      const hole = dyz < rLo2 ? Math.sqrt(rLo2 - dyz) : 0;
      for (let x = x0; x <= x1; x++) {
        const dx = x + 0.5 - CENTER;
        if (hole > 0 && dx > -hole && dx < hole) continue;
        const r = Math.hypot(dx, dy, dz);
        if (r > SEA + 4.5 || r < SEA - 9.3) continue;
        const h = SEA + relief(dx, dy, dz);
        if (r > h || r < h - 5.2) continue;
        const depth = h - r;
        const coast = h - SEA;
        let mat = STONE;
        if (coast < 0.2) mat = depth < 1.15 ? WATER : SAND;
        else if (coast < 0.85) mat = depth < 1 ? SAND : STONE;
        else if (coast < 3.5) mat = depth < 1.05 ? GRASS : STONE;
        else mat = depth < 0.85 ? MOSS : STONE;
        vox[vidx(x, y, z)] = mat;
      }
    }
  }

  const up = SPAWN_DIR;
  const { east, north } = tangentFrame(up);
  const flatR = SEA + 1.35;

  const at = (e: number, u: number, n: number): V3 =>
    vadd(vadd(vadd({ x: CENTER, y: CENTER, z: CENTER }, vscale(up, flatR + u)), vscale(east, e)), vscale(north, n));

  // Flatten a courtyard disc and clear the sky above it.
  const yard = { x: CENTER + up.x * flatR, y: CENTER + up.y * flatR, z: CENTER + up.z * flatR };
  forEachNear(yard, 36, (x, y, z) => {
    const p = { x: x + 0.5 - CENTER, y: y + 0.5 - CENTER, z: z + 0.5 - CENTER };
    const radial = p.x * up.x + p.y * up.y + p.z * up.z;
    const tx = p.x - up.x * radial;
    const ty = p.y - up.y * radial;
    const tz = p.z - up.z * radial;
    const tang = Math.hypot(tx, ty, tz);
    if (tang > 18 || radial < flatR - 6 || radial > flatR + 14) return;
    if (radial < flatR - 1.05) vox[vidx(x, y, z)] = STONE;
    else if (radial < flatR) vox[vidx(x, y, z)] = tang < 5 || Math.abs(tx) < 1.2 ? PATH : GRASS;
    else vox[vidx(x, y, z)] = AIR;
  });

  function stamp(e: number, u: number, n: number, t: number) {
    const p = at(e, u, n);
    setV(vox, p.x, p.y, p.z, t);
  }

  // Curtain wall with a gate facing −north (the direction yaw 0 looks).
  for (let e = -14; e <= 14; e++) {
    for (let n = -14; n <= 14; n++) {
      const tang = Math.hypot(e, n);
      if (tang < 12.2 || tang > 14.2) continue;
      const gate = n < -11.5 && Math.abs(e) <= 2.4;
      for (let u = 0; u < (gate ? 0 : 6); u++) {
        const corner = tang > 13.4 && (Math.abs(e) > 12 || Math.abs(n) > 12);
        stamp(e, u, n, corner ? MOSS : STONE);
      }
      if (!gate && (e + n) % 5 === 0) stamp(e, 6, n, BANNER);
    }
  }
  stamp(0, 7, -13, BANNER);
  stamp(0, 8, -13, BANNER);
  stamp(-3, 5, -13, IRON);
  stamp(3, 5, -13, IRON);

  // Hall behind the spawn, door toward the yard.
  for (let e = -6; e <= 6; e++) {
    for (let n = 3; n <= 12; n++) {
      const edge = e === -6 || e === 6 || n === 3 || n === 12;
      const door = n === 3 && e >= -1 && e <= 1;
      if (edge) {
        for (let u = 0; u < 7; u++) {
          if (door && u < 5) continue;
          const corner = (e === -6 || e === 6) && (n === 3 || n === 12);
          stamp(e, u, n, corner ? TIMBER : STONE);
        }
      }
      const inset = Math.min(Math.abs(e) === 6 ? 0 : Math.min(6 - Math.abs(e), n - 3, 12 - n), 3);
      stamp(e, 7 + Math.max(0, 2 - inset), n, THATCH);
    }
  }
  stamp(0, 11, 8, BANNER);
  stamp(0, 12, 8, BANNER);

  // Towers on the wall corners.
  for (const [te, tn] of [
    [-12, -12],
    [12, -12],
    [-12, 12],
    [12, 12],
  ] as const) {
    for (let de = -1; de <= 1; de++) {
      for (let dn = -1; dn <= 1; dn++) {
        for (let u = 0; u < 11; u++) stamp(te + de, u, tn + dn, STONE);
      }
    }
    stamp(te, 11, tn, BANNER);
    stamp(te, 12, tn, BANNER);
  }

  function house(e0: number, n0: number, w: number, d: number) {
    for (let e = 0; e < w; e++) {
      for (let n = 0; n < d; n++) {
        const edge = e === 0 || n === 0 || e === w - 1 || n === d - 1;
        const door = n === 0 && e >= 2 && e <= 3;
        if (edge) {
          for (let u = 0; u < 5; u++) {
            if (door && u < 4) continue;
            const corner = (e === 0 || e === w - 1) && (n === 0 || n === d - 1);
            stamp(e0 + e, u, n0 + n, corner ? TIMBER : PLASTER);
          }
        }
        const inset = Math.min(e, w - 1 - e, n, d - 1 - n);
        stamp(e0 + e, 5 + Math.max(0, 2 - inset), n0 + n, THATCH);
      }
    }
  }
  house(16, -2, 7, 6);
  house(16, 8, 6, 6);
  house(-22, 2, 7, 6);

  // Camp, mill, and loom sit on other meridians, a real walk from the keep.
  const millDir = rotY(SPAWN_DIR, 0.95);
  const loomDir = rotY(SPAWN_DIR, -1.65);
  const campDir = rotY(SPAWN_DIR, 2.45);
  const millP = hamlet(vox, millDir, "mill");
  const loomP = hamlet(vox, loomDir, "loom");
  const campP = hamlet(vox, campDir, "camp");

  const mtnDir = rotY(SPAWN_DIR, 1.35);
  const lakeDir = rotY(mtnDir, 0.2);
  const mouthDir = rotY(mtnDir, 0.4);
  const ventDir = rotY(SPAWN_DIR, -2.35);
  raiseMountain(vox, mtnDir);
  raiseVolcano(vox, ventDir);
  carvePool(vox, lakeDir, 11, 1.7);
  carveChannel(vox, rotY(mtnDir, 0.06), lakeDir, 2.4, 18);
  carveChannel(vox, lakeDir, mouthDir, 3.6, 16);
  digCave(vox, mtnDir);

  // Scatter trees on dry grass, away from the hold and the outlying roofs.
  const holdP = at(0, 2, 0);
  const mtnP = vadd({ x: CENTER, y: CENTER, z: CENTER }, vscale(mtnDir, SEA + 2));
  const ventP = vadd({ x: CENTER, y: CENTER, z: CENTER }, vscale(ventDir, SEA + 4));
  let trees = 0;
  for (let i = 0; i < 1400 && trees < 360; i++) {
    const dir = fib(i, 1400);
    const h = SEA + relief(dir.x, dir.y, dir.z);
    if (h < SEA + 0.9 || h > SEA + 4.4) continue;
    const p = vadd({ x: CENTER, y: CENTER, z: CENTER }, vscale(dir, h));
    if (vlen(vadd(p, vscale(holdP, -1))) < 22) continue;
    if (vlen(vadd(p, vscale(campP, -1))) < 14) continue;
    if (vlen(vadd(p, vscale(millP, -1))) < 12) continue;
    if (vlen(vadd(p, vscale(loomP, -1))) < 12) continue;
    if (vlen(vadd(p, vscale(mtnP, -1))) < 24) continue;
    if (vlen(vadd(p, vscale(ventP, -1))) < 20) continue;
    const id = getV(vox, p.x, p.y, p.z);
    if (id !== GRASS && id !== MOSS) continue;
    const fr = tangentFrame(dir);
    for (let u = 0; u < 4; u++) {
      const t = vadd(p, vscale(dir, u));
      setV(vox, t.x, t.y, t.z, TIMBER);
    }
    for (let de = -2; de <= 2; de++) {
      for (let dn = -2; dn <= 2; dn++) {
        if (de * de + dn * dn > 6) continue;
        for (let u = 3; u <= 5; u++) {
          const t = vadd(vadd(vadd(p, vscale(dir, u)), vscale(fr.east, de)), vscale(fr.north, dn));
          if (getV(vox, t.x, t.y, t.z) === AIR) setV(vox, t.x, t.y, t.z, LEAVES);
        }
      }
    }
    trees++;
  }

  const world: World = {
    vox,
    spawn: at(0, 1.2, -6),
    steward: at(0, 1.2, 1.5),
    camp: campP,
    miller: millP,
    weaver: loomP,
    wolfA: at(-16, 1.2, -16),
    wolfB: vadd({ x: CENTER, y: CENTER, z: CENTER }, vscale(rotY(SPAWN_DIR, -0.55), SEA + 2)),
    vent: vadd({ x: CENTER, y: CENTER, z: CENTER }, vscale(ventDir, SEA + 6)),
    peak: surfacePoint(mtnDir, 14),
    spawnYaw: 0,
  };
  const snap = (p: V3) => snapFeet(world, p.x, p.y, p.z) ?? p;
  world.spawn = snap(world.spawn);
  world.steward = snap(world.steward);
  world.camp = snap(world.camp);
  world.miller = snap(world.miller);
  world.weaver = snap(world.weaver);
  world.wolfA = snap(world.wolfA);
  world.wolfB = snap(world.wolfB);
  return world;
}

function forEachNear(c: V3, reach: number, fn: (x: number, y: number, z: number) => void) {
  const x0 = Math.max(1, Math.floor(c.x - reach));
  const y0 = Math.max(1, Math.floor(c.y - reach));
  const z0 = Math.max(1, Math.floor(c.z - reach));
  const x1 = Math.min(N - 2, Math.ceil(c.x + reach));
  const y1 = Math.min(N - 2, Math.ceil(c.y + reach));
  const z1 = Math.min(N - 2, Math.ceil(c.z + reach));
  for (let z = z0; z <= z1; z++) {
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) fn(x, y, z);
    }
  }
}

function hamlet(vox: Uint8Array, dir: V3, kind: "mill" | "loom" | "camp"): V3 {
  const base = SEA + (kind === "camp" ? 0.9 : 1.2);
  flattenPad(vox, dir, base, kind === "camp" ? 9 : 7);
  const fr = tangentFrame(dir);
  const stamp = (e: number, u: number, n: number, t: number) => {
    const p = vadd(
      vadd(vadd({ x: CENTER, y: CENTER, z: CENTER }, vscale(dir, base + u)), vscale(fr.east, e)),
      vscale(fr.north, n),
    );
    setV(vox, p.x, p.y, p.z, t);
  };
  if (kind === "camp") {
    for (let e = -6; e <= 6; e++) {
      for (let n = -5; n <= 5; n++) {
        const edge = Math.abs(e) === 6 || Math.abs(n) === 5;
        if (!edge) continue;
        if (e === -6 && n >= -1 && n <= 1) continue;
        for (let u = 0; u < 4; u++) stamp(e, u, n, (e + n) % 2 === 0 ? TIMBER : HAY);
      }
    }
    for (let u = 0; u < 3; u++) stamp(0, u, 0, EMBER);
  } else if (kind === "mill") {
    for (let e = -2; e <= 2; e++) {
      for (let n = -2; n <= 2; n++) {
        if (Math.abs(e) !== 2 && Math.abs(n) !== 2) continue;
        const door = n === -2 && e === 0;
        for (let u = 0; u < 7; u++) {
          if (door && u < 4) continue;
          stamp(e, u, n, TIMBER);
        }
      }
    }
    stamp(0, 7, 0, THATCH);
    stamp(0, 8, 0, THATCH);
    stamp(3, 2, 0, TIMBER);
    stamp(3, 3, 0, TIMBER);
    stamp(4, 3, 0, TIMBER);
    stamp(0, 9, 0, BANNER);
  } else {
    for (let e = -2; e <= 2; e++) {
      for (let n = -2; n <= 3; n++) {
        const edge = e === -2 || e === 2 || n === -2 || n === 3;
        if (!edge) continue;
        const door = n === -2 && e === 0;
        for (let u = 0; u < 5; u++) {
          if (door && u < 3) continue;
          stamp(e, u, n, e === -2 || e === 2 ? TIMBER : PLASTER);
        }
        stamp(e, 5, n, THATCH);
      }
    }
    stamp(0, 6, 1, BANNER);
  }
  return vadd({ x: CENTER, y: CENTER, z: CENTER }, vscale(dir, base + 1.4));
}

function flattenPad(vox: Uint8Array, dir: V3, radius: number, tangR: number) {
  const c = { x: CENTER + dir.x * radius, y: CENTER + dir.y * radius, z: CENTER + dir.z * radius };
  forEachNear(c, tangR + 12, (x, y, z) => {
    const p = { x: x + 0.5 - CENTER, y: y + 0.5 - CENTER, z: z + 0.5 - CENTER };
    const radial = p.x * dir.x + p.y * dir.y + p.z * dir.z;
    const tx = p.x - dir.x * radial;
    const ty = p.y - dir.y * radial;
    const tz = p.z - dir.z * radial;
    if (Math.hypot(tx, ty, tz) > tangR) return;
    if (radial < radius - 4 || radial > radius + 8) return;
    if (radial < radius - 1) vox[vidx(x, y, z)] = STONE;
    else if (radial < radius) vox[vidx(x, y, z)] = PATH;
    else vox[vidx(x, y, z)] = AIR;
  });
}

function fib(i: number, n: number): V3 {
  const y = 1 - (i / (n - 1)) * 2;
  const r = Math.sqrt(Math.max(0, 1 - y * y));
  const th = i * 2.399963;
  return { x: Math.cos(th) * r, y, z: Math.sin(th) * r };
}

function surfacePoint(dir: V3, lift: number): V3 {
  return vadd({ x: CENTER, y: CENTER, z: CENTER }, vscale(dir, SEA + lift));
}

/** Reshape the shell inside a tangent disc. `lift` is height above the sea. */
function paintShell(
  vox: Uint8Array,
  dir: V3,
  tangR: number,
  heightAt: (tang: number) => number | null,
  skin: (lift: number, depth: number) => number,
) {
  const c = surfacePoint(dir, 2);
  forEachNear(c, tangR + 10, (x, y, z) => {
    const px = x + 0.5 - CENTER;
    const py = y + 0.5 - CENTER;
    const pz = z + 0.5 - CENTER;
    const radial = px * dir.x + py * dir.y + pz * dir.z;
    const tx = px - dir.x * radial;
    const ty = py - dir.y * radial;
    const tz = pz - dir.z * radial;
    const tang = Math.hypot(tx, ty, tz);
    if (tang > tangR) return;
    const lift = heightAt(tang);
    if (lift === null) return;
    const h = SEA + lift;
    const r = Math.hypot(px, py, pz);
    if (r > h + 0.15 && r < SEA + 6.5) {
      vox[vidx(x, y, z)] = AIR;
      return;
    }
    if (r > h || r < h - 5.5) return;
    vox[vidx(x, y, z)] = skin(lift, h - r);
  });
}

function raiseMountain(vox: Uint8Array, dir: V3) {
  const R = 26;
  const H = 16;
  paintShell(
    vox,
    dir,
    R,
    (tang) => {
      const u = tang / R;
      return H * (1 - u) * (1 - u) + 0.3;
    },
    (lift, depth) => {
      if (lift > 8) return depth < 1.15 ? SNOW : STONE;
      if (depth < 1.05) return lift > 4 ? MOSS : GRASS;
      return STONE;
    },
  );
}

function raiseVolcano(vox: Uint8Array, dir: V3) {
  const R = 22;
  const H = 13;
  paintShell(
    vox,
    dir,
    R,
    (tang) => {
      const u = tang / R;
      const rim = H * (1 - u * u);
      if (tang < 4.4) return Math.max(0.4, rim - (4.4 - tang) * 1.7);
      return rim;
    },
    (lift, depth) => (depth < 1.15 ? ASH : STONE),
  );
  paintShell(vox, dir, 3.5, () => 0.55, () => MAGMA);
  const fr = tangentFrame(dir);
  for (let i = 1; i < 16; i++) {
    const lift = 7.2 - i * 0.42;
    const p = vadd(
      vadd(surfacePoint(dir, lift), vscale(fr.north, 3.2 + i * 0.85)),
      vscale(fr.east, Math.sin(i * 0.65) * 1.3),
    );
    setV(vox, p.x, p.y, p.z, MAGMA);
    if (i % 3 === 0) {
      const spark = vadd(p, vscale(dir, 1 + (i % 2)));
      setV(vox, spark.x, spark.y, spark.z, EMBER);
    }
  }
}

function carvePool(vox: Uint8Array, dir: V3, radius: number, depth: number) {
  paintShell(
    vox,
    dir,
    radius,
    (tang) => {
      const u = tang / radius;
      return -depth * (1 - u * u) - 0.15;
    },
    (_lift, d) => (d < 1.25 ? WATER : SAND),
  );
}

function carveChannel(vox: Uint8Array, a: V3, b: V3, width: number, steps: number) {
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const dir = vnorm(vadd(vscale(a, 1 - t), vscale(b, t)));
    paintShell(
      vox,
      dir,
      width,
      (tang) => -1.15 * (1 - (tang / width) * (tang / width)),
      (_lift, d) => (d < 1.15 ? WATER : SAND),
    );
  }
}

function digCave(vox: Uint8Array, dir: V3) {
  const fr = tangentFrame(dir);
  for (let i = -6; i <= 16; i++) {
    for (let u = -3; u <= 3; u++) {
      for (let n = -3; n <= 3; n++) {
        const bulb = i < -2 ? 2.2 : 0;
        if (u * u + n * n > 6.5 + bulb) continue;
        const p = vadd(vadd(vadd(surfacePoint(dir, -7 + u * 0.15), vscale(fr.east, i)), vscale(dir, u)), vscale(fr.north, n));
        const wall = u * u + n * n > 3.6 + bulb * 0.4;
        if (!wall) setV(vox, p.x, p.y, p.z, AIR);
        else if ((i * 3 + n * 5 + u) % 4 === 0) setV(vox, p.x, p.y, p.z, GEM);
        else setV(vox, p.x, p.y, p.z, STONE);
      }
    }
  }
  for (let u = 0; u <= 9; u++) {
    for (let e = -1; e <= 1; e++) {
      for (let n = -1; n <= 1; n++) {
        const p = vadd(vadd(surfacePoint(dir, -u), vscale(fr.east, 14 + e * 0.2)), vscale(fr.north, n));
        setV(vox, p.x, p.y, p.z, AIR);
      }
    }
  }
}
