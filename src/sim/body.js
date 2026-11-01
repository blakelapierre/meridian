import { lookDirection } from "./hands.js";
import { shapeHit } from "../engine/cast.js";
import { spanShape } from "./form.js?v=1";
import { wornParts } from "./kit.js?v=1";

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
  const part = { type: "sphere", origin: [x, y, z], at: [x, y, z], radius, color, reflectivity: 0.04, self, body: self ? "self" : "player" };
  if (!extra) return part;
  if (extra.body) part.body = extra.body;
  if (extra.id) {
    part.id = extra.id;
    part.name = extra.name || "";
    part.detail = extra.detail || "";
    part.speech = extra.speech || "";
  }
  if (extra.texture) part.texture = true;
  if (extra.tile) part.tile = extra.tile;
  return part;
}

function world(feet, yaw, lf, lr, z) {
  const fx = Math.sin(yaw);
  const fy = Math.cos(yaw);
  const rx = Math.cos(yaw);
  const ry = -Math.sin(yaw);
  return [feet[0] + fx * lf + rx * lr, feet[1] + fy * lf + ry * lr, feet[2] + z];
}

const BOOT = [0.16, 0.11, 0.08, 1];

// The knee sits forward of the hip-foot line so a step bends instead of stretching.
function bendLeg(hip, foot, yaw, sign, thigh, shin) {
  const max = thigh + shin - 0.015;
  let fx = foot[0];
  let fy = foot[1];
  let fz = foot[2];
  let dx = fx - hip[0];
  let dy = fy - hip[1];
  let dz = fz - hip[2];
  let len = Math.hypot(dx, dy, dz) || 1e-4;
  if (len > max) {
    const horiz = Math.hypot(dx, dy) || 1;
    const room = Math.sqrt(Math.max(0, max * max - dz * dz));
    const scale = Math.min(1, room / horiz);
    fx = hip[0] + dx * scale;
    fy = hip[1] + dy * scale;
    dx = fx - hip[0];
    dy = fy - hip[1];
    dz = fz - hip[2];
    len = Math.hypot(dx, dy, dz) || 1e-4;
  }
  const ux = dx / len;
  const uy = dy / len;
  const uz = dz / len;
  const along = (len * len + thigh * thigh - shin * shin) / (2 * len);
  const height = Math.sqrt(Math.max(0, thigh * thigh - along * along));
  let px = Math.sin(yaw) * 0.8 + Math.cos(yaw) * sign * 0.35;
  let py = Math.cos(yaw) * 0.8 - Math.sin(yaw) * sign * 0.35;
  let pz = 0.2;
  const dot = px * ux + py * uy + pz * uz;
  px -= ux * dot;
  py -= uy * dot;
  pz -= uz * dot;
  const plen = Math.hypot(px, py, pz) || 1;
  return {
    knee: [
      hip[0] + ux * along + (px / plen) * height,
      hip[1] + uy * along + (py / plen) * height,
      hip[2] + uz * along + (pz / plen) * height,
    ],
    foot: [fx, fy, fz],
  };
}

