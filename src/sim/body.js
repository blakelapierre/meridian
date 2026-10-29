import { lookDirection } from "./hands.js";

export const CHASE = 3.4;
export const SHOULDER = 0;
export const RISE = 0.55;

const CLOTH = [0.2, 0.34, 0.58, 1];
const OTHER = [0.55, 0.42, 0.22, 1];
const SKIN = [0.76, 0.58, 0.44, 1];

export const BODY_COLORS = {
  surveyor: [0.35, 0.55, 0.72, 1],
  miner: [0.72, 0.48, 0.18, 1],
  builder: [0.28, 0.48, 0.32, 1],
  marksman: [0.62, 0.24, 0.22, 1],
};

function sphere(x, y, z, radius, color, self) {
  return { type: "sphere", origin: [x, y, z], radius, color, reflectivity: 0.04, self, body: self ? "self" : "player" };
}

export function playerParts(feet, yaw, crouch = false, { self = true, color = CLOTH } = {}) {
  const height = crouch ? 1.2 : 1.8;
  const forwardX = Math.sin(yaw);
  const forwardY = Math.cos(yaw);
  const lean = 0.12;
  const head = height - 0.16;
  return [
    sphere(feet[0], feet[1], feet[2] + height * 0.32, crouch ? 0.2 : 0.22, color, self),
    sphere(feet[0] + forwardX * lean, feet[1] + forwardY * lean, feet[2] + height * 0.62, crouch ? 0.18 : 0.2, color, self),
    sphere(feet[0] + forwardX * lean, feet[1] + forwardY * lean, feet[2] + head, 0.16, self ? SKIN : color, self),
  ];
}

export function chaseOrigin(feet, yaw, pitch, crouch = false, distance = CHASE) {
  const eye = crouch ? 1.1 : 1.65;
  const dir = lookDirection(yaw, pitch);
  const rightX = Math.cos(yaw);
  const rightY = -Math.sin(yaw);
  return [
    feet[0] - dir[0] * distance + rightX * SHOULDER,
    feet[1] - dir[1] * distance + rightY * SHOULDER,
    feet[2] + eye - dir[2] * distance + RISE,
  ];
}

export function createCameraSpring(origin) {
  return { pos: origin.slice(), vel: [0, 0, 0] };
}

export function stepCamera(spring, ideal, dt) {
  const stiffness = 9;
  const damping = 6.5;
  const step = Math.max(0, Math.min(dt, 0.05));
  for (let i = 0; i < 3; i += 1) {
    const pull = (ideal[i] - spring.pos[i]) * stiffness - spring.vel[i] * damping;
    spring.vel[i] += pull * step;
    spring.pos[i] += spring.vel[i] * step;
  }
  return spring.pos;
}

export function frameCamera(feet, target, distanceHint = CHASE) {
  if (!target) return null;
  const eye = 1.65;
  const chest = [feet[0], feet[1], (feet[2] || 0) + eye * 0.55];
  const dx = target[0] - chest[0];
  const dy = target[1] - chest[1];
  const dz = (target[2] ?? chest[2]) - chest[2];
  const span = Math.hypot(dx, dy, dz);
  if (span < 0.8) return null;
  const mid = [chest[0] + dx * 0.42, chest[1] + dy * 0.42, chest[2] + dz * 0.42];
  const flat = Math.hypot(dx, dy) || 1;
  const sideX = -dy / flat;
  const sideY = dx / flat;
  const half = (70 * Math.PI / 180) / 2 * 0.58;
  const distance = Math.min(22, Math.max(distanceHint, span / (2 * Math.tan(half))));
  const origin = [
    chest[0] - (dx / span) * distance * 0.82 + sideX * distance * 0.42,
    chest[1] - (dy / span) * distance * 0.82 + sideY * distance * 0.42,
    Math.max((feet[2] || 0) + 0.4, chest[2] - (dz / span) * distance * 0.28 + 0.85),
  ];
  const look = [mid[0] - origin[0], mid[1] - origin[1], mid[2] - origin[2]];
  const len = Math.hypot(look[0], look[1], look[2]) || 1;
  return { origin, dir: [look[0] / len, look[1] / len, look[2] / len], distance };
}

export function rayMisses(origin, dir, parts) {
  for (const part of parts) {
    const dx = part.origin[0] - origin[0];
    const dy = part.origin[1] - origin[1];
    const dz = part.origin[2] - origin[2];
    const t = dx * dir[0] + dy * dir[1] + dz * dir[2];
    if (t < 0) continue;
    const dist = Math.hypot(
      part.origin[0] - (origin[0] + dir[0] * t),
      part.origin[1] - (origin[1] + dir[1] * t),
      part.origin[2] - (origin[2] + dir[2] * t),
    );
    if (dist <= part.radius + 0.02) return false;
  }
  return true;
}
