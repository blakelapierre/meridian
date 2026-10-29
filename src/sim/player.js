import { Mass, createUniverse, tick } from "../engine/physics.js";

export const GAME_TICKS_PER_STEP = 30;
export const STOP_ACCEL = 36.25;
export const JUMP_ACCEL = 147.4914;
export const TANGENT_GRAVITY = -9.81;

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

export function stepPlayer(state, player, acceleration, jump = false, impulse = null) {
  const gravity = state.tangentGravity || 0;
  const lift = impulse == null ? (jump ? JUMP_ACCEL : 0) : impulse;
  player.acceleration[0] = acceleration[0];
  player.acceleration[1] = acceleration[1];
  player.acceleration[2] = acceleration[2] + gravity + lift;
  tick(state);
  if (player.position[2] < 0) {
    player.position[2] = 0;
    if (player.velocity[2] < 0) player.velocity[2] = 0;
  }
}

export function createStamina() {
  return { value: 100, debt: 0, credit: 0, wait: 0, locked: false };
}

export function stepStamina(pool, { sprint = false, jump = false } = {}) {
  if (jump) pool.value = Math.max(0, pool.value - 12);
  if (sprint) {
    pool.wait = 0;
    pool.credit = 0;
    if (pool.value > 0 && !pool.locked) {
      pool.debt += 14;
      while (pool.debt >= 30 && pool.value > 0) {
        pool.debt -= 30;
        pool.value -= 1;
      }
    }
  } else if (!jump) {
    pool.debt = 0;
    pool.wait += 1;
    if (pool.wait > 18) {
      pool.credit += 20;
      while (pool.credit >= 30 && pool.value < 100) {
        pool.credit -= 30;
        pool.value += 1;
      }
    }
  } else {
    pool.wait = 0;
    pool.credit = 0;
  }
  if (pool.value <= 0) {
    pool.value = 0;
    pool.locked = true;
  }
  if (pool.locked && pool.value >= 20) pool.locked = false;
}

export function runSpeed(skill = 0) {
  const trained = Math.max(0, Math.min(140, skill));
  return 6.6 * (1 + 0.35 * trained / 140);
}

export function wishSpeed(pool, { crouch = false, sprint = false, run = 0, limp = 1 } = {}) {
  const factor = typeof limp === "number" ? limp : 1;
  const heavy = factor <= 0.4;
  const base = crouch ? 2.2 : !heavy && sprint && !pool.locked && pool.value > 0 ? runSpeed(run) : 4.4;
  return base * factor;
}
