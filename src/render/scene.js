import { Crust } from "../sim/crust.js";
import { pieceBoxes } from "../sim/build.js?v=3";
import { chaseOrigin, dummyParts, playerParts } from "../sim/body.js?v=57";
import { lookDirection } from "../sim/hands.js";
import { sunDirection } from "../sim/sun.js?v=2";
import { dummyTexture } from "./texture.js";
import { bankParts, duneHeight, fauna, floraParts, standHeight } from "../sim/life.js?v=85";
import { PEOPLE } from "../sim/people.js?v=2";
import { helperParts } from "../sim/helper.js?v=1";

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
  const shapes = [];
  const rest = [];
  for (const object of objects) {
    if (object.type === "box") boxes.push(object);
    else if (object.type === "sphere") spheres.push(object);
    else if (object.type === "shape") shapes.push(object);
    else rest.push(object);
  }
  const dist = (object) => {
    const c = object.type === "box"
      ? [(object.min[0] + object.max[0]) * 0.5, (object.min[1] + object.max[1]) * 0.5]
      : [object.origin?.[0] ?? object.a?.[0] ?? 0, object.origin?.[1] ?? object.a?.[1] ?? 0];
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
  shapes.sort(byNear);
  return rest.concat(shapes, spheres, boxes);
}

function coarse(parts, keep = 3) {
  return [...parts].sort((a, b) => (b.bulk ?? b.radius ?? 0) - (a.bulk ?? a.radius ?? 0)).slice(0, keep);
}

function drawnPart(part, body, id = "") {
  const named = part.id || id;
  if (part.type === "shape") return { ...part, body: part.body || body, ...(named ? { id: named } : {}) };
  return {
    type: "sphere",
    origin: part.at || part.origin,
    radius: part.radius,
    color: part.color,
    reflectivity: 0.03,
    body,
    ...(named ? { id: named } : {}),
    ...(part.tile ? { tile: part.tile } : {}),
  };
}

export function pictureCamera({ feet, yaw, pitch, crouch = false, tick = 0, sunTick = null, width = 1, height = 1, view = "first", cameraOrigin = null, cameraDir = null, fov = 70 }) {
  const eye = eyeHeight(crouch);
  const sun = sunDirection(sunTick == null ? tick : sunTick);
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
    camera: {
      origin,
      dir,
      fov,
      aspect: width / height,
      planeDistance: 1,
    },
  };
}

export function buildScene({ feet, yaw, pitch, crouch = false, tick = 0, sunTick = null, atoll, crust, pieces = [], width, height, view = "first", self = true, others = [], cameraOrigin = null, cameraDir = null, fov = 70, smoke = null, swarm = null, pools = [], bolts = [], loose = [], lean = 0, sparse = false, stride = 0, gait = 0, worn = null, down = [], helpers = [] }) {
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
    for (const part of floraParts(tick * 1000 / 30, sunTick == null ? tick : sunTick)) objects.push(drawnPart(part, "flora"));
    for (const part of bankParts(feet, tick * 1000 / 30)) objects.push(drawnPart(part, "flora"));
  }
  for (const animal of fauna(Date.now(), feet, { parts: !sparse })) {
    if (animal.id && down.includes(animal.id)) continue;
    const parts = !sparse && animal.parts?.length ? animal.parts : [animal];
    for (const part of parts) objects.push(drawnPart(part, animal.kind, animal.id));
  }
  for (const person of PEOPLE) {
    const z = duneHeight(person.at[0], person.at[1]);
    const fallen = down.includes(person.id);
    const figure = playerParts([person.at[0], person.at[1], z], person.yaw, fallen, {
      self: false,
      color: person.color,
      body: "person",
      id: person.id,
      name: person.name,
      detail: person.detail,
      speech: person.speech,
      gait: tick * 0.06 + person.at[0] * 0.15,
      stride: 0.05,
      worn: person.worn,
    });
    for (const part of (sparse ? coarse(figure) : figure)) objects.push(part);
  }
  const dummy = atoll.placements.dummy;
  const dummyAt = [dummy.x / 100, dummy.y / 100, 0];
  const dummyFigure = sparse
    ? [{ origin: [dummyAt[0], dummyAt[1], 0.9], radius: 0.35, color: [0.86, 0.22, 0.18, 1], texture: true }]
    : dummyParts(dummyAt, tick * 1000 / 30);
  for (const part of dummyFigure) {
    if (part.type === "shape") {
      objects.push(part);
      continue;
    }
    objects.push({
      type: "sphere",
      origin: part.origin,
      radius: part.radius,
      color: part.color,
      reflectivity: part.texture ? 0.4 : 0.08,
      body: "dummy",
      ...(part.tile ? { tile: part.tile } : {}),
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
      tile: "metal",
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
      tile: "rock",
    });
  }
  for (const helper of helpers) {
    if (helper?.x == null || helper?.y == null) continue;
    const z = standHeight(helper.x, helper.y);
    for (const part of helperParts(helper, z)) objects.push(part);
  }
  if (view === "third" && self) {
    const figure = playerParts(feet, yaw + (lean || 0), crouch, { self: true, gait, stride: crouch ? Math.min(stride, 0.2) : stride, worn });
    for (const part of (sparse ? coarse(figure) : figure)) objects.push(part);
  }
  for (const other of others) {
    const moving = other.walk ? 0.9 : 0.05;
    const phase = other.walk ? (other.feet[0] + other.feet[1]) * 1.7 : tick * 0.07;
    const figure = playerParts(other.feet, other.yaw, !!other.crouch, {
      self: false,
      body: "player",
      id: other.id,
      color: other.color || OTHER,
      gait: phase,
      stride: other.crouch ? 0.12 : moving,
      worn: other.worn || ["cloth"],
    });
    for (const part of (sparse ? coarse(figure) : figure)) objects.push(part);
  }
  return {
    ...pictureCamera({ feet, yaw, pitch, crouch, tick, sunTick, width, height, view, cameraOrigin, cameraDir, fov }),
    objects: orderForCamera(objects, feet),
  };
}
