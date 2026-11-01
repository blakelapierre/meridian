import { Crust } from "../sim/crust.js";
import { pieceBoxes } from "../sim/build.js";
import { chaseOrigin, dummyParts, playerParts } from "../sim/body.js?v=53";
import { lookDirection } from "../sim/hands.js";
import { sunDirection } from "../sim/sun.js";
import { dummyTexture } from "./texture.js";
import { duneHeight, fauna, floraParts } from "../sim/life.js?v=72";
import { PEOPLE } from "../sim/people.js?v=1";

const WOOD = [0.42, 0.3, 0.18, 1];
const OTHER = [0.55, 0.42, 0.22, 1];
const PROP_COLOR = {
  paper: [0.86, 0.82, 0.7, 1],
  stone: [0.52, 0.5, 0.46, 1],
  thatch: [0.48, 0.34, 0.16, 1],
  water: [0.2, 0.46, 0.6, 1],
  hearth: [0.58, 0.3, 0.18, 1],
};
const PROP_SHINE = { paper: 0.04, stone: 0.14, thatch: 0.04, water: 0.4, hearth: 0.1 };

export function eyeHeight(crouch) {
  return crouch ? 1.1 : 1.65;
}

// The picture keeps a fixed box budget and fills it in array order. Nearest boxes go first
// so a town and the compound do not erase each other when both are in the world.
export function orderForCamera(objects, feet) {
  const fx = feet?.[0] || 0;
  const fy = feet?.[1] || 0;
  const boxes = [];
  const spheres = [];
  const rest = [];
  for (const object of objects) {
    if (object.type === "box") boxes.push(object);
    else if (object.type === "sphere") spheres.push(object);
    else rest.push(object);
  }
  const dist = (object) => {
    const c = object.type === "box"
      ? [(object.min[0] + object.max[0]) * 0.5, (object.min[1] + object.max[1]) * 0.5]
      : [object.origin[0], object.origin[1]];
    const dx = c[0] - fx;
    const dy = c[1] - fy;
    return dx * dx + dy * dy;
  };
  const byNear = (a, b) => {
    const delta = dist(a) - dist(b);
    if (delta !== 0) return delta;
    const ai = a.id || a.body || "";
    const bi = b.id || b.body || "";
    return ai < bi ? -1 : ai > bi ? 1 : 0;
  };
  boxes.sort(byNear);
  spheres.sort(byNear);
  return rest.concat(spheres, boxes);
}

function coarse(parts, keep = 3) {
  return [...parts].sort((a, b) => b.radius - a.radius).slice(0, keep);
}

