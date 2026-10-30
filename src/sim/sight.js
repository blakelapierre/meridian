import { worldToScreen } from "../engine/cast.js";

export const CLOSE = 1.2;
export const FAR = 12;
export const BASE_FOV = 70;
export const OPTICS = ["none", "glasses", "binoculars", "telescope"];
export const OPTIC = {
  none: { zoom: 1, range: 1 },
  glasses: { zoom: 1.25, range: 1.15 },
  binoculars: { zoom: 4, range: 2.5 },
  telescope: { zoom: 8, range: 4 },
};

export function relaxOrbit(yaw, pitch, dt, holding) {
  if (holding) return { yaw, pitch };
  const keep = Math.exp(-Math.max(0, dt) * 9);
  let nextYaw = yaw * keep;
  let nextPitch = pitch * keep;
  if (Math.abs(nextYaw) < 0.002) nextYaw = 0;
  if (Math.abs(nextPitch) < 0.002) nextPitch = 0;
  return { yaw: nextYaw, pitch: nextPitch };
}

export function maxZoom(skill, optic = "none") {
  const trained = 1 + Math.max(0, Math.min(140, skill)) / 140;
  return trained * (OPTIC[optic]?.zoom ?? 1);
}

export function zoomFov(level, skill, optic = "none") {
  const mag = 1 + (maxZoom(skill, optic) - 1) * Math.max(0, Math.min(1, level));
  return BASE_FOV / mag;
}

export function smoothstep(t) {
  const x = Math.max(0, Math.min(1, t));
  return x * x * (3 - 2 * x);
}

export function blendOrigin(third, eyes, blend) {
  const t = smoothstep(blend);
  return third.map((value, index) => value + (eyes[index] - value) * t);
}

export function blendDir(thirdDir, eyeDir, blend) {
  const t = smoothstep(blend);
  const mixed = thirdDir.map((value, index) => value + (eyeDir[index] - value) * t);
  const length = Math.hypot(mixed[0], mixed[1], mixed[2]) || 1;
  return mixed.map((value) => value / length);
}

export function stepZoom(state, direction, skill, optic = "none") {
  const next = { blend: 0, ...state };
  if (direction < 0) {
    if (next.distance > CLOSE) {
      next.distance = Math.max(CLOSE, next.distance - 0.45);
      return next;
    }
    if (next.blend < 1) {
      next.blend = Math.min(1, next.blend + 0.25);
      next.first = next.blend >= 1;
      return next;
    }
    if (maxZoom(skill, optic) <= 1.001) return next;
    next.level = Math.min(1, next.level + 0.15);
    next.first = true;
    return next;
  }
  if (next.level > 0) {
    next.level = Math.max(0, next.level - 0.15);
    return next;
  }
  if (next.blend > 0 && !next.forced) {
    next.blend = Math.max(0, next.blend - 0.25);
    next.first = next.blend >= 1;
    return next;
  }
  if (next.forced && next.first) return next;
  next.distance = Math.min(FAR, next.distance + 0.45);
  return next;
}

export function stepFollow(state, direction) {
  const sign = direction < 0 ? -1 : 1;
  const distance = Math.min(FAR, Math.max(CLOSE, (state.distance ?? 3.4) + sign * 0.7));
  const height = Math.min(5, Math.max(-0.35, (state.height ?? 0) + sign * 0.35));
  return { distance, height };
}

export function easeFollow(current, target, dt) {
  const k = 1 - Math.exp(-Math.max(0, dt) * 5);
  return {
    distance: current.distance + ((target.distance ?? current.distance) - current.distance) * k,
    height: current.height + ((target.height ?? current.height) - current.height) * k,
  };
}

export function rangeRead(distance, skill, optic = "none") {
  if (distance == null || !Number.isFinite(distance)) return null;
  const trained = Math.max(0, Math.min(140, skill));
  const tool = OPTIC[optic]?.range ?? 1;
  const reach = (25 + trained) * tool;
  if (distance > reach) return { text: "too far", meters: null };
  const step = Math.max(0.1, 10 / ((1 + trained / 15) * tool));
  const shown = Math.round(distance / step) * step;
  const digits = step < 1 ? 1 : 0;
  const text = trained < 8 && optic === "none" ? `about ${Math.round(shown)} m` : `${shown.toFixed(digits)} m`;
  return { text, meters: shown };
}

function trained(value) {
  return Math.max(0, Math.min(140, Number(value) || 0)) / 140;
}

// gamma 1 is a flat picture. Lower packs buffer pixels toward the gaze.
// Matches gazeAxis / gazeUnaxis in src/render/gpu.js.
export function gazePlan(eyesight = 0, focus = 0, closeMeters = 18) {
  const eye = trained(eyesight);
  const aim = trained(focus);
  const gamma = Math.min(0.94, Math.max(0.58, 0.86 - aim * 0.22 + eye * 0.04));
  const reach = closeMeters + eye * 42 + aim * 10;
  const spread = Math.min(0.48, Math.max(0.12, 0.22 + eye * 0.2 - aim * 0.1));
  return { gamma, reach, spread };
}

export function gazeAxis(b, c, gamma) {
  const g = Math.max(0.35, Math.min(1, Number(gamma) || 1));
  if (g > 0.98) return b;
  const d = b - c;
  const side = d < 0 ? c : 1 - c;
  if (side < 1e-4) return b;
  const u = d / side;
  const mag = Math.abs(u) ** (1 / g);
  return c + Math.sign(d) * mag * side;
}

export function gazeUnaxis(s, c, gamma) {
  const g = Math.max(0.35, Math.min(1, Number(gamma) || 1));
  if (g > 0.98) return s;
  const d = s - c;
  const side = d < 0 ? c : 1 - c;
  if (side < 1e-4) return s;
  const u = d / side;
  const mag = Math.abs(u) ** g;
  return c + Math.sign(d) * mag * side;
}

export function gazeOnScreen(camera, eye, look) {
  let t = 24;
  if (look && look[2] < -0.04) {
    const ground = -(eye?.[2] || 0) / look[2];
    if (ground > 0.5 && ground < 80) t = ground;
  }
  const point = [
    (eye?.[0] || 0) + (look?.[0] || 0) * t,
    (eye?.[1] || 0) + (look?.[1] || 0) * t,
    (eye?.[2] || 0) + (look?.[2] || 0) * t,
  ];
  const screen = worldToScreen(point, camera);
  if (!screen || !Number.isFinite(screen.x) || !Number.isFinite(screen.y)) return [0.5, 0.5];
  return [
    Math.min(0.92, Math.max(0.08, screen.x)),
    Math.min(0.92, Math.max(0.08, screen.y)),
  ];
}

export function gazeFor(camera, eye, look, eyesight, focus, closeMeters = 18) {
  const plan = gazePlan(eyesight, focus, closeMeters);
  const at = gazeOnScreen(camera, eye, look);
  return { ...plan, x: at[0], y: at[1] };
}

export function sightPractice({ down = false, eyes = false, zoom = 0, aimed = false, still = false } = {}) {
  if (down) return { eyesight: false, focus: false };
  return {
    eyesight: true,
    focus: zoom > 0.05 || aimed || (eyes && still),
  };
}

