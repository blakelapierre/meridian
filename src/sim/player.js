import { Mass, createUniverse, tick } from "../engine/physics.js";

export const GAME_TICKS_PER_STEP = 30;
export const STOP_ACCEL = 36.25;

export function createPlayer(position = [0, 0, 0], velocity = [0, 0, 0]) {
  const body = new Mass(80, [210, 180, 140, 255], position, velocity);
  body.policy = "separate";
  body.size = 0.35;
  body.collisionSize = 0.35;
  return body;
}

export function createPlayerWorld(player) {
  return createUniverse([player], {
    ticksPerStep: GAME_TICKS_PER_STEP,
    gravityConstant: 0,
    stepsPerSecond: GAME_TICKS_PER_STEP,
  });
}

export function stepPlayer(state, player, acceleration) {
  player.acceleration[0] = acceleration[0];
  player.acceleration[1] = acceleration[1];
  player.acceleration[2] = acceleration[2];
  tick(state);
  if (player.position[2] < 0) {
    player.position[2] = 0;
    if (player.velocity[2] < 0) player.velocity[2] = 0;
  }
}
