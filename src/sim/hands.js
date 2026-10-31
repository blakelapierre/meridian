import { stepPlayer, stepStamina, STOP_ACCEL, wishSpeed } from "./player.js";
import { stepLift } from "./jump.js?v=58";

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

export function moveIntent({ forward = 0, back = 0, sprint = false, auto = false } = {}) {
  const running = auto && back <= 0;
  const ahead = running ? 1 : forward;
  return {
    forward: ahead - (back > 0 ? 1 : 0),
    sprint: sprint || running,
    auto: running,
  };
}

export function stepHands(world, player, stamina, input, jump = null, jumpSkill = 0) {
  const ground = world.ground || 0;
  const airborne = player.position[2] > ground + 0.12;
  const speed = airborne ? 4.4 : wishSpeed(stamina, {
    sprint: input.sprint,
    crouch: input.crouch,
    run: input.run || 0,
    agility: input.agility || 0,
    limp: typeof input.limp === "number" ? input.limp : 1,
  });
  const wish = wishPlanar(input.yaw, input.forward || 0, input.strafe || 0, speed);
  const accel = controlAcceleration(player.velocity, wish, airborne ? AIR_ACCEL : STOP_ACCEL);
  const running = !airborne && !!input.sprint && !input.crouch && speed > 5;
  if (!jump) {
    const leaving = !airborne && input.jump && stamina.value >= 12;
    stepStamina(stamina, { sprint: !airborne && input.sprint, jump: leaving, wind: input.wind || 0 });
    stepPlayer(world, player, accel, leaving);
    return { jump: leaving, speed, running };
  }
  return { ...stepLift(world, player, stamina, input, jump, jumpSkill, accel, airborne), speed, running };
}