// Capsules for the limbs and trunk, spheres for the head. A stride lifts one foot
// and swings the opposite hand. The crown stays under the third-person look.
export function playerParts(feet, yaw, crouch = false, { self = true, color = CLOTH, body = "", id = "", name = "", detail = "", speech = "", gait = 0, stride = 0, worn = null } = {}) {
  const extra = { self, body: id ? (body || "person") : (body || (self ? "self" : "player")), id, name, detail, speech };
  const travel = Math.min(1, Math.max(0, stride));
  const stepping = travel > 0.12;
  const reach = stepping ? 0.3 * travel : 0.03;
  const hop = stepping ? 0.1 * travel : 0;
  const bob = stepping ? -Math.abs(Math.sin(gait)) * 0.03 * travel : 0;
  const parts = [];
  const addLimb = (kind, a, b, r, tone) => parts.push(spanShape(kind, a, b, r, tone, extra));
  const addSphere = (lf, lr, z, radius, tone, tile = "") => {
    const p = world(feet, yaw, lf, lr, z);
    parts.push(sphere(p[0], p[1], p[2], radius, tone, self, tile ? { ...extra, tile } : extra));
  };
  const side = (sign) => {
    const phase = gait + (sign > 0 ? 0 : Math.PI);
    const s = Math.sin(phase);
    const lift = Math.max(0, Math.cos(phase));
    if (crouch) {
      const hip = world(feet, yaw, 0.04, sign * 0.1, 0.46);
      const knee = world(feet, yaw, 0.2 + sign * s * reach, sign * 0.1, 0.22);
      const foot = world(feet, yaw, 0.3 + sign * s * reach * 1.6, sign * 0.1, 0.045 + lift * hop * 0.45);
      addLimb("capsule", hip, knee, 0.055, color);
      addLimb("capsule", knee, foot, 0.042, BOOT);
      const shoulder = world(feet, yaw, 0.12, sign * 0.16, 0.78);
      const hand = world(feet, yaw, 0.22 - sign * s * reach, sign * 0.22, 0.46);
      addLimb("capsule", shoulder, hand, 0.036, color);
      parts.push(sphere(hand[0], hand[1], hand[2], 0.028, SKIN, self, { ...extra, tile: "skin" }));
    } else {
      const hip = world(feet, yaw, 0.02, sign * 0.09, 0.8 + bob);
      const wanted = world(feet, yaw, s * reach, sign * 0.09, 0.04 + lift * hop);
      const posed = bendLeg(hip, wanted, yaw, sign, 0.42, 0.4);
      addLimb("capsule", hip, posed.knee, 0.058, color);
      addLimb("capsule", posed.knee, posed.foot, 0.042, BOOT);
      const shoulder = world(feet, yaw, 0.03, sign * 0.18, 1.3 + bob);
      const hand = world(feet, yaw, 0.06 - s * reach * 0.75, sign * 0.2, 0.58 + bob);
      addLimb("capsule", shoulder, hand, 0.036, color);
      parts.push(sphere(hand[0], hand[1], hand[2], 0.03, SKIN, self, { ...extra, tile: "skin" }));
    }
  };
  side(1);
  side(-1);
  if (crouch) {
    addLimb("capsule", world(feet, yaw, 0.05, 0, 0.5), world(feet, yaw, 0.14, 0, 0.86), 0.1, color);
    addSphere(0.16, 0, 1.02, 0.084, SKIN, "skin");
    addSphere(0.2, 0.03, 1.04, 0.016, SKIN, "skin");
    addSphere(0.19, 0.032, 1.06, 0.012, EYE);
    addSphere(0.19, -0.032, 1.06, 0.012, EYE);
    addSphere(0.12, 0, 1.1, 0.062, HAIR, "hair");
  } else {
    addLimb("capsule", world(feet, yaw, 0.0, 0, 0.78 + bob), world(feet, yaw, 0.04, 0, 1.32 + bob), 0.11, color);
    addSphere(0.06, 0, 1.52 + bob, 0.098, SKIN, "skin");
    addSphere(0.13, 0.03, 1.54 + bob, 0.016, SKIN, "skin");
    addSphere(0.125, 0.034, 1.57 + bob, 0.013, EYE);
    addSphere(0.125, -0.034, 1.57 + bob, 0.013, EYE);
    addSphere(0.02, 0, 1.6 + bob, 0.078, HAIR, "hair");
  }
  let thigh = false;
  for (const part of parts) {
    if (part.kind === "capsule" && part.r >= 0.09) part.bulk = 4;
    else if (part.type === "sphere" && part.radius >= 0.08) part.bulk = 3;
    else if (!thigh && part.kind === "capsule" && part.r >= 0.05 && part.r < 0.08) {
      part.bulk = 2;
      thigh = true;
    }
    if (part.kind === "capsule" && !part.tile) part.tile = part.r > 0.039 && part.r < 0.05 ? "hide" : "cloth";
  }
  if (worn) for (const piece of wornParts(feet, yaw, crouch, worn, extra)) parts.push(piece);
  return parts;
}

const DUMMY_RED = [0.86, 0.22, 0.18, 1];
const DUMMY_SACK = [0.82, 0.74, 0.58, 1];
const DUMMY_WOOD = [0.4, 0.28, 0.16, 1];

export function dummyParts(at, nowMs = 0) {
  const wood = { body: "dummy", tile: "wood" };
  const wave = Math.sin(nowMs / 650) * 0.16;
  const post = spanShape("cylinder", [at[0], at[1], at[2] + 0.02], [at[0], at[1], at[2] + 0.62], 0.045, DUMMY_WOOD, wood);
  const left = spanShape("cylinder", [at[0], at[1] + 0.12, at[2] + 0.9], [at[0], at[1] + 0.46, at[2] + 0.9 + wave], 0.032, DUMMY_WOOD, wood);
  const right = spanShape("cylinder", [at[0], at[1] - 0.12, at[2] + 0.9], [at[0], at[1] - 0.46, at[2] + 0.9 - wave], 0.032, DUMMY_WOOD, wood);
  const torso = sphere(at[0], at[1], at[2] + 0.92, 0.2, DUMMY_RED, false, { body: "dummy", texture: true });
  const head = sphere(at[0], at[1], at[2] + 1.28, 0.11, DUMMY_SACK, false, { body: "dummy", tile: "hide" });
  const hands = [
    sphere(at[0], at[1] + 0.5, at[2] + 0.9 + wave, 0.04, DUMMY_SACK, false, { body: "dummy", tile: "hide" }),
    sphere(at[0], at[1] - 0.5, at[2] + 0.9 - wave, 0.04, DUMMY_SACK, false, { body: "dummy", tile: "hide" }),
  ];
  return [post, left, right, torso, head, ...hands];
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
    if (part.type === "shape") {
      const hit = shapeHit(origin, dir, part);
      if (hit && hit.t < 12) return false;
      continue;
    }
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
