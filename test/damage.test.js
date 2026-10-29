import assert from "node:assert/strict";
import test from "node:test";
import { STRIKE_HEALTH, WEAPONS, healthAfter, strikeDamage } from "../src/sim/damage.js";

test("line damage matches the game table", () => {
  const line = WEAPONS.line;
  assert.equal(strikeDamage(line, "head"), 112);
  assert.equal(strikeDamage(line, "head", "helm"), 67.2);
  assert.equal(Math.round(strikeDamage(line, "head", "helm")), 67);
  const afterThreeChest = healthAfter(STRIKE_HEALTH, [
    { weapon: line, hitbox: "chest" },
    { weapon: line, hitbox: "chest" },
    { weapon: line, hitbox: "chest" },
  ]);
  assert.equal(afterThreeChest, 16);
  assert.ok(healthAfter(STRIKE_HEALTH, [
    { weapon: line, hitbox: "chest" },
    { weapon: line, hitbox: "chest" },
    { weapon: line, hitbox: "chest" },
    { weapon: line, hitbox: "chest" },
  ]) <= 0);
});