export function buildScene({ feet, yaw, pitch, crouch = false, tick = 0, atoll, crust, pieces = [], width, height, view = "first", self = true, others = [], cameraOrigin = null, cameraDir = null, fov = 70, smoke = null, swarm = null, pools = [], bolts = [], loose = [], lean = 0, sparse = false }) {
  const eye = eyeHeight(crouch);
  const sun = sunDirection(tick);
  const objects = [];
  if (crust !== false) {
    objects.push({ type: "crust", field: crust || new Crust(atoll.worldSeed, atoll.cellId) });
  }
  for (const box of pieceBoxes(pieces)) objects.push(box);
  for (const prop of atoll.props) {
    const box = prop.box;
    const surface = prop.material || "wood";
    objects.push({
      type: "box",
      min: [box.min.x / 100, box.min.y / 100, box.min.z / 100],
      max: [box.max.x / 100, box.max.y / 100, box.max.z / 100],
      color: PROP_COLOR[surface] || WOOD,
      reflectivity: PROP_SHINE[surface] ?? 0.08,
      id: prop.id,
      name: prop.name || "",
      kind: prop.kind || "",
      surface,
      action: prop.action || "",
      detail: prop.detail || "",
      difficulty: prop.difficulty ?? 5,
      cell: prop.cell || null,
    });
  }
  if (smoke) {
    objects.push({
      type: "sphere",
      origin: [smoke[0], smoke[1], 1.1],
      radius: 2.2,
      color: [0.62, 0.64, 0.66, 1],
      reflectivity: 0.02,
      body: "smoke",
    });
  }
  if (swarm) {
    objects.push({
      type: "sphere",
      origin: swarm,
      radius: 0.45,
      color: [0.32, 0.48, 0.24, 1],
      reflectivity: 0.04,
      body: "swarm",
    });
  }
  if (!sparse) {
    for (const part of floraParts()) {
      objects.push({
        type: "sphere",
        origin: part.at,
        radius: part.radius,
        color: part.color,
        reflectivity: 0.02,
        body: "flora",
      });
    }
  }
  for (const animal of fauna(Date.now(), feet, { parts: !sparse })) {
    const parts = !sparse && animal.parts?.length ? animal.parts : [animal];
    for (const part of parts) {
      objects.push({
        type: "sphere",
        origin: part.at,
        radius: part.radius,
        color: part.color,
        reflectivity: 0.03,
        body: animal.kind,
      });
    }
  }
  for (const person of PEOPLE) {
    const z = duneHeight(person.at[0], person.at[1]);
    const figure = playerParts([person.at[0], person.at[1], z], person.yaw, false, {
      self: false,
      color: person.color,
      body: "person",
      id: person.id,
      name: person.name,
      detail: person.detail,
      speech: person.speech,
    });
    for (const part of (sparse ? coarse(figure) : figure)) objects.push(part);
  }
  const dummy = atoll.placements.dummy;
  const dummyAt = [dummy.x / 100, dummy.y / 100, 0];
  const dummyFigure = sparse
    ? [{ origin: [dummyAt[0], dummyAt[1], 0.9], radius: 0.35, color: [0.86, 0.22, 0.18, 1], texture: true }]
    : dummyParts(dummyAt);
  for (const part of dummyFigure) {
    objects.push({
      type: "sphere",
      origin: part.origin,
      radius: part.radius,
      color: part.color,
      reflectivity: part.texture ? 0.4 : 0.08,
      body: "dummy",
      ...(part.texture ? { texture: dummyTexture() } : {}),
    });
  }
  for (const pool of pools) {
    objects.push({
      type: "box",
      min: [pool.x - 0.45, pool.y - 0.45, pool.floor + 0.02],
      max: [pool.x + 0.45, pool.y + 0.45, pool.floor + 0.14],
      color: [0.2, 0.45, 0.62, 1],
      reflectivity: 0.35,
      id: "pool",
    });
  }
  for (const bolt of bolts) {
    objects.push({
      type: "sphere",
      origin: bolt.position,
      radius: 0.06,
      color: [0.95, 0.9, 0.4, 1],
      reflectivity: 0.2,
      body: "bolt",
    });
  }
  for (const body of loose) {
    const color = body.color || [140, 136, 124, 255];
    objects.push({
      type: "sphere",
      origin: body.position,
      radius: body.size || 0.14,
      color: [color[0] / 255, color[1] / 255, color[2] / 255, 1],
      reflectivity: 0.08,
      body: "stone",
      id: "stone",
      name: "Stone",
    });
  }
  if (view === "third" && self) {
    const figure = playerParts(feet, yaw + (lean || 0), crouch, { self: true });
    for (const part of (sparse ? coarse(figure) : figure)) objects.push(part);
  }
  for (const other of others) {
    const figure = playerParts(other.feet, other.yaw, !!other.crouch, { self: false, color: other.color || OTHER });
    for (const part of (sparse ? coarse(figure) : figure)) objects.push(part);
  }
  const day = sun[2] > 0 ? 0.15 + sun[2] * 0.85 : 0.08;
  const dir = cameraDir || lookDirection(yaw, pitch);
  const origin = cameraOrigin
    ? cameraOrigin.slice()
    : view === "third"
      ? chaseOrigin(feet, yaw, pitch, crouch)
      : [feet[0], feet[1], feet[2] + eye];
  return {
    sun,
    miss: [0.42 * day, 0.58 * day, 0.82 * day, 1],
    objects: orderForCamera(objects, feet),
    camera: {
      origin,
      dir,
      fov,
      aspect: width / height,
      planeDistance: 1,
    },
  };
}
