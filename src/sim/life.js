import { spanShape, triShape } from "./form.js?v=1";
import { LAKE, MOUNTAIN, bakeLand, bankPlants, inLand, landBank, landDelta, landPineDensity, landWater, mountainHeight } from "./land.js?v=2";
import { bakeVolcano, bombsAt, inVolcano, lavaAt, volcanoDelta } from "./volcano.js?v=1";

export const HILL = 5.4;

// The rolling dunes alone. The mountain, lake and river ride on top of these (land.js).
export function baseDune(x, y) {
  const roll = 0.5 * Math.sin(x * 0.15) + 0.5 * Math.cos(y * 0.13);
  const wash = 0.5 * Math.sin((x + y) * 0.17 + 1.3) + 0.5;
  const n = Math.max(0, Math.min(1, 0.55 * roll + 0.45 * wash));
  const broad = 0.5 + 0.5 * Math.sin(x * 0.021 + 0.6) * Math.cos(y * 0.018);
  let h = n * n * HILL * (0.78 + 0.22 * broad);
  const marsh = Math.exp(-(((x - 36) ** 2) + ((y + 96) ** 2)) / 2200);
  h *= 1 - marsh * 0.55;
  const ridge = Math.exp(-(((x + 24) ** 2)) / 520) * Math.max(0, Math.cos(y * 0.02));
  h = Math.min(HILL, h + ridge * 1.6);
  return Math.max(0, h);
}

let landField = null;
export function land() {
  if (!landField) landField = bakeLand(baseDune);
  return landField;
}

let volcanoField = null;
export function volcano() {
  if (!volcanoField) volcanoField = bakeVolcano(baseDune);
  return volcanoField;
}

// Ground height: the dunes, plus the north mountain, the lake basin, and the channel the water cut,
// plus the volcano in the southwest (volcano.js).
export function duneHeight(x, y) {
  let h = baseDune(x, y);
  if (inVolcano(x, y)) h += volcanoDelta(volcano(), x, y);
  if (!inLand(x, y)) return h;
  return h + landDelta(land(), x, y);
}

// The lava bombs in the air at shared-clock time t (seconds): the same for every peer.
export function eruptionAt(t) {
  return bombsAt(t, volcano().seedHash, duneHeight);
}

// Water surface over this point, or null where it is dry.
export function waterAt(x, y) {
  if (!inLand(x, y)) return null;
  const w = landWater(land(), x, y);
  return w > duneHeight(x, y) + 0.01 ? w : null;
}

// Deep water floats you: the feet never sit more than WADE under the surface, so the head stays out.
export const WADE = 1.25;

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

// A herd is several of the same animal. A dead patch stays where it fell.
// A living one walks a slow loop and leaves the prints behind it.
export function herdFoot(index, nowMs, anchor = [12, -150]) {
  const phase = nowMs / 1000 * 0.16 + index * ((Math.PI * 2) / 3);
  const radiusX = 3.6 + index * 0.45;
  const radiusY = 2.3 + index * 0.3;
  const x = anchor[0] + Math.cos(phase) * radiusX;
  const y = anchor[1] + Math.sin(phase) * radiusY;
  return {
    x,
    y,
    yaw: Math.atan2(-Math.sin(phase) * radiusX, Math.cos(phase) * radiusY),
    gait: phase * 8,
  };
}

// A hoof plants on a fixed clock. The mark stays on that spot until the trail rolls off.
const HOOF_MS = 700;

export function herdPrints(nowMs, count = 3, anchor = [12, -150]) {
  const out = [];
  const latest = Math.floor(nowMs / HOOF_MS) * HOOF_MS;
  for (let i = 0; i < count; i += 1) {
    for (let s = 0; s < 8; s += 1) {
      const step = herdFoot(i, latest - s * HOOF_MS, anchor);
      out.push({ x: step.x, y: step.y, yaw: step.yaw, scale: 0.45, who: `goat:${i}` });
    }
  }
  return out;
}

export function herd(patch, at = [12, -150, 0], count = 3, parts = true, nowMs = 0) {
  const one = grazeAnimal(patch, at);
  if (!one) return [];
  const animals = [];
  const dead = Boolean(patch?.dead);
  const anchor = [at[0], at[1]];
  for (let i = 0; i < count; i += 1) {
    const step = dead
      ? { x: anchor[0] + (i - (count - 1) / 2) * 1.05, y: anchor[1] + (i - 1) * 0.2, yaw: 0.15 + i * 0.5, gait: 0 }
      : herdFoot(i, nowMs, anchor);
    const foot = [step.x, step.y, duneHeight(step.x, step.y)];
    animals.push({
      ...one,
      id: `goat:${i}`,
      at: foot,
      herd: count,
      ...(parts ? { parts: goatParts(foot, step.yaw, dead, nowMs, step.gait) } : {}),
    });
  }
  return animals;
}

