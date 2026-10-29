import { stepPlayer, stepStamina, STOP_ACCEL, wishSpeed } from "./player.js";

const AIR_ACCEL = 12;

export function lookDirection(yaw, pitch) {
  const level = Math.cos(pitch);
  return [Math.sin(yaw) * level, Math.cos(yaw) * level, Math.sin(pitch)];
}

export function wishPlanar(yaw, forward, strafe, speed) {
  const x = forward * Math.sin(yaw) + strafe * Math.cos(yaw);
  const y = forward * Math.cos(yaw) - strafe * Math.sin(yaw);
  const length = Math.hypot(x, y);
  if (length < 1e-8 || speed <= 0) return [0, 0, 0];
  return [(x / length) * speed, (y / length) * speed, 0];
}

export function controlAcceleration(velocity, wish, cap) {
  const dx = wish[0] - velocity[0];
  const dy = wish[1] - velocity[1];
  const need = Math.hypot(dx, dy);
  if (need < 1e-8) return [0, 0, 0];
  const scale = Math.min(cap, need * 30) / need;
  return [dx * scale, dy * scale, 0];
}

export function stepHands(world, player, stamina, input) {
  const airborne = player.position[2] > 0.02;
  const speed = airborne ? 4.4 : wishSpeed(stamina, { sprint: input.sprint, crouch: input.crouch });
  const wish = wishPlanar(input.yaw, input.forward || 0, input.strafe || 0, speed);
  const accel = controlAcceleration(player.velocity, wish, airborne ? AIR_ACCEL : STOP_ACCEL);
  const jump = !airborne && input.jump && stamina.value >= 12;
  stepStamina(stamina, { sprint: !airborne && input.sprint, jump });
  stepPlayer(world, player, accel, jump);
  return { jump, speed };
}
