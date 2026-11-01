import { lookDirection } from "./hands.js";

export function bitAim(feet, yaw, pitch, crouch = false) {
  const eye = [
    Math.round(feet[0] * 100),
    Math.round(feet[1] * 100),
    Math.round((feet[2] + (crouch ? 1.1 : 1.65)) * 100),
  ];
  const look = lookDirection(yaw, pitch);
  return {
    eye,
    aim: eye.map((value, index) => Math.round(value + look[index] * 150)),
  };
}

// The walkable dunes (life.js duneHeight) sit on top of the flat voxel crust (surface z = 0), so a
// player standing on a dune crest could not reach the crust with the bit: dig was dead at spawn.
// Aim in crust space instead: on the dunes, the feet count as standing on the crust surface; in a
// dug pit (floor below 0) the body is already in crust space.
export function crustFeet(position, dune = 0, floor = 0) {
  if (floor < -0.01) return position;
  return [position[0], position[1], position[2] - dune];
}
