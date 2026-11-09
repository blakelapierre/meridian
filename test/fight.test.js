import assert from "node:assert/strict";
import test from "node:test";
import { createYard, pieceBoxes, trySalvage } from "../src/sim/build.js";
import { applyBlow, beastBite, classifyStrike, lineBlow, strikeQuarry } from "../src/sim/fight.js";
import { blowMessage, harmMessage, readHarmMessage } from "../src/sim/identityharm.js";
import { createVitals } from "../src/sim/hearth.js";
import { fauna } from "../src/sim/life.js";

test("a line tells a player from a beast, and a beast wreck is not the dummy", () => {
  const player = classifyStrike({ object: { body: "player", id: "ada", type: "sphere", radius: 0.1 }, point: [0, 0, 2] });
  assert.equal(player.kind, "player");
  assert.equal(player.hitbox, "head");
  assert.equal(lineBlow("head"), 112);
  const crab = classifyStrike({ object: { body: "crab", id: "crab", type: "sphere", radius: 0.1 }, point: [0, 0, 0.2] });
  assert.equal(crab.kind, "beast");
  assert.equal(classifyStrike({ object: { body: "flora" } }), null);
  const quarry = {};
  assert.equal(strikeQuarry(quarry, "crab", lineBlow("chest"), 0).wreck, false);
  const dead = strikeQuarry(quarry, "crab", lineBlow("chest"), 1000);
  assert.equal(dead.wreck, true);
  assert.equal(dead.spec.metal, 3);
  assert.notEqual(dead.spec.metal, 12);
  assert.equal(beastBite("crab", 1.2), 12);
  assert.equal(beastBite("crab", 4), 0);
  assert.equal(beastBite("gull", 0.2), 0);
});

test("a blow drops a body, and the harm line names its target", () => {
  const vitals = createVitals();
  assert.equal(applyBlow(vitals, 40).dead, false);
  assert.equal(vitals.integrity, 60);
  assert.equal(applyBlow(vitals, 80).dead, true);
  assert.equal(vitals.down, 8);
  const blow = readHarmMessage(blowMessage("ada", "bea", 28, 4));
  assert.equal(blow.what, "blow");
  assert.equal(blow.target, "bea");
  assert.equal(blow.amount, 28);
  assert.equal(blow.sig, 4);
  const old = readHarmMessage(harmMessage("ada", "lore", 3));
  assert.equal(old.sig, 3);
  assert.equal(old.amount, 0);
  assert.equal(old.target, "");
});

test("a carcass salvages less than the dummy wreck", () => {
  const yard = createYard({ x: 0, y: 0 });
  const cell = [4, 5];
  yard.pieces.push({ id: "carcass", at: cell, metal: 3 });
  const before = yard.metal;
  assert.equal(trySalvage(yard, cell).ok, true);
  assert.equal(yard.metal - before, 3);
  yard.pieces.push({ id: "wreck", at: [6, 5] });
  const wrecked = yard.metal;
  assert.equal(trySalvage(yard, [6, 5]).ok, true);
  assert.equal(yard.metal - wrecked, 12);
  const box = pieceBoxes([{ id: "carcass", at: cell }])[0];
  assert.ok(box.max[2] < 0.3, box.max[2]);
  const animals = fauna(0, [80, 80], { parts: false });
  assert.equal(animals.find((animal) => animal.kind === "crab").id, "crab");
  assert.equal(animals.filter((animal) => animal.id?.startsWith("goat:")).length, 3);
});
