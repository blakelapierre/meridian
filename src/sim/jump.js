import { JUMP_ACCEL, stepPlayer, stepStamina } from "./player.js";

export const BASE_APEX = 1.15;
export const HOP_APEX = 0.4;
export const LIFT_ACCEL = 28;

export function jumpAbility(skill) {
  const trained = Math.max(0, Math.min(140, skill));
  return BASE_APEX * (1 + trained / 140);
}

export function impulseForApex(apex) {
  return JUMP_ACCEL * Math.sqrt(Math.max(apex, 0.05) / BASE_APEX);
}

export function createJump() {
  return { lift: false, spent: false };
}

export function stepLift(world, player, stamina, input, jump, skill, acceleration, airborne) {
  const ground = world.ground || 0;
  const altitude = player.position[2] - ground;
  const cap = jumpAbility(skill);
  const sprint = !airborne && input.sprint;
  if (!airborne && !input.jump) jump.spent = false;
  let launched = false;
  let impulse = 0;
  if (!airborne && input.jump && !jump.spent && stamina.value >= 12) {
    impulse = impulseForApex(Math.min(HOP_APEX, cap));
    jump.lift = true;
    jump.spent = true;
    launched = true;
  } else if (airborne && input.jump && jump.lift && altitude < cap && player.velocity[2] > 0) {
    impulse = LIFT_ACCEL;
  } else if (!input.jump) {
    jump.lift = false;
  }
  stepStamina(stamina, { sprint, jump: launched, wind: input.wind || 0 });
  stepPlayer(world, player, acceleration, false, impulse);
  if (jump.lift && player.position[2] - ground > cap) {
    player.position[2] = ground + cap;
    if (player.velocity[2] > 0) player.velocity[2] = 0;
    jump.lift = false;
  }
  return { jump: launched, apex: cap, lift: jump.lift };
}
