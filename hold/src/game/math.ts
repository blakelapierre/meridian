export type V3 = { x: number; y: number; z: number };

export const FOV = 0.62;

export function forwardYaw(yaw: number): { x: number; z: number } {
  return { x: -Math.sin(yaw), z: -Math.cos(yaw) };
}

export function rightYaw(yaw: number): { x: number; z: number } {
  return { x: Math.cos(yaw), z: -Math.sin(yaw) };
}

/** yaw = 0 looks toward local −north; +yaw turns the nose toward −east (screen-left behind a chase cam). */
export function yawOfDir(x: number, z: number): number {
  return Math.atan2(-x, -z);
}

export function dampAngle(from: number, to: number, maxStep: number): number {
  const d = Math.atan2(Math.sin(to - from), Math.cos(to - from));
  if (Math.abs(d) <= maxStep) return from + d;
  return from + Math.sign(d) * maxStep;
}

export function lookDir(yaw: number, pitch: number): V3 {
  const cp = Math.cos(pitch);
  const sp = Math.sin(pitch);
  return { x: -Math.sin(yaw) * cp, y: sp, z: -Math.cos(yaw) * cp };
}

export function basis(forward: V3): { forward: V3; right: V3; up: V3 } {
  let rx = -forward.z;
  let ry = 0;
  let rz = forward.x;
  let rl = Math.hypot(rx, ry, rz);
  if (rl < 1e-4) {
    rx = 1;
    ry = 0;
    rz = 0;
    rl = 1;
  }
  rx /= rl;
  ry /= rl;
  rz /= rl;
  const ux = ry * forward.z - rz * forward.y;
  const uy = rz * forward.x - rx * forward.z;
  const uz = rx * forward.y - ry * forward.x;
  return { forward, right: { x: rx, y: ry, z: rz }, up: { x: ux, y: uy, z: uz } };
}

export function cross(a: V3, b: V3): V3 {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  };
}

export function dot3(a: V3, b: V3): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

export function vlen(a: V3): number {
  return Math.hypot(a.x, a.y, a.z);
}

export function vscale(a: V3, s: number): V3 {
  return { x: a.x * s, y: a.y * s, z: a.z * s };
}

export function vadd(a: V3, b: V3): V3 {
  return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
}

export function vnorm(a: V3): V3 {
  const l = vlen(a) || 1;
  return vscale(a, 1 / l);
}

/** Tangent east / north. Yaw 0 faces −north, matching `forwardYaw`. */
export function tangentFrame(up: V3): { east: V3; north: V3 } {
  const pole = Math.abs(up.y) > 0.92 ? { x: 1, y: 0, z: 0 } : { x: 0, y: 1, z: 0 };
  let east = cross(pole, up);
  const el = vlen(east);
  if (el < 1e-4) east = { x: 1, y: 0, z: 0 };
  else east = vscale(east, 1 / el);
  const north = vnorm(cross(up, east));
  return { east, north };
}

export function basisUp(forward: V3, upHint: V3): { forward: V3; right: V3; up: V3 } {
  let right = cross(forward, upHint);
  let rl = vlen(right);
  if (rl < 1e-4) {
    right = cross(forward, Math.abs(forward.x) < 0.9 ? { x: 1, y: 0, z: 0 } : { x: 0, y: 0, z: 1 });
    rl = vlen(right) || 1;
  }
  right = vscale(right, 1 / rl);
  const up = vnorm(cross(right, forward));
  return { forward, right, up };
}

export function approach(v: number, target: number, delta: number): number {
  if (v < target) return Math.min(target, v + delta);
  return Math.max(target, v - delta);
}

export function clamp(v: number, a: number, b: number): number {
  return Math.max(a, Math.min(b, v));
}

export function radialDeadzone(x: number, y: number, dz = 0.18): { x: number; y: number } {
  const m = Math.hypot(x, y);
  if (m < dz || m < 1e-6) return { x: 0, y: 0 };
  const scale = (m - dz) / (1 - dz) / m;
  return { x: x * scale, y: y * scale };
}
