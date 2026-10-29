import { Crust } from "../sim/crust.js";
import { pieceBoxes } from "../sim/build.js";
import { lookDirection } from "../sim/hands.js";
import { sunDirection } from "../sim/sun.js";
import { dummyTexture } from "./texture.js";

const WOOD = [0.42, 0.3, 0.18, 1];
const DUMMY = [0.86, 0.22, 0.18, 1];

export function eyeHeight(crouch) {
  return crouch ? 1.1 : 1.65;
}

export function buildScene({ feet, yaw, pitch, crouch = false, tick = 0, atoll, crust, pieces = [], width, height }) {
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
      color: WOOD,
      reflectivity: 0.08,
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
  const day = sun[2] > 0 ? 0.15 + sun[2] * 0.85 : 0.08;
  return {
    sun,
    miss: [0.42 * day, 0.58 * day, 0.82 * day, 1],
    objects,
    camera: {
      origin: [feet[0], feet[1], feet[2] + eye],
      dir: lookDirection(yaw, pitch),
      fov: 70,
      aspect: width / height,
      planeDistance: 1,
    },
  };
}
