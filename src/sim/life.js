import { spanShape, triShape } from "./form.js?v=1";

export const HILL = 5.4;

export function duneHeight(x, y) {
  const roll = 0.5 * Math.sin(x * 0.15) + 0.5 * Math.cos(y * 0.13);
  const wash = 0.5 * Math.sin((x + y) * 0.17 + 1.3) + 0.5;
  const n = Math.max(0, Math.min(1, 0.55 * roll + 0.45 * wash));
  return n * n * HILL;
}

export function graze(patch) {
  const stock = Math.max(0, (patch?.stock || 0) - 1);
  return { stock, track: (patch?.stock || 0) > 0, dead: stock <= 0 };
}

// A grazed patch is an animal the world picture can draw. It does not walk.
export function grazeAnimal(patch, at = [12, -150, 0]) {
  if (!patch?.track && !patch?.dead) return null;
  return {
    kind: "graze",
    at: [at[0], at[1], (at[2] || 0) + 0.2],
    radius: 0.3,
    color: [0.45, 0.32, 0.18, 1],
  };
}

// A herd is several of the same animal. They do not walk.
export function herd(patch, at = [12, -150, 0], count = 3, parts = true, nowMs = 0) {
  const one = grazeAnimal(patch, at);
  if (!one) return [];
  const animals = [];
  const ground = at[2] || 0;
  for (let i = 0; i < count; i += 1) {
    const foot = [one.at[0] + (i - (count - 1) / 2) * 1.05, one.at[1] + (i - 1) * 0.2, ground];
    const yaw = 0.15 + i * 0.5;
    animals.push({
      ...one,
      at: foot,
      herd: count,
      ...(parts ? { parts: goatParts(foot, yaw, Boolean(patch?.dead), nowMs) } : {}),
    });
  }
  return animals;
}

export function standHeight(x, y, dug = 0) {
  if (dug < -0.01) return dug;
  return duneHeight(x, y);
}

