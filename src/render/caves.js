// The picture side of src/sim/under.js: the castle's signed distance and the cave grids in GLSL.
// The caves ride in the volcano texture as an atlas (no new sampler: the trace already uses the
// WebGL2 minimum of 16), tiles side by side: volcano 320², lava tubes 128², gem caverns 288².
// Everything here is baked from the world seed, the same on every peer.
const f = (v) => Number(v).toFixed(4);

export const ATLAS_W = 320 + 128 + 288;
export const ATLAS_H = 320;
export const LAVA_U0 = 320;
export const GEM_U0 = 448;
export const MAX_CAVE_LIGHTS = 24;

// The z span of a system's air (cells whose ceiling is over the floor), padded.
function airSpan(sys) {
  let lo = Infinity;
  let hi = -Infinity;
  for (let k = 0; k < sys.n * sys.n; k += 1) {
    const F = sys.cells[k * 4];
    const C = sys.cells[k * 4 + 1];
    if (C <= F) continue;
    lo = Math.min(lo, F);
    hi = Math.max(hi, C);
  }
  return { lo: lo - 0.5, hi: hi + 0.5 };
}

// One RGBA float atlas: the volcano tile at x 0, then the two caves (F, C, material, heat/wetness).
export function underAtlas(world, volcTexels, volcN) {
  const out = new Float32Array(ATLAS_W * ATLAS_H * 4);
  const put = (src, n, u0) => {
    for (let j = 0; j < n; j += 1) out.set(src.subarray(j * n * 4, (j + 1) * n * 4), (j * ATLAS_W + u0) * 4);
  };
  put(volcTexels, volcN, 0);
  put(world.lava.cells, world.lava.n, LAVA_U0);
  put(world.gem.cells, world.gem.n, GEM_U0);
  return out;
}

