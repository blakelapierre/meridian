import { cast } from "../engine/cast.js";
import { WEAPONS, strikeDamage } from "./damage.js";
import { coneRadians, shotDirection } from "./shot.js";

export const LINE = {
  id: "line",
  spreadMrad: 1.2,
  moveSpread: 2.5,
  airSpread: 4,
};

export function createDummy() {
  return { health: 100, quiet: 0 };
}

export function stepDummy(dummy) {
  if (dummy.health >= 100) return dummy;
  dummy.quiet += 1;
  if (dummy.quiet >= 150) dummy.health = 100;
  return dummy;
}

export function classifyDummy(hit) {
  if (!hit?.object || hit.object.body !== "dummy") return null;
  return hit.point[2] >= 1.05 ? "head" : "chest";
}

export function applyDummyHit(dummy, hitbox) {
  const damage = strikeDamage(WEAPONS.line, hitbox);
  dummy.health = Math.max(0, dummy.health - damage);
  dummy.quiet = 0;
  return { damage, health: dummy.health, hitbox };
}

export function resolveShot({ eye, forward, speed, airborne, seed, objects }) {
  const dir = shotDirection(forward, coneRadians(LINE, speed, airborne), seed);
  const hit = cast(eye, dir, objects);
  return { dir, hit, hitbox: classifyDummy(hit) };
}
