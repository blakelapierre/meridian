import { WEAPONS, strikeDamage } from "./damage.js";

// Beach fighting. A blow is a number on the body. Cloth and a plate do not soak it.
// A beast that drops leaves a carcass, which is not the practice dummy.

export const BEASTS = {
  crab: { health: 46, bite: 12, reach: 1.7, metal: 3, back: 40000 },
  skink: { health: 28, bite: 6, reach: 1.35, metal: 1, back: 40000 },
  gull: { health: 20, bite: 0, reach: 0, metal: 1, back: 40000 },
};

const FOLK = { health: 70, bite: 0, reach: 0, metal: 0, back: 20000 };
const GOAT = { health: 55, bite: 0, reach: 0, metal: 4, back: 50000 };

export function beastSpec(id) {
  if (!id) return null;
  if (id.startsWith("goat:")) return GOAT;
  if (id === "pell" || id === "hask" || id === "nim") return FOLK;
  return BEASTS[id] || null;
}

export function classifyStrike(hit) {
  const object = hit?.object;
  if (!object?.body || object.body === "self" || object.body === "flora") return null;
  if (object.body === "dummy") {
    return { kind: "dummy", id: "dummy", hitbox: hit.point?.[2] >= 1.05 ? "head" : "chest" };
  }
  if (object.body === "player" || object.body === "person") {
    const head = object.type === "sphere" && (object.radius || 0) >= 0.08;
    return { kind: object.body === "person" ? "person" : "player", id: object.id || object.body, hitbox: head ? "head" : "chest" };
  }
  if (object.body === "crab" || object.body === "skink" || object.body === "gull" || object.body === "graze") {
    return { kind: "beast", id: object.id || (object.body === "graze" ? "goat:0" : object.body), hitbox: "body" };
  }
  return null;
}

export function lineBlow(hitbox) {
  const box = hitbox === "body" ? "chest" : hitbox;
  return Math.round(strikeDamage(WEAPONS.line, box));
}

export function applyBlow(vitals, amount) {
  const dealt = Math.max(0, Math.min(120, Number(amount) || 0));
  if (!vitals || !(dealt > 0)) return { downed: false, dead: false, dealt: 0 };
  if (vitals.down > 0) return { downed: true, dead: false, dealt: 0 };
  vitals.integrity = Math.max(0, vitals.integrity - dealt);
  vitals.blood = Math.max(0, vitals.blood - dealt * 0.4);
  vitals.pain = Math.min(100, (vitals.pain || 0) + dealt * 0.25);
  if (vitals.integrity > 0) return { downed: false, dead: false, dealt };
  vitals.down = 8;
  return { downed: true, dead: true, dealt };
}

export function beastBite(id, distance) {
  const spec = beastSpec(id);
  if (!spec?.bite || !(distance >= 0) || distance > spec.reach) return 0;
  return spec.bite;
}

export function strikeQuarry(quarry, id, damage, now = 0) {
  const spec = beastSpec(id);
  if (!spec) return null;
  const row = quarry[id] || { health: spec.health, wreck: false, dropped: false, back: 0 };
  if (row.wreck) return { ...row, fresh: false, damage: 0, spec };
  row.health = Math.max(0, row.health - Math.max(0, damage));
  row.wreck = row.health <= 0;
  if (row.wreck) row.back = now + spec.back;
  quarry[id] = row;
  return { ...row, fresh: true, damage, spec };
}

export function riseQuarry(quarry, now) {
  const risen = [];
  for (const [id, row] of Object.entries(quarry)) {
    if (!row.wreck || !row.back || now < row.back) continue;
    delete quarry[id];
    risen.push(id);
  }
  return risen;
}
