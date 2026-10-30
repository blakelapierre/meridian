import { lookDirection } from "./hands.js";

export const GEO_COLOR = {
  sand: [194, 165, 106, 255],
  grass: [72, 132, 54, 255],
  rock: [142, 136, 124, 255],
  pit: [61, 92, 114, 255],
  wood: [122, 78, 42, 255],
  stone: [150, 148, 138, 255],
  sea: [36, 92, 128, 255],
};

function skillValue(skills, name) {
  const value = skills?.[name];
  return typeof value === "number" ? value : value?.value || 0;
}

export function createPlate(size = 512, meters = 256, origin = [0, -80]) {
  return {
    size,
    meters,
    origin,
    data: new Uint8ClampedArray(size * size * 4),
    dirty: false,
  };
}

export function toldTint(color) {
  return [
    Math.round(color[0] * 0.55 + 40),
    Math.round(color[1] * 0.55 + 70),
    Math.round(color[2] * 0.55 + 90),
    color[3] ?? 255,
  ];
}

export function worldToPixel(plate, x, y) {
  const mpp = plate.meters / plate.size;
  const left = plate.origin[0] - plate.meters / 2;
  const top = plate.origin[1] + plate.meters / 2;
  return [(x - left) / mpp, (top - y) / mpp];
}

export function stamp(plate, x, y, color, meters = 1.6) {
  const mpp = plate.meters / plate.size;
  const [cx, cy] = worldToPixel(plate, x, y);
  const rad = Math.max(1, meters / mpp / 2);
  const x0 = Math.max(0, Math.floor(cx - rad));
  const y0 = Math.max(0, Math.floor(cy - rad));
  const x1 = Math.min(plate.size - 1, Math.ceil(cx + rad));
  const y1 = Math.min(plate.size - 1, Math.ceil(cy + rad));
  const rad2 = rad * rad;
  for (let py = y0; py <= y1; py += 1) {
    for (let px = x0; px <= x1; px += 1) {
      const dx = px + 0.5 - cx;
      const dy = py + 0.5 - cy;
      if (dx * dx + dy * dy > rad2) continue;
      const i = (py * plate.size + px) * 4;
      plate.data[i] = color[0];
      plate.data[i + 1] = color[1];
      plate.data[i + 2] = color[2];
      plate.data[i + 3] = color[3] ?? 255;
    }
  }
  plate.dirty = true;
}

export function samplePlate(plate, x, y) {
  const [px, py] = worldToPixel(plate, x, y);
  const ix = Math.floor(px);
  const iy = Math.floor(py);
  if (ix < 0 || iy < 0 || ix >= plate.size || iy >= plate.size) return [0, 0, 0, 0];
  const i = (iy * plate.size + ix) * 4;
  return [plate.data[i], plate.data[i + 1], plate.data[i + 2], plate.data[i + 3]];
}

export function revealRange(skills = {}) {
  return 8 + skillValue(skills, "mapping") / 140 * 28 + skillValue(skills, "eyesight") / 140 * 16;
}

export function revealHalfFov(skills = {}) {
  return 0.22 + skillValue(skills, "mapping") / 140 * 0.7;
}

export function revealCount(skills = {}) {
  return 5 + Math.round(skillValue(skills, "mapping") / 140 * 16);
}

function yawTurn(forward, turn) {
  const c = Math.cos(turn);
  const s = Math.sin(turn);
  return [
    forward[0] * c + forward[1] * s,
    forward[1] * c - forward[0] * s,
    forward[2],
  ];
}

export function hitGround(origin, dir, heightAt = () => 0, maxDist = 48) {
  const len = Math.hypot(dir?.[0] || 0, dir?.[1] || 0, dir?.[2] || 0);
  if (!origin || !(len > 0) || !(maxDist > 0)) return null;
  const dx = dir[0] / len;
  const dy = dir[1] / len;
  const dz = dir[2] / len;
  const ground = (x, y) => {
    const h = heightAt(x, y);
    return Number.isFinite(h) ? h : 0;
  };
  const aboveAt = (t) => origin[2] + dz * t - ground(origin[0] + dx * t, origin[1] + dy * t);
  let lo = 0;
  let hi = 0;
  let found = false;
  const steps = 48;
  for (let i = 1; i <= steps; i += 1) {
    const t = (maxDist * i) / steps;
    if (aboveAt(t) <= 0.02) {
      hi = t;
      lo = (maxDist * (i - 1)) / steps;
      found = true;
      break;
    }
  }
  if (!found) return null;
  for (let i = 0; i < 12; i += 1) {
    const mid = (lo + hi) * 0.5;
    if (aboveAt(mid) > 0) lo = mid;
    else hi = mid;
  }
  return {
    x: origin[0] + dx * hi,
    y: origin[1] + dy * hi,
  };
}

export function revealLook({ x, y, yaw = 0, pitch = 0, skills = {}, origin = null, dir = null, heightAt = () => 0 }) {
  const range = revealRange(skills);
  const half = revealHalfFov(skills);
  const count = revealCount(skills);
  const points = [{ x, y }];
  const eye = origin || [x, y, 1.65];
  const forward = dir || lookDirection(yaw, pitch);
  for (let i = 0; i < count; i += 1) {
    const turn = count === 1 ? 0 : (i / (count - 1) - 0.5) * 2 * half;
    const ray = Math.abs(turn) < 1e-6 ? forward : yawTurn(forward, turn);
    const hit = hitGround(eye, ray, heightAt, range);
    if (hit) points.push(hit);
  }
  return points;
}

export function mapSpan(skill = 0, zoom = 1) {
  const trained = Math.max(0, Math.min(140, skill));
  const level = Math.max(0.25, Math.min(8, zoom || 1));
  return (16 + (trained / 140) * 64) * 2 / level;
}

export function dragCenter(center, dxPx, dyPx, span, size) {
  const scale = span / size;
  return [center[0] - dxPx * scale, center[1] + dyPx * scale];
}

export function plateViewRect(plate, center, span, size) {
  const left = plate.origin[0] - plate.meters / 2;
  const north = plate.origin[1] + plate.meters / 2;
  const nw = placeOnView(center, [left, north], span, size);
  const scale = span > 0 ? (plate.meters / span) * size : 0;
  return { x: nw.x, y: nw.y, size: scale };
}

export function placeOnView(center, point, span, size) {
  const x = size / 2 + (point[0] - center[0]) / span * size;
  const y = size / 2 - (point[1] - center[1]) / span * size;
  return { x, y, inside: x >= 2 && y >= 2 && x < size - 2 && y < size - 2 };
}
