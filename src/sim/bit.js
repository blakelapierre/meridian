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
