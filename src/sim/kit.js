import { boxShape, spanShape } from "./form.js?v=1";

// What a body is wearing. Paint, cloth, and a plate sit on the figure.
// They do not change armor, spread, integrity, or the pose packet.
// A loft and a tether are not in this list.

const PIECES = {
  cloth: "armor",
  plate: "armor",
  helm: "armor",
  pack: "back",
  long: "primary",
  mallet: "tool",
  hammer: "tool",
  bit: "tool",
};

const METAL = [0.62, 0.64, 0.66, 1];
const WOOD = [0.42, 0.28, 0.14, 1];
const PACK = [0.34, 0.28, 0.18, 1];

export function kitList(worn) {
  if (!worn) return [];
  const raw = Array.isArray(worn) ? worn : typeof worn === "string" ? [worn] : Object.values(worn);
  const out = [];
  for (const id of raw) {
    if (typeof id === "string" && PIECES[id] && !out.includes(id)) out.push(id);
  }
  return out;
}

export function kitRead(worn) {
  const ids = kitList(worn);
  if (ids.includes("pack")) return "pack";
  if (ids.includes("long")) return "long gun";
  if (ids.includes("plate")) return "plate";
  if (ids.includes("helm")) return "helm";
  if (ids.includes("hammer") || ids.includes("mallet")) return "mallet";
  if (ids.includes("bit")) return "bit";
  if (ids.includes("cloth")) return "cloth";
  return "";
}

function world(feet, yaw, lf, lr, z) {
  const fx = Math.sin(yaw);
  const fy = Math.cos(yaw);
  const rx = Math.cos(yaw);
  const ry = -Math.sin(yaw);
  return [feet[0] + fx * lf + rx * lr, feet[1] + fy * lf + ry * lr, feet[2] + z];
}

function put(parts, shape) {
  parts.push(shape);
}

// Extra surfaces on a figure. Cloth itself is a texture on the body, not another shape.
export function wornParts(feet, yaw, crouch, worn, extra = {}) {
  const ids = kitList(worn);
  const parts = [];
  if (!ids.length) return parts;
  const drop = crouch ? 0.42 : 0;
  const meta = { ...extra };
  if (ids.includes("plate")) {
    const center = world(feet, yaw, 0.145, 0, 1.08 - drop);
    put(parts, boxShape(center, [0.09, 0.012, 0.1], METAL, { ...meta, tile: "metal" }));
  }
  if (ids.includes("helm")) {
    const crown = world(feet, yaw, 0.04, 0, 1.66 - drop);
    const brim = world(feet, yaw, 0.02, 0, 1.56 - drop);
    put(parts, spanShape("capsule", brim, crown, 0.09, METAL, { ...meta, tile: "metal" }));
  }
  if (ids.includes("pack")) {
    const center = world(feet, yaw, -0.13, 0, 1.02 - drop);
    put(parts, boxShape(center, [0.05, 0.09, 0.11], PACK, { ...meta, tile: "hide" }));
  }
  if (ids.includes("long")) {
    const low = world(feet, yaw, -0.04, 0.16, 0.72 - drop);
    const high = world(feet, yaw, 0.02, 0.2, 1.38 - drop);
    put(parts, spanShape("cylinder", low, high, 0.018, WOOD, { ...meta, tile: "wood" }));
  }
  if (ids.includes("mallet") || ids.includes("hammer")) {
    const grip = world(feet, yaw, 0.16, 0.24, 0.55 - drop * 0.5);
    const neck = world(feet, yaw, 0.16, 0.24, 0.9 - drop * 0.5);
    put(parts, spanShape("cylinder", grip, neck, 0.016, WOOD, { ...meta, tile: "wood" }));
    const crown = world(feet, yaw, 0.16, 0.24, 0.96 - drop * 0.5);
    if (ids.includes("hammer")) put(parts, boxShape(crown, [0.05, 0.016, 0.026], METAL, { ...meta, tile: "metal" }));
    else put(parts, boxShape(crown, [0.046, 0.036, 0.036], WOOD, { ...meta, tile: "wood" }));
  }
  if (ids.includes("bit")) {
    const grip = world(feet, yaw, 0.22, 0.2, 0.7 - drop * 0.4);
    const tip = world(feet, yaw, 0.4, 0.2, 0.55 - drop * 0.4);
    put(parts, spanShape("cylinder", grip, tip, 0.012, METAL, { ...meta, tile: "metal" }));
  }
  return parts;
}
