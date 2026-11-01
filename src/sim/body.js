import { lookDirection } from "./hands.js";

export const CHASE = 3.4;
export const SHOULDER = 0;
export const RISE = 0.55;

const CLOTH = [0.2, 0.34, 0.58, 1];
const SKIN = [0.76, 0.58, 0.44, 1];
const HAIR = [0.16, 0.1, 0.07, 1];
const EYE = [0.08, 0.07, 0.06, 1];

export const BODY_COLORS = {
  surveyor: [0.35, 0.55, 0.72, 1],
  miner: [0.72, 0.48, 0.18, 1],
  builder: [0.28, 0.48, 0.32, 1],
  marksman: [0.62, 0.24, 0.22, 1],
};

function sphere(x, y, z, radius, color, self, extra = null) {
  const part = { type: "sphere", origin: [x, y, z], radius, color, reflectivity: 0.04, self, body: self ? "self" : "player" };
  if (!extra) return part;
  if (extra.body) part.body = extra.body;
  if (extra.id) {
    part.id = extra.id;
    part.name = extra.name || "";
    part.detail = extra.detail || "";
    part.speech = extra.speech || "";
  }
  if (extra.texture) part.texture = true;
  return part;
}

// A standing or crouched figure. Cloth is the passed color. Head, hands, and feet are skin.
// The crown stays under the third-person look so the crosshair still clears the body.
const STAND = [
  [0.04, 0.09, 0.05, 0.055, "skin"],
  [0.04, -0.09, 0.05, 0.055, "skin"],
  [0.01, 0.08, 0.26, 0.05, "cloth"],
  [0.01, -0.08, 0.26, 0.05, "cloth"],
  [0, 0.085, 0.48, 0.06, "cloth"],
  [0, -0.085, 0.48, 0.06, "cloth"],
  [0.02, 0.09, 0.7, 0.07, "cloth"],
  [0.02, -0.09, 0.7, 0.07, "cloth"],
  [0.02, 0, 0.86, 0.11, "cloth"],
  [0.03, 0, 1.05, 0.12, "cloth"],
  [0.04, 0, 1.24, 0.115, "cloth"],
  [0.05, 0.16, 1.3, 0.055, "cloth"],
  [0.05, -0.16, 1.3, 0.055, "cloth"],
  [0.06, 0.2, 1.08, 0.045, "cloth"],
  [0.06, -0.2, 1.08, 0.045, "cloth"],
  [0.07, 0.22, 0.88, 0.038, "cloth"],
  [0.07, -0.22, 0.88, 0.038, "cloth"],
  [0.08, 0.23, 0.7, 0.032, "skin"],
  [0.08, -0.23, 0.7, 0.032, "skin"],
  [0.05, 0, 1.4, 0.042, "skin"],
  [0.06, 0, 1.54, 0.1, "skin"],
  [0.14, 0.03, 1.55, 0.018, "skin"],
  [0.13, 0.035, 1.58, 0.014, "eye"],
  [0.13, -0.035, 1.58, 0.014, "eye"],
  [0.02, 0, 1.62, 0.085, "hair"],
];

const CROUCH = [
  [0.08, 0.1, 0.045, 0.05, "skin"],
  [0.08, -0.1, 0.045, 0.05, "skin"],
  [0.2, 0.09, 0.18, 0.048, "cloth"],
  [0.2, -0.09, 0.18, 0.048, "cloth"],
  [0.06, 0.1, 0.32, 0.055, "cloth"],
  [0.06, -0.1, 0.32, 0.055, "cloth"],
  [0.04, 0, 0.46, 0.1, "cloth"],
  [0.08, 0, 0.62, 0.105, "cloth"],
  [0.1, 0, 0.78, 0.1, "cloth"],
  [0.1, 0.15, 0.8, 0.045, "cloth"],
  [0.1, -0.15, 0.8, 0.045, "cloth"],
  [0.14, 0.2, 0.64, 0.038, "cloth"],
  [0.14, -0.2, 0.64, 0.038, "cloth"],
  [0.16, 0.22, 0.5, 0.03, "skin"],
  [0.16, -0.22, 0.5, 0.03, "skin"],
  [0.12, 0, 0.92, 0.038, "skin"],
  [0.14, 0, 1.04, 0.085, "skin"],
  [0.2, 0.03, 1.05, 0.016, "skin"],
  [0.18, 0.03, 1.07, 0.012, "eye"],
  [0.18, -0.03, 1.07, 0.012, "eye"],
  [0.1, 0, 1.1, 0.07, "hair"],
];

