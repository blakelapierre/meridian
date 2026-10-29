export const STRIKE_HEALTH = 100;

export const WEAPONS = {
  line: { id: "line", chest: 28, headMul: 4, pen: 40 },
  clinch: { id: "clinch", chest: 22, headMul: 3, pen: 10 },
  rasp: { id: "rasp", chest: 17, headMul: 2.6, pen: 10 },
  buck: { id: "buck", chest: 14, headMul: 2, pen: 10, pellets: 8 },
  spire: { id: "spire", chest: 72, headMul: 2.5, pen: 70 },
  mallet: { id: "mallet", chest: 55, headMul: 1.8, pen: 10 },
};

const HITBOX = { head: null, chest: 1, stomach: 1, arm: 0.85, leg: 0.75 };

export function strikeDamage(weapon, hitbox, armor = null) {
  let damage = weapon.chest;
  if (hitbox === "head") damage *= weapon.headMul;
  else damage *= HITBOX[hitbox];
  if (armor === "helm" && hitbox === "head") damage *= 0.6;
  if ((armor === "vest" || armor === "plate") && (hitbox === "chest" || hitbox === "stomach")) {
    damage *= armor === "vest" ? 0.7 : 0.55;
  }
  return damage;
}

export function healthAfter(start, shots) {
  return shots.reduce((health, shot) => health - strikeDamage(shot.weapon, shot.hitbox, shot.armor), start);
}