function smoothstep(edge0, edge1, value) {
  const t = Math.max(0, Math.min(1, (value - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

export function groundLook(x, y) {
  const h = duneHeight(x, y);
  const e = 0.75;
  const nx = h - duneHeight(x + e, y);
  const ny = h - duneHeight(x, y + e);
  const nz = e;
  const slope = 1 - Math.max(0, Math.min(1, nz / Math.hypot(nx, ny, nz)));
  const crest = Math.max(0, Math.min(1, h / HILL));
  const rockW = Math.max(0, Math.min(1, smoothstep(0.2, 0.5, slope) + smoothstep(0.62, 0.92, crest) * 0.8));
  let grassW = (1 - rockW) * smoothstep(0.1, 0.34, crest) * (1 - smoothstep(0.58, 0.86, crest));
  grassW *= 1 - smoothstep(0.16, 0.46, slope);
  const sand = [196, 168, 112];
  const grass = [72, 132, 54];
  const rock = [142, 136, 124];
  const mix = (a, b, t) => a.map((channel, i) => Math.round(channel + (b[i] - channel) * t));
  const mixed = mix(mix(sand, grass, grassW), rock, rockW);
  const lift = 0.78 + crest * 0.34;
  const color = [...mixed.map((channel) => Math.min(255, Math.round(channel * lift))), 255];
  const kind = rockW > 0.45 ? "rock" : grassW > 0.35 ? "grass" : "sand";
  return { kind, color, crest, grassW, rockW };
}

function shy(at, from, sense, push) {
  if (!from) return at;
  let dx = at[0] - from[0];
  let dy = at[1] - from[1];
  let dist = Math.hypot(dx, dy);
  if (dist > sense) return at;
  if (dist < 0.05) {
    dx = 1;
    dy = 0;
    dist = 1;
  }
  const step = ((sense - dist) / sense) * push;
  return [at[0] + (dx / dist) * step, at[1] + (dy / dist) * step];
}

function world(at, yaw, lf, lr, up) {
  const fx = Math.sin(yaw);
  const fy = Math.cos(yaw);
  const rx = Math.cos(yaw);
  const ry = -Math.sin(yaw);
  return [at[0] + fx * lf + rx * lr, at[1] + fy * lf + ry * lr, at[2] + up];
}

function orient(parts, at, yaw, lf, lr, up, radius, color, tile = "") {
  const p = world(at, yaw, lf, lr, up);
  const part = { at: p, origin: p, radius, color };
  if (tile) part.tile = tile;
  parts.push(part);
}

function limb(parts, at, yaw, a, b, r, color, kind = "capsule", tile = "hide") {
  parts.push(spanShape(kind, world(at, yaw, a[0], a[1], a[2]), world(at, yaw, b[0], b[1], b[2]), r, color, { tile }));
}

const SHELL = [0.62, 0.28, 0.16, 1];
const CLAW = [0.78, 0.42, 0.24, 1];
const LEG = [0.4, 0.18, 0.1, 1];
const SCALE = [0.42, 0.5, 0.2, 1];
const SCALE_DARK = [0.24, 0.32, 0.12, 1];
const GOAT = [0.48, 0.34, 0.2, 1];
const GOAT_DARK = [0.28, 0.18, 0.1, 1];
const HORN = [0.55, 0.48, 0.32, 1];

export function crabParts(at, yaw = 0, nowMs = 0) {
  const parts = [];
  const add = (lf, lr, up, radius, color, tile = "") => orient(parts, at, yaw, lf, lr, up, radius, color, tile);
  const pinch = 0.5 + Math.sin(nowMs / 280) * 0.5;
  const gap = 0.015 + pinch * 0.07;
  add(0, 0, 0.06, 0.11, SHELL, "horn");
  add(-0.06, 0, 0.05, 0.08, SHELL, "horn");
  add(0.05, 0, 0.07, 0.07, [0.72, 0.36, 0.2, 1], "horn");
  add(0.1, 0.02, 0.1, 0.02, EYE);
  add(0.1, -0.02, 0.1, 0.02, EYE);
  for (const side of [1, -1]) {
    limb(parts, at, yaw, [0.1, side * 0.1, 0.07], [0.2, side * 0.16, 0.07 + gap], 0.022, CLAW, "capsule", "horn");
    limb(parts, at, yaw, [0.1, side * 0.1, 0.055], [0.2, side * 0.15, 0.05 - gap * 0.35], 0.02, CLAW, "capsule", "horn");
    for (let i = 0; i < 3; i += 1) {
      const phase = nowMs / 160 + i * 1.4 + (side > 0 ? 0 : Math.PI);
      const step = Math.sin(phase) * 0.028;
      const lift = Math.max(0, Math.cos(phase)) * 0.028;
      const back = -0.02 - i * 0.05;
      limb(parts, at, yaw, [back * 0.3, side * 0.07, 0.045], [back + step, side * 0.18, 0.012 + lift], 0.011, LEG);
    }
  }
  return parts;
}

export function skinkParts(at, yaw = 0, nowMs = 0) {
  const parts = [];
  const add = (lf, lr, up, radius, color, tile = "scale") => orient(parts, at, yaw, lf, lr, up, radius, color, tile);
  const wave = Math.sin(nowMs / 170);
  limb(parts, at, yaw, [0.16, 0, 0.055], [-0.06, 0, 0.05], 0.032, SCALE, "capsule", "scale");
  limb(parts, at, yaw, [-0.06, 0, 0.05], [-0.2, wave * 0.03, 0.042], 0.022, SCALE, "capsule", "scale");
  limb(parts, at, yaw, [-0.2, wave * 0.03, 0.042], [-0.36, wave * 0.09, 0.03], 0.014, SCALE_DARK, "capsule", "scale");
  add(0.2, 0, 0.075, 0.028, SCALE);
  add(0.1, 0.02, 0.085, 0.01, EYE, "");
  add(0.1, -0.02, 0.085, 0.01, EYE, "");
  for (const side of [1, -1]) {
    add(0.06, side * 0.05, 0.03, 0.014, SCALE_DARK);
    add(-0.02, side * 0.05, 0.03, 0.014, SCALE_DARK);
  }
  return parts;
}

export function goatParts(at, yaw = 0, dead = false, nowMs = 0) {
  const parts = [];
  const hide = dead ? [0.3, 0.24, 0.18, 1] : GOAT;
  const z = (up) => (dead ? up * 0.45 : up);
  const breathe = dead ? 0 : Math.sin(nowMs / 520) * 0.012;
  const add = (lf, lr, up, radius, color, tile = "hide") => orient(parts, at, yaw, lf, lr, z(up), radius, color, tile);
  for (const side of [1, -1]) {
    limb(parts, at, yaw, [0.12, side * 0.07, z(0.34)], [0.14, side * 0.08, z(0.03)], 0.03, hide);
    limb(parts, at, yaw, [-0.12, side * 0.07, z(0.34)], [-0.14, side * 0.08, z(0.03)], 0.03, hide);
  }
  limb(parts, at, yaw, [0.12, 0, z(0.4 + breathe)], [-0.16, 0, z(0.38 + breathe)], 0.09, hide);
  add(0.2, 0, 0.52, 0.04, hide);
  add(0.28, 0, 0.58, 0.05, hide);
  add(0.34, 0, 0.55, 0.028, GOAT_DARK);
  add(0.24, 0.04, 0.66, 0.03, hide);
  add(0.24, -0.04, 0.66, 0.03, hide);
  limb(parts, at, yaw, [0.22, 0.03, z(0.66)], [0.16, 0.05, z(0.82)], 0.012, HORN, "cylinder", "horn");
  limb(parts, at, yaw, [0.22, -0.03, z(0.66)], [0.16, -0.05, z(0.82)], 0.012, HORN, "cylinder", "horn");
  add(0.3, 0.028, 0.6, 0.012, EYE, "");
  add(0.3, -0.028, 0.6, 0.012, EYE, "");
  add(-0.24, 0, 0.4, 0.028, hide);
  return parts;
}

const PLANTS = [
  { kind: "bush", x: -9, y: -147, color: [0.26, 0.4, 0.16, 1] },
  { kind: "bush", x: 15, y: -156, color: [0.34, 0.4, 0.18, 1] },
  { kind: "bush", x: -14, y: -134, color: [0.22, 0.36, 0.14, 1] },
  { kind: "bush", x: 7, y: -118, color: [0.42, 0.4, 0.18, 1] },
  { kind: "tuft", x: -3, y: -162, color: [0.5, 0.44, 0.2, 1] },
  { kind: "tree", x: 20, y: -142 },
];

function bushParts(parts, x, y, z, color, nowMs) {
  const dark = [color[0] * 0.65, color[1] * 0.7, color[2] * 0.6, 1];
  const gust = Math.sin(nowMs / 800) * 0.03;
  const puffs = [
    [0, 0, 0.32, 0.2, color],
    [0.18, 0.06, 0.28, 0.14, color],
    [-0.16, 0.08, 0.26, 0.13, dark],
    [0.04, -0.16, 0.24, 0.12, color],
    [-0.06, 0.02, 0.42, 0.12, color],
    [0.14, -0.08, 0.18, 0.09, dark],
    [0, 0.14, 0.2, 0.1, color],
    [0, 0, 0.1, 0.045, [0.32, 0.22, 0.12, 1]],
  ];
  for (const [dx, dy, dz, radius, leaf] of puffs) {
    const stem = leaf[0] > leaf[1];
    parts.push({ at: [x + dx + gust * dz, y + dy, z + dz], radius, color: leaf, tile: stem ? "bark" : "leaf" });
  }
}

function tuftParts(parts, x, y, z, color, nowMs) {
  const dry = [color[0] * 0.85, color[1] * 0.8, color[2] * 0.6, 1];
  for (let i = 0; i < 7; i += 1) {
    const ang = (i / 7) * Math.PI * 2;
    const sway = Math.sin(nowMs / 420 + i) * 0.06;
    const root = [x + Math.cos(ang) * 0.02, y + Math.sin(ang) * 0.015, z + 0.02];
    const tip = [x + Math.cos(ang) * 0.16 + sway, y + Math.sin(ang) * 0.1, z + 0.22];
    const side = [x + Math.cos(ang + 0.5) * 0.05, y + Math.sin(ang + 0.5) * 0.05, z + 0.08];
    parts.push(triShape(root, side, tip, i % 2 ? dry : color, { at: tip, tile: "leaf" }));
  }
}

function treeParts(parts, x, y, z, nowMs) {
  const bark = [0.38, 0.26, 0.14, 1];
  const leaf = [0.2, 0.42, 0.16, 1];
  const shade = [0.12, 0.3, 0.1, 1];
  const gust = Math.sin(nowMs / 900);
  parts.push(spanShape("cylinder", [x, y, z + 0.05], [x + gust * 0.04, y, z + 1.55], 0.07, bark, { tile: "bark" }));
  const crown = [
    [0, 0, 1.85, 0.34, leaf],
    [0.28, 0.1, 1.75, 0.22, leaf],
    [-0.26, 0.08, 1.7, 0.2, shade],
    [0.08, -0.28, 1.72, 0.2, leaf],
    [-0.1, 0.22, 1.95, 0.18, leaf],
    [0.16, 0.16, 2.05, 0.16, shade],
    [-0.18, -0.12, 1.95, 0.16, leaf],
    [0, -0.05, 2.15, 0.14, leaf],
  ];
  for (const [dx, dy, dz, radius, color] of crown) {
    parts.push({ at: [x + dx + gust * dz * 0.04, y + dy, z + dz], radius, color, tile: "leaf" });
  }
}

// Plants are spheres, plus a trunk and a tuft of blades. The box budget belongs to the town.
export function floraBoxes() {
  return [];
}

export function floraParts(nowMs = Date.now()) {
  const parts = [];
  for (const plant of PLANTS) {
    const z = duneHeight(plant.x, plant.y);
    if (plant.kind === "tree") treeParts(parts, plant.x, plant.y, z, nowMs);
    else if (plant.kind === "tuft") tuftParts(parts, plant.x, plant.y, z, plant.color, nowMs);
    else bushParts(parts, plant.x, plant.y, z, plant.color, nowMs);
  }
  return parts;
}

const WHITE = [0.94, 0.94, 0.91, 1];
const MANTLE = [0.55, 0.58, 0.62, 1];
const TIP = [0.14, 0.14, 0.15, 1];
const BEAK = [0.93, 0.68, 0.14, 1];
const EYE = [0.06, 0.06, 0.07, 1];

function mixColor(a, b, t) {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t, 1];
}

// The circling gull: heading follows the path, the left wing drops into the turn, both wings beat.
export function gullPose(nowMs) {
  const t = nowMs / 1000;
  const w = 0.15;
  const x = Math.cos(t * w) * 16;
  const y = -138 + Math.sin(t * w) * 12;
  const z = 6 + Math.sin(t * 0.4) * 0.7;
  const vx = -Math.sin(t * w) * 16 * w;
  const vy = Math.cos(t * w) * 12 * w;
  const yaw = Math.atan2(vx, vy);
  const beat = Math.sin(t * 3.4);
  const flap = beat >= 0 ? beat * 0.28 : beat * 0.72;
  return { at: [x, y, z], yaw, flap, bank: 0.38 };
}

export function gullParts(nowMs) {
  const pose = gullPose(nowMs);
  const { at, yaw, flap, bank } = pose;
  const forward = [Math.sin(yaw), Math.cos(yaw), 0];
  const rx = Math.cos(yaw);
  const ry = -Math.sin(yaw);
  const cb = Math.cos(bank);
  const sb = Math.sin(bank);
  const right = [rx * cb, ry * cb, sb];
  const up = [-rx * sb, -ry * sb, cb];
  const pt = (lf, lr, lu) => [
    at[0] + forward[0] * lf + right[0] * lr + up[0] * lu,
    at[1] + forward[1] * lf + right[1] * lr + up[1] * lu,
    at[2] + forward[2] * lf + right[2] * lr + up[2] * lu,
  ];
  const parts = [];
  parts.push(spanShape("capsule", pt(-0.22, 0, 0), pt(0.18, 0, 0.02), 0.055, WHITE, { tile: "feather" }));
  parts.push(spanShape("cylinder", pt(0.34, 0, 0.045), pt(0.5, 0, 0.03), 0.012, BEAK, { at: pt(0.5, 0, 0.03), tile: "horn" }));
  const head = pt(0.3, 0, 0.06);
  parts.push({ at: head, origin: head, radius: 0.045, color: WHITE });
  for (const side of [1, -1]) {
    const eye = pt(0.33, side * 0.03, 0.075);
    parts.push({ at: eye, origin: eye, radius: 0.01, color: EYE });
  }
  const tail = pt(-0.42, 0, 0.02);
  parts.push(triShape(pt(-0.16, 0.02, 0.02), pt(-0.16, -0.02, 0.02), tail, WHITE, { at: tail, tile: "feather" }));
  for (const side of [1, -1]) {
    const root = pt(0.02, side * 0.08, 0.02);
    const mid = pt(-0.04, side * 0.46, 0.03 + flap * 0.42);
    const tip = pt(-0.1, side * 0.98, 0.02 + flap);
    const midBack = pt(-0.16, side * 0.4, flap * 0.32);
    const tipBack = pt(-0.22, side * 0.86, flap * 0.82);
    const tone = side > 0 ? MANTLE : mixColor(MANTLE, TIP, 0.35);
    parts.push(triShape(root, mid, midBack, tone, { at: mid, tile: "feather" }));
    parts.push(triShape(mid, tip, tipBack, TIP, { at: tip, tile: "feather" }));
  }
  return { ...pose, parts };
}

export function fauna(nowMs, from, { parts = true } = {}) {
  const t = nowMs / 1000;
  const crabHome = [9 + Math.sin(t * 0.35) * 3.2, -168 + Math.cos(t * 0.22) * 2.1];
  const crabAt = shy(crabHome, from, 4.5, 1.6);
  const crabYaw = Math.atan2(Math.cos(t * 0.35) * 3.2 * 0.35, -Math.sin(t * 0.22) * 2.1 * 0.22);
  const crab = [crabAt[0], crabAt[1], duneHeight(crabAt[0], crabAt[1]) + 0.02];
  const skinkHome = [-7 + Math.sin(t * 0.5) * 2.1, -136 + Math.sin(t * 0.17) * 1.5];
  const skinkAt = shy(skinkHome, from, 6, 2.4);
  const skinkYaw = Math.atan2(Math.cos(t * 0.5) * 2.1 * 0.5, Math.cos(t * 0.17) * 1.5 * 0.17);
  const skink = [skinkAt[0], skinkAt[1], duneHeight(skinkAt[0], skinkAt[1]) + 0.02];
  const gull = parts ? gullParts(nowMs) : gullPose(nowMs);
  const grazed = herd(graze({ stock: 1 }), [12, -150, duneHeight(12, -150)], 3, parts, nowMs);
  return [
    { kind: "crab", at: crab, radius: 0.12, color: SHELL, ...(parts ? { parts: crabParts(crab, crabYaw, nowMs) } : {}) },
    { kind: "skink", at: skink, radius: 0.05, color: SCALE, ...(parts ? { parts: skinkParts(skink, skinkYaw, nowMs) } : {}) },
    { kind: "gull", at: gull.at, radius: 0.1, color: WHITE, ...(parts ? { parts: gull.parts } : {}) },
    ...grazed,
  ];
}