export function underGlsl(world) {
  const c = world.castle;
  const b = world.castleBox;
  const lava = world.lava;
  const gem = world.gem;
  const ls = airSpan(lava);
  const gs = airSpan(gem);
  const lights = world.lights.slice(0, MAX_CAVE_LIGHTS);
  const lightList = lights.map((l) => `vec4(${f(l.x)}, ${f(l.y)}, ${f(l.z)}, ${f(l.kind)})`).join(",\n  ");
  return `
// ---- The ice castle and the caves (src/sim/under.js, src/render/caves.js) ----
const vec3 CASTLE_C = vec3(${f(c.x)}, ${f(c.y)}, ${f(c.z)});
const float C_HALF = ${f(c.half)};
const float C_WALL_T = ${f(c.wallT)};
const float C_WALL_H = ${f(c.wallH)};
const float C_TOWER_R = ${f(c.towerR)};
const float C_TOWER_H = ${f(c.towerH)};
const float C_SPIRE_H = ${f(c.spireH)};
const float C_KEEP_R = ${f(c.keepR)};
const float C_KEEP_H = ${f(c.keepH)};
const float C_KEEP_SPIRE = ${f(c.keepSpire)};
const float C_GATE_W = ${f(c.gateW)};
const float C_GATE_H = ${f(c.gateH)};
const float C_RAMP_L = ${f(c.rampL)};
const float C_RAMP_DROP = ${f(c.rampDrop)};
const vec3 CASTLE_MIN = vec3(${f(b.x0)}, ${f(b.y0)}, ${f(b.z0)});
const vec3 CASTLE_MAX = vec3(${f(b.x1)}, ${f(b.y1)}, ${f(b.z1)});
const float ATLAS_W = ${ATLAS_W}.0;
const float ATLAS_H = ${ATLAS_H}.0;
// x0, y0, cell (m), cells per side; and the atlas column the tile starts at.
const vec4 LAVA_BOX = vec4(${f(lava.x0)}, ${f(lava.y0)}, ${f(lava.cell)}, ${lava.n}.0);
const float LAVA_U0 = ${LAVA_U0}.0;
const vec3 LAVA_MIN = vec3(${f(lava.x0)}, ${f(lava.y0)}, ${f(ls.lo)});
const vec3 LAVA_MAX = vec3(${f(lava.x0 + lava.size)}, ${f(lava.y0 + lava.size)}, ${f(ls.hi)});
const vec4 GEM_BOX = vec4(${f(gem.x0)}, ${f(gem.y0)}, ${f(gem.cell)}, ${gem.n}.0);
const float GEM_U0 = ${GEM_U0}.0;
const vec3 GEM_MIN = vec3(${f(gem.x0)}, ${f(gem.y0)}, ${f(gs.lo)});
const vec3 GEM_MAX = vec3(${f(gem.x0 + gem.size)}, ${f(gem.y0 + gem.size)}, ${f(gs.hi)});
// Gem clusters (kind 1 amethyst, 2 emerald, 3 ruby, 4 sapphire) and magma pools (5) light the caves.
const int CAVE_LIGHTS = ${lights.length};
const vec4 CAVE_LIGHT[${Math.max(lights.length, 1)}] = vec4[${Math.max(lights.length, 1)}](
  ${lightList || "vec4(0.0)"}
);

vec4 tileAt(vec2 p, vec4 box, float u0) {
  vec2 g = clamp((p - box.xy) / box.z, vec2(0.5), vec2(box.w - 0.5));
  return texture(uVolc, vec2((u0 + g.x) / ATLAS_W, g.y / ATLAS_H));
}
// The nearest cell's material (ids must not blend).
float tileMat(vec2 p, vec4 box, float u0) {
  vec2 g = clamp(floor((p - box.xy) / box.z), vec2(0.0), vec2(box.w - 1.0));
  return texelFetch(uVolc, ivec2(int(u0 + g.x), int(g.y)), 0).b;
}
bool inBox3(vec3 q, vec3 a, vec3 b) {
  return q.x >= a.x && q.y >= a.y && q.z >= a.z && q.x <= b.x && q.y <= b.y && q.z <= b.z;
}
bool boxSpan(vec3 ro, vec3 rd, vec3 bmin, vec3 bmax, out float t0, out float t1) {
  vec3 safe = mix(rd, vec3(1.0e-6), vec3(lessThan(abs(rd), vec3(1.0e-6))));
  vec3 inv = 1.0 / safe;
  vec3 a = (bmin - ro) * inv;
  vec3 c = (bmax - ro) * inv;
  vec3 lo = min(a, c);
  vec3 hi = max(a, c);
  t0 = max(max(lo.x, lo.y), max(lo.z, 0.0));
  t1 = min(min(hi.x, hi.y), hi.z);
  return t1 > t0;
}
float sdBox3(vec3 p, vec3 b) {
  vec3 q = abs(p) - b;
  return length(max(q, 0.0)) + min(max(q.x, max(q.y, q.z)), 0.0);
}
float sdCylZ(vec3 p, float r, float z0, float z1) {
  float d = length(p.xy) - r;
  float e = abs(p.z - (z0 + z1) * 0.5) - (z1 - z0) * 0.5;
  return min(max(d, e), 0.0) + length(max(vec2(d, e), 0.0));
}
float sdConeZ(vec3 p, float r, float z0, float h) {
  float t = clamp((p.z - z0) / h, 0.0, 1.0);
  float d = (length(p.xy) - r * (1.0 - t)) * (h / length(vec2(h, r)));
  return max(d, max(z0 - p.z, p.z - z0 - h));
}
// Mirrors castleSDF in src/sim/under.js. kind: 1 wall/tower ice, 2 spire ice, 3 snow floor/ramp.
float castleSDF(vec3 w, out float kind) {
  vec3 p = w - CASTLE_C;
  float d = sdBox3(p + vec3(0.0, 0.0, 4.0), vec3(C_HALF, C_HALF, 4.0));
  kind = 3.0;
  float along = p.y - C_HALF;
  float top = -C_RAMP_DROP * clamp(along / C_RAMP_L, 0.0, 1.0);
  float v = max(max(abs(p.x) - (C_GATE_W * 0.5 + 0.6), max(-along - 0.2, along - C_RAMP_L)), max(p.z - top, top - 3.0 - p.z)) * 0.8;
  if (v < d) { d = v; kind = 3.0; }
  float s = abs(p.x) > abs(p.y) ? p.y : p.x;
  float hTop = C_WALL_H + (mod(s + 100.0, 2.0) < 1.0 ? 1.1 : 0.0);
  float outer = sdBox3(p - vec3(0.0, 0.0, (hTop - 10.0) * 0.5), vec3(C_HALF, C_HALF, (hTop + 10.0) * 0.5));
  float inner = sdBox3(p, vec3(C_HALF - C_WALL_T, C_HALF - C_WALL_T, 100.0));
  float wall = max(outer, -inner);
  float arch = C_GATE_H - C_GATE_W * 0.5;
  vec3 g = vec3(p.x, p.y - C_HALF, p.z);
  float cut = min(sdBox3(g - vec3(0.0, 0.0, arch * 0.5), vec3(C_GATE_W * 0.5, C_WALL_T + 1.0, arch * 0.5 + 0.01)),
    max(length(vec2(g.x, g.z - arch)) - C_GATE_W * 0.5, abs(g.y) - C_WALL_T - 1.0));
  wall = max(wall, -cut);
  if (wall < d) { d = wall; kind = 1.0; }
  for (int k = 0; k < 4; k++) {
    vec2 sgn = vec2(k < 2 ? 1.0 : -1.0, (k == 0 || k == 2) ? 1.0 : -1.0);
    vec3 t = vec3(p.xy - sgn * C_HALF, p.z);
    float cy = sdCylZ(t, C_TOWER_R, -10.0, C_TOWER_H);
    if (cy < d) { d = cy; kind = 1.0; }
    float co = sdConeZ(t, C_TOWER_R + 0.5, C_TOWER_H, C_SPIRE_H);
    if (co < d) { d = co; kind = 2.0; }
  }
  vec3 kp = vec3(p.x, p.y + C_HALF * 0.45, p.z);
  float ky = sdCylZ(kp, C_KEEP_R, -10.0, C_KEEP_H);
  if (ky < d) { d = ky; kind = 1.0; }
  float kc = sdConeZ(kp, C_KEEP_R + 0.6, C_KEEP_H, C_KEEP_SPIRE);
  if (kc < d) { d = kc; kind = 2.0; }
  return d;
}
float castleD(vec3 w) {
  float k;
  return castleSDF(w, k);
}
// Mirrors castleAir: the courtyard and the gate passage, cleared of ground.
bool castleAir(vec3 w) {
  vec3 p = w - CASTLE_C;
  if (p.z > 0.0 && abs(p.x) < C_HALF - C_WALL_T && abs(p.y) < C_HALF - C_WALL_T) return true;
  if (p.z > 0.0 && p.z < C_GATE_H && abs(p.x) < C_GATE_W * 0.5 && p.y > 0.0 && p.y < C_HALF + 1.0) return true;
  return false;
}
// Free distance under the special volumes (positive in air): the ground, the castle on it with its
// cleared air, and cave air under it. Vertical gaps stand in for distance; the march caps its step.
float underDist(vec3 q, float d) {
  if (uVolcBox.z <= 0.0) return d;
  if (inBox3(q, CASTLE_MIN, CASTLE_MAX)) {
    float c = castleD(q);
    d = castleAir(q) ? c : min(d, c);
  }
  if (d < 0.0) {
    if (inBox3(q, LAVA_MIN, LAVA_MAX)) {
      vec4 m = tileAt(q.xy, LAVA_BOX, LAVA_U0);
      if (m.g > m.r + 0.02 && q.z > m.r && q.z < m.g) d = min(q.z - m.r, m.g - q.z);
    } else if (inBox3(q, GEM_MIN, GEM_MAX)) {
      vec4 m = tileAt(q.xy, GEM_BOX, GEM_U0);
      if (m.g > m.r + 0.02 && q.z > m.r && q.z < m.g) d = min(q.z - m.r, m.g - q.z);
    }
  }
  return d;
}
bool inUnderBox(vec3 q) {
  return inBox3(q, CASTLE_MIN, CASTLE_MAX) || inBox3(q, LAVA_MIN, LAVA_MAX) || inBox3(q, GEM_MIN, GEM_MAX);
}
vec3 gemColor(float k) {
  if (k < 1.5) return vec3(0.62, 0.28, 0.95);
  if (k < 2.5) return vec3(0.18, 0.92, 0.42);
  if (k < 3.5) return vec3(0.98, 0.12, 0.22);
  if (k < 4.5) return vec3(0.16, 0.36, 1.0);
  return vec3(1.0, 0.42, 0.08);
}
`;
}
