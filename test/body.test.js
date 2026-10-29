import assert from "node:assert/strict";
import test from "node:test";
import { bindHearth, canLoot, craftHearth, createPerson, stepBody, wildernessDeath } from "../src/sim/body.js";

test("a wilderness death drops the bit and a stranger waits 60 s", () => {
  const person = createPerson([1, 2, 0]);
  const corpse = wildernessDeath(person, 1000);
  assert.equal(person.carried.length, 0);
  assert.equal(corpse.carried.find((item) => item.id === "bit").n, 1);
  assert.equal(person.integrity, 40);
  assert.equal(person.blood, 50);
  assert.equal(person.limbs.legL, 70);
  assert.equal(person.pain, 40);
  assert.equal(canLoot(corpse, 1000 + 60 * 30 - 1, false), false);
  assert.equal(canLoot(corpse, 1000 + 60 * 30, false), true);
  assert.equal(canLoot(corpse, 1000, true), true);
});

test("the hearth craft binds and the recall returns the bruised body", () => {
  const person = createPerson([3, -150, 0]);
  assert.equal(craftHearth(person, { footingOwned: false, ticks: 20 * 30 }), false);
  assert.equal(craftHearth(person, { footingOwned: true, ticks: 20 * 30 - 1 }), false);
  assert.equal(craftHearth(person, { footingOwned: true, ticks: 20 * 30 }), true);
  assert.equal(person.carried.find((item) => item.id === "metal").n, 10);
  assert.equal(person.carried.find((item) => item.id === "stone").n, 0);
  bindHearth(person, "yard", [0, -140, 0]);
  person.position = [4, -20, 0];
  wildernessDeath(person, 0);
  assert.equal(person.recall, 12 * 30);
  stepBody(person, 12 * 30);
  assert.deepEqual(person.position, [0, -140, 0]);
  person.position = [9, 9, 0];
  wildernessDeath(person, 1);
  stepBody(person, 12 * 30);
  assert.deepEqual(person.position, [9, 9, 0]);
});
