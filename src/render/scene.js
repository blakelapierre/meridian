import { Crust } from "../sim/crust.js";
import { pieceBoxes } from "../sim/build.js";
import { chaseOrigin, playerParts } from "../sim/body.js";
import { lookDirection } from "../sim/hands.js";
import { sunDirection } from "../sim/sun.js";
import { dummyTexture } from "./texture.js";
import { fauna, floraBoxes } from "../sim/life.js?v=69";

const WOOD = [0.42, 0.3, 0.18, 1];
const DUMMY = [0.86, 0.22, 0.18, 1];
const OTHER = [0.55, 0.42, 0.22, 1];

export function eyeHeight(crouch) {
  return crouch ? 1.1 : 1.65;
}

export function buildScene({ feet, yaw, pitch, crouch = false, tick = 0, atoll, crust, pieces = [], width, height, view = "first", self = true, others = [], cameraOrigin = null, cameraDir = null, fov = 70, smoke = null, swarm = null, pools = [], bolts = [], lean = 0 }) {
  const eye = eyeHeight(crouch);
  const sun = sunDirection(tick);
  const objects = [];
  if (crust !== false) {
    objects.push({ type: "crust", field: crust || new Crust(atoll.worldSeed, atoll.cellId) });
  }
  for (const box of pieceBoxes(pieces)) objects.push(box);
  for (const prop of atoll.props) {
    const box = prop.box;
    objects.push({
      type: "box",
      min: [box.min.x / 100, box.min.y / 100, box.min.z / 100],
      max: [box.max.x / 100, box.max.y / 100, box.max.z / 100],
      color: prop.material === "paper" ? [0.86, 0.82, 0.7, 1] : WOOD,
      reflectivity: 0.08,
      id: prop.id,
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
  for (const box of floraBoxes()) objects.push(box);
  for (const animal of fauna(Date.now(), feet)) {
    objects.push({
      type: "sphere",
      origin: animal.at,
      radius: animal.radius,
      color: animal.color,
      reflectivity: 0.02,
      body: animal.kind,
    });
  }
  const dummy = atoll.placements.dummy;
  objects.push({
    type: "sphere",
    origin: [dummy.x / 100, dummy.y / 100, 0.9],
    radius: 0.35,
    color: DUMMY,
    reflectivity: 0.45,
    body: "dummy",
    texture: dummyTexture(),
  });
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
  if (view === "third" && self) {
    for (const part of playerParts(feet, yaw + (lean || 0), crouch, { self: true })) objects.push(part);
  }
  for (const other of others) {
    for (const part of playerParts(other.feet, other.yaw, !!other.crouch, { self: false, color: other.color || OTHER })) objects.push(part);
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
    objects,
    camera: {
      origin,
      dir,
      fov,
      aspect: width / height,
      planeDistance: 1,
    },
  };
}
