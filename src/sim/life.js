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
export function herd(patch, at = [12, -150, 0], count = 3) {
  const one = grazeAnimal(patch, at);
  if (!one) return [];
  const animals = [];
  for (let i = 0; i < count; i += 1) {
    animals.push({ ...one, at: [one.at[0] + i * 0.7, one.at[1], one.at[2]], herd: count });
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

const SCRUB = [
  { x: -9, y: -147, w: 0.9, h: 0.5, color: [0.26, 0.4, 0.16, 1] },
  { x: 15, y: -156, w: 0.7, h: 0.4, color: [0.34, 0.4, 0.18, 1] },
  { x: -14, y: -134, w: 1.1, h: 0.55, color: [0.22, 0.36, 0.14, 1] },
  { x: 7, y: -118, w: 0.8, h: 0.45, color: [0.42, 0.4, 0.18, 1] },
  { x: -3, y: -162, w: 1.3, h: 0.28, color: [0.5, 0.44, 0.2, 1] },
  { x: 20, y: -142, w: 0.35, h: 1.7, color: [0.38, 0.26, 0.14, 1] },
  { x: 20, y: -142, w: 1.3, h: 0.7, lift: 1.35, color: [0.2, 0.4, 0.15, 1] },
];

export function floraBoxes() {
  return SCRUB.map((plant) => {
    const z = duneHeight(plant.x, plant.y) + (plant.lift || 0);
    const half = plant.w / 2;
    return {
      type: "box",
      min: [plant.x - half, plant.y - half, z],
      max: [plant.x + half, plant.y + half, z + plant.h],
      color: plant.color,
      reflectivity: 0.02,
      id: "scrub",
    };
  });
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

function gullPart(at, forward, right, up, lf, lr, lu, radius, color, parts) {
  parts.push({
    at: [
      at[0] + forward[0] * lf + right[0] * lr + up[0] * lu,
      at[1] + forward[1] * lf + right[1] * lr + up[1] * lu,
      at[2] + forward[2] * lf + right[2] * lr + up[2] * lu,
    ],
    radius,
    color,
  });
}

export function gullParts(nowMs) {
  const pose = gullPose(nowMs);
  const { at, yaw, flap, bank } = pose;
  const forward = [Math.sin(yaw), Math.cos(yaw), 0];
  const rx = Math.cos(yaw);
  const ry = -Math.sin(yaw);
  const cb = Math.cos(bank);
  const sb = Math.sin(bank);
  // Positive bank lifts the right wing. The path turns left, so the left wing stays low.
  const right = [rx * cb, ry * cb, sb];
  const up = [-rx * sb, -ry * sb, cb];
  const parts = [];
  const add = (lf, lr, lu, radius, color) => gullPart(at, forward, right, up, lf, lr, lu, radius, color, parts);
  add(-0.2, 0, 0.01, 0.055, WHITE);
  add(-0.06, 0, 0, 0.085, WHITE);
  add(0.08, 0, -0.01, 0.095, WHITE);
  add(0.08, 0, 0.06, 0.06, MANTLE);
  add(0.2, 0, 0.04, 0.05, WHITE);
  add(0.3, 0, 0.065, 0.052, WHITE);
  add(0.38, 0, 0.06, 0.026, BEAK);
  add(0.44, 0, 0.055, 0.014, BEAK);
  add(0.325, 0.032, 0.08, 0.011, EYE);
  add(0.325, -0.032, 0.08, 0.011, EYE);
  add(-0.32, 0, 0.02, 0.038, WHITE);
  add(-0.4, 0.06, 0.01, 0.03, WHITE);
  add(-0.4, -0.06, 0.01, 0.03, WHITE);
  add(-0.46, 0.11, -0.005, 0.02, TIP);
  add(-0.46, -0.11, -0.005, 0.02, TIP);
  const stations = [0.12, 0.26, 0.4, 0.54, 0.68, 0.82, 0.96];
  for (const side of [1, -1]) {
    stations.forEach((span) => {
      const u = span / stations[stations.length - 1];
      const lift = flap * u;
      const sweep = -0.1 * u;
      const chord = 0.07 * (1 - u * 0.25);
      const radius = 0.042 * (1 - u * 0.55) + 0.012;
      const color = u > 0.82 ? TIP : mixColor(u > 0.35 ? MANTLE : WHITE, u > 0.35 ? TIP : MANTLE, u > 0.35 ? (u - 0.35) / 0.47 : u / 0.35);
      add(sweep + chord, side * span, 0.015 + lift, radius, color);
      add(sweep - chord, side * span * 0.98, lift - 0.01, radius * 0.85, u > 0.6 ? TIP : MANTLE);
    });
  }
  return { ...pose, parts };
}

export function fauna(nowMs, from) {
  const t = nowMs / 1000;
  const crabHome = [9 + Math.sin(t * 0.35) * 3.2, -168 + Math.cos(t * 0.22) * 2.1];
  const crab = shy(crabHome, from, 4.5, 1.6);
  const skinkHome = [-7 + Math.sin(t * 0.5) * 2.1, -136 + Math.sin(t * 0.17) * 1.5];
  const skink = shy(skinkHome, from, 6, 2.4);
  const gull = gullParts(nowMs);
  const grazed = herd(graze({ stock: 1 }), [12, -150, duneHeight(12, -150)]);
  return [
    { kind: "crab", at: [crab[0], crab[1], duneHeight(crab[0], crab[1]) + 0.12], radius: 0.22, color: [0.62, 0.28, 0.16, 1] },
    { kind: "skink", at: [skink[0], skink[1], duneHeight(skink[0], skink[1]) + 0.1], radius: 0.16, color: [0.42, 0.5, 0.2, 1] },
    { kind: "gull", at: gull.at, radius: 0.1, color: WHITE, parts: gull.parts },
    ...grazed,
  ];
}
