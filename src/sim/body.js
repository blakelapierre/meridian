const HZ = 30;

export function createPerson(position = [0, -150, 0]) {
  return {
    position: position.slice(),
    integrity: 100,
    blood: 100,
    pain: 0,
    limbs: { armL: 100, armR: 100, legL: 100, legR: 100 },
    carried: [
      { id: "bit", n: 1 },
      { id: "metal", n: 30 },
      { id: "stone", n: 8 },
    ],
    bound: null,
    recall: 0,
    cooldown: 0,
  };
}

function stack(person, id) {
  return person.carried.find((item) => item.id === id);
}

export function craftHearth(person, { footingOwned = false, ticks = 0 } = {}) {
  const metal = stack(person, "metal");
  const stone = stack(person, "stone");
  if (!footingOwned || !metal || metal.n < 20 || !stone || stone.n < 8) return false;
  if (ticks < 20 * HZ) return false;
  metal.n -= 20;
  stone.n -= 8;
  person.carried.push({ id: "hearth-stone", n: 1 });
  return true;
}

export function bindHearth(person, id, at) {
  person.bound = { id, at: at.slice() };
}

export function wildernessDeath(person, tick) {
  const corpse = {
    tick,
    at: person.position.slice(),
    carried: person.carried.map((item) => ({ ...item })),
  };
  person.carried = [];
  person.integrity = 40;
  person.blood = 50;
  person.pain = 40;
  person.limbs = { armL: 70, armR: 70, legL: 70, legR: 70 };
  person.recall = person.bound && person.cooldown === 0 ? 12 * HZ : 0;
  return corpse;
}

export function stepBody(person, ticks = 1) {
  for (let i = 0; i < ticks; i++) {
    if (person.cooldown > 0) person.cooldown -= 1;
    if (person.recall > 0) {
      person.recall -= 1;
      if (person.recall === 0 && person.bound) {
        person.position = person.bound.at.slice();
        person.cooldown = 10 * 60 * HZ;
      }
    }
  }
}

export function canLoot(corpse, tick, fellowship = false) {
  if (fellowship) return true;
  return tick - corpse.tick >= 60 * HZ;
}
