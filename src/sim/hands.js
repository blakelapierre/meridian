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
  // A roll out of a tucked landing keeps the speed you landed with while it lasts.
  const rolled = !airborne && input.roll > 0 ? Math.max(speed, input.roll) : speed;
  const wish = wishPlanar(input.yaw, input.forward || 0, input.strafe || 0, rolled);
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

// Roll out of a tucked landing: ROLL_TICKS of the landing speed (capped at sprint pace).
export const ROLL_TICKS = 18;
export function startRoll(tuck, velocity, tick) {
  if (!tuck) return null;
  const speed = Math.min(9, Math.hypot(velocity?.[0] || 0, velocity?.[1] || 0));
  return speed > 2.2 ? { until: tick + ROLL_TICKS, speed } : null;
}
export function rollSpeed(roll, tick) {
  return roll && tick < roll.until ? roll.speed : 0;
}

// Stance on the wire: a tuck or a roll is a crouch peers draw. Sent on change and as a slow refresh.
export const STANCE_REFRESH = 90;
export function stanceMessage(crouch) {
  return JSON.stringify({ t: "stance", crouch: !!crouch });
}
export function readStance(text) {
  try {
    const m = JSON.parse(typeof text === "string" ? text : new TextDecoder().decode(text));
    return m?.t === "stance" ? { crouch: m.crouch === true } : null;
  } catch {
    return null;
  }
}
export function stanceDue(crouch, last, tick) {
  return !last || last.crouch !== !!crouch || tick - last.tick >= STANCE_REFRESH;
}