export function standHeight(x, y, dug = 0) {
  if (dug < -0.01) return dug;
  const h = duneHeight(x, y);
  const w = waterAt(x, y);
  return w == null ? h : Math.max(h, w - WADE);
}

function smoothstep(edge0, edge1, value) {
  const t = Math.max(0, Math.min(1, (value - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

function slopeAt(x, y) {
  const h = duneHeight(x, y);
  const e = 0.75;
  const nx = h - duneHeight(x + e, y);
  const ny = h - duneHeight(x, y + e);
  return 1 - Math.max(0, Math.min(1, e / Math.hypot(nx, ny, e)));
}

// Beach, scrub, meadow, marsh, grove, and ridge. The kind on the chart stays sand, grass, or rock.
export function biomeAt(x, y) {
  const h = duneHeight(x, y);
  if (inLand(x, y)) {
    const field = land();
    if (waterAt(x, y) != null) return Math.hypot(x - LAKE.x, y - LAKE.y) < LAKE.radius * 1.5 ? "lake" : "river";
    if (landBank(field, x, y) > 0.35) return "bank";
    const m = mountainHeight(x, y, field.seedHash);
    if (m > 2 && h > MOUNTAIN.height * 0.72) return "summit";
    if (landPineDensity(field, x, y) > 0.15) return "pines";
    if (m > 2) return "slope";
  }
  if (inVolcano(x, y)) {
    const field = volcano();
    if (lavaAt(field, x, y) > 0.4) return "lava";
    if (volcanoDelta(field, x, y) > 1.5) return "cinder";
  }
  const marsh = Math.exp(-(((x - 36) ** 2) + ((y + 96) ** 2)) / 2200);
  if (marsh > 0.42 && h < 1.6) return "marsh";
  const grove = Math.exp(-(((x + 16) ** 2) + ((y + 128) ** 2)) / 2600);
  if (grove > 0.38 && h > 0.4 && h < 3.4) return "grove";
  if (slopeAt(x, y) > 0.34 || h > HILL * 0.78) return "ridge";
  if (h < 0.55) return "beach";
  if (h < 1.7) return "scrub";
  return "meadow";
}

export function groundLook(x, y) {
  const h = duneHeight(x, y);
  const slope = slopeAt(x, y);
  const crest = Math.max(0, Math.min(1, h / HILL));
  const rockW = Math.max(0, Math.min(1, smoothstep(0.2, 0.5, slope) + smoothstep(0.62, 0.92, crest) * 0.8));
  let grassW = (1 - rockW) * smoothstep(0.1, 0.34, crest) * (1 - smoothstep(0.58, 0.86, crest));
  grassW *= 1 - smoothstep(0.16, 0.46, slope);
  const biome = biomeAt(x, y);
  if (biome === "lake" || biome === "river" || biome === "bank" || biome === "summit" || biome === "pines" || biome === "slope" || biome === "lava" || biome === "cinder") {
    const look = {
      lake: ["sand", [70, 92, 96]],
      river: ["sand", [78, 98, 100]],
      bank: ["grass", [62, 118, 52]],
      summit: ["rock", [150, 148, 146]],
      lava: ["rock", [236, 96, 28]],
      cinder: ["rock", [58, 52, 50]],
      pines: ["grass", [52, 82, 44]],
      slope: [rockW > 0.45 ? "rock" : "grass", rockW > 0.45 ? [124, 118, 108] : [96, 124, 62]],
    }[biome];
    return { kind: look[0], biome, color: [...look[1], 255], crest, grassW, rockW };
  }
  const sand = biome === "marsh" ? [118, 124, 86] : [196, 168, 112];
  const grass = biome === "grove" ? [48, 110, 42] : biome === "meadow" ? [86, 150, 58] : biome === "marsh" ? [64, 108, 62] : [92, 124, 48];
  const rock = biome === "ridge" ? [132, 126, 116] : [142, 136, 124];
  const mix = (a, b, t) => a.map((channel, i) => Math.round(channel + (b[i] - channel) * t));
  const mixed = mix(mix(sand, grass, grassW), rock, rockW);
  const lift = 0.78 + crest * 0.34;
  const color = [...mixed.map((channel) => Math.min(255, Math.round(channel * lift))), 255];
  const kind = rockW > 0.45 ? "rock" : grassW > 0.35 ? "grass" : "sand";
  return { kind, biome, color, crest, grassW, rockW };
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

export function goatParts(at, yaw = 0, dead = false, nowMs = 0, gait = 0) {
  const parts = [];
  const hide = dead ? [0.3, 0.24, 0.18, 1] : GOAT;
  const z = (up) => (dead ? up * 0.45 : up);
  const breathe = dead ? 0 : Math.sin(nowMs / 520) * 0.012;
  const pace = dead ? 0 : gait;
  const add = (lf, lr, up, radius, color, tile = "hide") => orient(parts, at, yaw, lf, lr, z(up), radius, color, tile);
  for (const side of [1, -1]) {
    for (const fore of [1, -1]) {
      const phase = pace + (side * fore > 0 ? 0 : Math.PI);
      const swing = Math.sin(phase) * 0.07;
      const lift = Math.max(0, Math.cos(phase)) * 0.045;
      const along = 0.13 * fore;
      limb(parts, at, yaw, [along, side * 0.07, z(0.34)], [along + swing, side * 0.08, z(0.03 + lift)], 0.03, hide);
    }
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

function bushParts(parts, x, y, z, color, nowMs, scale = 1) {
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
    parts.push({ at: [x + (dx + gust * dz) * scale, y + dy * scale, z + dz * scale], radius: radius * scale, color: leaf, tile: stem ? "bark" : "leaf" });
  }
}

function tuftParts(parts, x, y, z, color, nowMs, scale = 1) {
  const dry = [color[0] * 0.85, color[1] * 0.8, color[2] * 0.6, 1];
  for (let i = 0; i < 7; i += 1) {
    const ang = (i / 7) * Math.PI * 2;
    const sway = Math.sin(nowMs / 420 + i) * 0.06;
    const root = [x + Math.cos(ang) * 0.02 * scale, y + Math.sin(ang) * 0.015 * scale, z + 0.02 * scale];
    const tip = [x + (Math.cos(ang) * 0.16 + sway) * scale, y + Math.sin(ang) * 0.1 * scale, z + 0.22 * scale];
    const side = [x + Math.cos(ang + 0.5) * 0.05 * scale, y + Math.sin(ang + 0.5) * 0.05 * scale, z + 0.08 * scale];
    parts.push(triShape(root, side, tip, i % 2 ? dry : color, { at: tip, tile: "leaf" }));
  }
}

function treeParts(parts, x, y, z, nowMs, scale = 1) {
  const bark = [0.38, 0.26, 0.14, 1];
  const leaf = [0.2, 0.42, 0.16, 1];
  const shade = [0.12, 0.3, 0.1, 1];
  const gust = Math.sin(nowMs / 900);
  parts.push(spanShape("cylinder", [x, y, z + 0.05 * scale], [x + gust * 0.04 * scale, y, z + 1.55 * scale], 0.07 * scale, bark, { tile: "bark" }));
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
    parts.push({ at: [x + (dx + gust * dz * 0.04) * scale, y + dy * scale, z + dz * scale], radius: radius * scale, color, tile: "leaf" });
  }
}

const SEED_EVERY = 3600;
export const PLANT_CAP = 14;

export function plantStage(age) {
  if (age < 900) return "seed";
  if (age < 2400) return "sprout";
  if (age < 3600) return "grown";
  return "seeding";
}

export function plantScale(stage) {
  if (stage === "seed") return 0.16;
  if (stage === "sprout") return 0.42;
  return 1;
}

function canRoot(x, y) {
  const biome = biomeAt(x, y);
  return biome === "scrub" || biome === "meadow" || biome === "grove" || biome === "marsh";
}

function hash01(n) {
  const x = Math.sin(n * 127.1) * 43758.5453;
  return x - Math.floor(x);
}

// Anchors stay. Each one drops a seed on a fixed clock. A seed roots only on living ground,
// grows through sprout, and the oldest seed gives way when the next one lands.
export function livingPlants(tick = 0) {
  const plants = PLANTS.map((plant) => ({ ...plant, age: 1e9, stage: "grown", scale: 1 }));
  const now = Math.max(0, tick);
  const generation = Math.floor(now / SEED_EVERY);
  for (let slot = generation; slot >= Math.max(0, generation - 1); slot -= 1) {
    for (let i = 0; i < PLANTS.length && plants.length < PLANT_CAP; i += 1) {
      const parent = PLANTS[i];
      if (parent.kind === "tuft") continue;
      const age = now - slot * SEED_EVERY;
      if (age < 0) continue;
      const ang = hash01(i * 19 + slot * 7) * Math.PI * 2;
      const dist = 2.6 + hash01(i * 3 + slot) * 3.8;
      const x = parent.x + Math.cos(ang) * dist;
      const y = parent.y + Math.sin(ang) * dist;
      if (!canRoot(x, y)) continue;
      const stage = plantStage(age);
      const biome = biomeAt(x, y);
      const kind = biome === "grove" ? "tree" : biome === "marsh" ? "tuft" : "bush";
      plants.push({
        kind,
        x,
        y,
        color: parent.color || [0.26, 0.4, 0.16, 1],
        age,
        stage,
        scale: plantScale(stage),
      });
    }
  }
  return plants;
}

function reedParts(parts, x, y, z, nowMs, size = 1) {
  const stem = [0.36, 0.5, 0.22, 1];
  const head = [0.36, 0.24, 0.12, 1];
  for (let i = 0; i < 3; i += 1) {
    const ang = i * 2.1 + x * 0.7;
    const sway = Math.sin(nowMs / 650 + i * 1.7 + y) * 0.06;
    const tall = (0.9 + 0.25 * i) * size;
    const root = [x + Math.cos(ang) * 0.08, y + Math.sin(ang) * 0.08, z];
    const tip = [root[0] + sway + Math.cos(ang) * 0.06, root[1] + Math.sin(ang) * 0.06, z + tall];
    parts.push(spanShape("capsule", root, tip, 0.016 * size, stem, { tile: "leaf" }));
    if (i < 2) parts.push(spanShape("capsule", [tip[0], tip[1], tip[2] - 0.2 * size], tip, 0.035 * size, head, { tile: "hide" }));
  }
}

// Reeds and bushes on the stream, lake and river banks near the viewer. Fixed positions (land.js),
// nearest first, capped so the picture budget stays for the people and the yard.
export const BANK_REEDS = 18;
export const BANK_BUSHES = 6;
export function bankParts(feet, nowMs = 0, reach = 42) {
  if (!feet) return [];
  const fx = feet[0];
  const fy = feet[1];
  if (fy < 24 - reach) return [];
  const near = bankPlants(land())
    .map((plant) => ({ plant, d: Math.hypot(plant.x - fx, plant.y - fy) }))
    .filter((entry) => entry.d < reach)
    .sort((a, b) => a.d - b.d);
  const parts = [];
  let reeds = 0;
  let bushes = 0;
  for (const { plant } of near) {
    const z = duneHeight(plant.x, plant.y);
    if (plant.kind === "reed" && reeds < BANK_REEDS) {
      reeds += 1;
      reedParts(parts, plant.x, plant.y, z, nowMs, plant.size);
    } else if (plant.kind === "bush" && bushes < BANK_BUSHES) {
      bushes += 1;
      bushParts(parts, plant.x, plant.y, z, [0.2, 0.42, 0.16, 1], nowMs, plant.size * 1.4);
    }
  }
  return parts;
}

export function floraBoxes() {
  return [];
}

export function floraParts(nowMs = Date.now(), tick = 0) {
  const parts = [];
  for (const plant of livingPlants(tick)) {
    const z = duneHeight(plant.x, plant.y);
    const scale = plant.scale || 1;
    if (plant.stage === "seed") {
      parts.push({ at: [plant.x, plant.y, z + 0.05], radius: 0.045, color: [0.42, 0.32, 0.16, 1], tile: "bark" });
      continue;
    }
    if (plant.kind === "tree") treeParts(parts, plant.x, plant.y, z, nowMs, scale);
    else if (plant.kind === "tuft") tuftParts(parts, plant.x, plant.y, z, plant.color, nowMs, scale);
    else bushParts(parts, plant.x, plant.y, z, plant.color, nowMs, scale);
    if (plant.stage === "seeding") {
      const fall = (plant.age % SEED_EVERY) / SEED_EVERY;
      for (let s = 0; s < 3; s += 1) {
        const ang = hash01(plant.x * 0.2 + plant.y * 0.13 + s * 9) * Math.PI * 2;
        const dist = 0.3 + fall * (1.2 + s * 0.3);
        parts.push({
          at: [plant.x + Math.cos(ang) * dist, plant.y + Math.sin(ang) * dist, z + 0.55 * (1 - fall) + 0.06],
          radius: 0.035,
          color: [0.46, 0.36, 0.18, 1],
          tile: "bark",
        });
      }
    }
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
  const grazed = herd({ stock: 1, track: true, dead: false }, [12, -150, duneHeight(12, -150)], 3, parts, nowMs);
  return [
    { id: "crab", kind: "crab", at: crab, radius: 0.12, color: SHELL, ...(parts ? { parts: crabParts(crab, crabYaw, nowMs) } : {}) },
    { id: "skink", kind: "skink", at: skink, radius: 0.05, color: SCALE, ...(parts ? { parts: skinkParts(skink, skinkYaw, nowMs) } : {}) },
    { id: "gull", kind: "gull", at: gull.at, radius: 0.1, color: WHITE, ...(parts ? { parts: gull.parts } : {}) },
    ...grazed,
  ];
}
