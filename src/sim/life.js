export const HILL = 5.4;

export function duneHeight(x, y) {
  const roll = 0.5 * Math.sin(x * 0.15) + 0.5 * Math.cos(y * 0.13);
  const wash = 0.5 * Math.sin((x + y) * 0.17 + 1.3) + 0.5;
  const n = Math.max(0, Math.min(1, 0.55 * roll + 0.45 * wash));
  return n * n * HILL;
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
  const color = [...mix(mix(sand, grass, grassW), rock, rockW), 255];
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

export function fauna(nowMs, from) {
  const t = nowMs / 1000;
  const crabHome = [9 + Math.sin(t * 0.35) * 3.2, -168 + Math.cos(t * 0.22) * 2.1];
  const crab = shy(crabHome, from, 4.5, 1.6);
  const skinkHome = [-7 + Math.sin(t * 0.5) * 2.1, -136 + Math.sin(t * 0.17) * 1.5];
  const skink = shy(skinkHome, from, 6, 2.4);
  const gull = [Math.cos(t * 0.15) * 16, -138 + Math.sin(t * 0.15) * 12, 6 + Math.sin(t * 0.4) * 0.7];
  return [
    { kind: "crab", at: [crab[0], crab[1], duneHeight(crab[0], crab[1]) + 0.12], radius: 0.22, color: [0.62, 0.28, 0.16, 1] },
    { kind: "skink", at: [skink[0], skink[1], duneHeight(skink[0], skink[1]) + 0.1], radius: 0.16, color: [0.42, 0.5, 0.2, 1] },
    { kind: "gull", at: gull, radius: 0.28, color: [0.92, 0.92, 0.88, 1] },
  ];
}
