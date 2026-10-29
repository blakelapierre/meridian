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