export function playerParts(feet, yaw, crouch = false, { self = true, color = CLOTH, body = "", id = "", name = "", detail = "", speech = "" } = {}) {
  const forwardX = Math.sin(yaw);
  const forwardY = Math.cos(yaw);
  const rightX = Math.cos(yaw);
  const rightY = -Math.sin(yaw);
  const extra = id ? { body: body || "person", id, name, detail, speech } : null;
  const tone = { cloth: color, skin: SKIN, hair: HAIR, eye: EYE };
  return (crouch ? CROUCH : STAND).map(([lf, lr, z, radius, slot]) => sphere(
    feet[0] + forwardX * lf + rightX * lr,
    feet[1] + forwardY * lf + rightY * lr,
    feet[2] + z,
    radius,
    tone[slot],
    self,
    extra,
  ));
}

// The practice target. Arms out, sack head, ringed torso. Head stays above the chest line.
const DUMMY_RED = [0.86, 0.22, 0.18, 1];
const DUMMY_SACK = [0.82, 0.74, 0.58, 1];
const DUMMY_WOOD = [0.4, 0.28, 0.16, 1];

export function dummyParts(at) {
  const yaw = 0;
  const layout = [
    [0, 0, 0.16, 0.06, DUMMY_WOOD, false],
    [0, 0, 0.42, 0.05, DUMMY_WOOD, false],
    [0, 0, 0.7, 0.16, DUMMY_RED, false],
    [0, 0, 0.92, 0.2, DUMMY_RED, true],
    [0, 0.34, 0.9, 0.045, DUMMY_WOOD, false],
    [0, -0.34, 0.9, 0.045, DUMMY_WOOD, false],
    [0, 0.5, 0.9, 0.035, DUMMY_SACK, false],
    [0, -0.5, 0.9, 0.035, DUMMY_SACK, false],
    [0, 0, 1.16, 0.05, DUMMY_WOOD, false],
    [0, 0, 1.32, 0.11, DUMMY_SACK, false],
  ];
  const forwardX = Math.sin(yaw);
  const forwardY = Math.cos(yaw);
  const rightX = Math.cos(yaw);
  const rightY = -Math.sin(yaw);
  return layout.map(([lf, lr, z, radius, color, texture]) => {
    const part = sphere(
      at[0] + forwardX * lf + rightX * lr,
      at[1] + forwardY * lf + rightY * lr,
      at[2] + z,
      radius,
      color,
      false,
    );
    part.body = "dummy";
    if (texture) part.texture = true;
    return part;
  });
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

export function liftCamera(point, floor, clearance = 0.45) {
  const z = floor + clearance;
  if (point[2] < z) point[2] = z;
  return point;
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

function wrapAngle(delta) {
  let turn = delta;
  while (turn > Math.PI) turn -= Math.PI * 2;
  while (turn < -Math.PI) turn += Math.PI * 2;
  return turn;
}

function seekAngle(current, target, vel, dt) {
  const stiffness = 14;
  const damping = 8;
  const step = Math.max(0, Math.min(dt, 0.05));
  const pull = wrapAngle(target - current) * stiffness - vel * damping;
  const nextVel = vel + pull * step;
  return { value: current + nextVel * step, vel: nextVel };
}

export function stepLook(spring, ideal, dt) {
  const flat = Math.hypot(ideal[0], ideal[1]);
  const targetYaw = Math.atan2(ideal[0], ideal[1]);
  const targetPitch = Math.atan2(ideal[2], flat || 1);
  if (spring.lookYaw === undefined) {
    spring.lookYaw = targetYaw;
    spring.lookPitch = targetPitch;
    spring.yawVel = 0;
    spring.pitchVel = 0;
  } else {
    const yaw = seekAngle(spring.lookYaw, targetYaw, spring.yawVel, dt);
    const pitch = seekAngle(spring.lookPitch, targetPitch, spring.pitchVel, dt);
    spring.lookYaw = yaw.value;
    spring.yawVel = yaw.vel;
    spring.lookPitch = pitch.value;
    spring.pitchVel = pitch.vel;
  }
  const level = Math.cos(spring.lookPitch);
  spring.look = [
    Math.sin(spring.lookYaw) * level,
    Math.cos(spring.lookYaw) * level,
    Math.sin(spring.lookPitch),
  ];
  return spring.look.slice();
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
