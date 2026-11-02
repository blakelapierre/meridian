// The cloud deck the fin reads: the same noise, heights and drift as the sky's cloudShade in
// src/render/gpu.js, sampled along the sun ray from the fin, on sim time (tick / 30 s) so every peer
// agrees. Returns shade 0..0.8; the fin loses that share of its flux.
import { sunDirection } from "./sun.js";

const fract = (v) => v - Math.floor(v);
const hash21 = (x, y) => fract(Math.sin(x * 127.1 + y * 311.7) * 43758.5453);
function valueNoise(x, y) {
  const ix = Math.floor(x), iy = Math.floor(y);
  const fx = x - ix, fy = y - iy;
  const ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy);
  const a = hash21(ix, iy), b = hash21(ix + 1, iy), c = hash21(ix, iy + 1), d = hash21(ix + 1, iy + 1);
  const ab = a + (b - a) * ux, cd = c + (d - c) * ux;
  return ab + (cd - ab) * uy;
}
const smooth = (e0, e1, v) => { const t = Math.min(1, Math.max(0, (v - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };

export function cloudShade(origin, dir, seconds) {
  const [ox, oy, oz] = origin;
  const [dx, dy, dz] = dir;
  if (dz <= 0.02) return 0;
  const t0 = Math.min(2400, Math.max(0, (34 - oz) / dz));
  const t1 = Math.min(2400, Math.max(0, (62 - oz) / dz));
  const span = Math.max(t1 - t0, 0);
  if (span < 1) return 0;
  let sum = 0;
  for (let i = 0; i < 5; i += 1) {
    const t = t0 + span * ((i + 0.5) / 5);
    const qx = ox + dx * t, qy = oy + dy * t, qz = oz + dz * t;
    const n = valueNoise(qx * 0.018 + seconds * 0.004, qy * 0.018 + 0.2);
    sum += smooth(0.5, 0.78, n) * smooth(34, 42, qz) * smooth(62, 50, qz);
  }
  return Math.min(0.8, Math.max(0, sum * 0.22));
}

export function finCloud(at, tick) {
  const sun = sunDirection(tick);
  const len = Math.hypot(sun[0], sun[1], sun[2]) || 1;
  return cloudShade([at?.[0] || 0, at?.[1] || 0, 1], [sun[0] / len, sun[1] / len, sun[2] / len], tick / 30);
}

// How hard it rains where you stand: 0 under a thin deck, rising to 1 as the deck overhead thickens
// past the pool rain line (0.35 shade).
export function rainAt(x, y, tick) {
  const shade = cloudShade([x || 0, y || 0, 0], [0, 0, 1], tick / 30);
  return Math.min(1, Math.max(0, (shade - 0.3) / 0.2));
}

// The deck drifts toward +x at this many metres per second (shader: uTime * 0.004 over a 0.018 scale).
export const DECK_DRIFT = 0.004 / 0.018;
// How wet the ground is: rain now, or rain that fell 30 s (×0.65) or 90 s (×0.3) ago and is drying.
// Mirrors wetAt in src/render/gpu.js.
export function wetAt(x, y, tick) {
  const now = rainAt(x, y, tick);
  if (now >= 1) return now;
  return Math.max(now, rainAt(x, y, tick - 900) * 0.65, rainAt(x, y, tick - 2700) * 0.3);
}

// The status word for rain where you stand: nothing when dry, "drizzle" or "rain" as it thickens.
export function rainWord(rain) {
  if (!(rain > 0.05)) return "";
  return rain < 0.5 ? " drizzle" : " rain";
}

// Steps splash once the ground is properly wet.
export const SPLASH_WET = 0.3;
export function splashes(wet) {
  return wet >= SPLASH_WET;
}
