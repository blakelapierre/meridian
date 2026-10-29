import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createIdentity } from "../src/net/identity.js";
import { acceptPiece, encodePiece } from "../src/net/pieces.js";
import { createYard, footingCell } from "../src/sim/build.js";
import { DAY_TICKS, dayWord } from "../src/sim/sun.js";
import {
  adoptPiece,
  bindHearth,
  bruise,
  clubHit,
  coolPain,
  craftNeed,
  createVitals,
  finOutput,
  limpFactor,
  recallPoint,
  stepDown,
  tryFinishFin,
  tryFinishHearth,
} from "../src/sim/hearth.js";

const atoll = JSON.parse(readFileSync(new URL("../content/atoll.json", import.meta.url)));

test("a hearth is crafted from the crate, bound, and recalls a bruised body", () => {
  const yard = createYard(atoll.placements.footing);
  yard.stone = 8;
  const cell = footingCell(atoll.placements.footing);
  assert.ok(craftNeed(0) > craftNeed(140));
  assert.equal(tryFinishHearth(yard, cell).ok, true);
  assert.equal(yard.metal, 10);
  assert.equal(yard.stone, 0);
  assert.equal(tryFinishHearth(yard, cell).reason, "have");
  assert.equal(bindHearth(yard, cell).ok, true);
  const back = recallPoint(yard, [0, -150, 0]);
  assert.ok(Math.abs(back[0] - cell[0] * 0.5) < 0.01);
  const vitals = createVitals();
  assert.equal(clubHit(vitals, 4).dead, false);
  assert.equal(clubHit(vitals, 2).dead, true);
  assert.equal(stepDown(vitals, 8), true);
  bruise(vitals);
  assert.equal(vitals.integrity, 40);
  assert.equal(vitals.blood, 50);
  assert.equal(vitals.left, 70);
  assert.equal(vitals.right, 70);
  assert.equal(limpFactor(vitals), 1);
  vitals.left = 40;
  assert.equal(limpFactor(vitals), 0.6);
  vitals.right = 40;
  assert.equal(limpFactor(vitals), 0.35);
  vitals.pain = 40;
  coolPain(vitals, 1);
  assert.equal(vitals.pain, 35);
  assert.equal(dayWord(DAY_TICKS / 4), "noon");
  assert.equal(dayWord(0), "dawn");
  assert.equal(dayWord(Math.floor(DAY_TICKS * 0.55)), "dusk");
});

test("the solar fin spends metal and makes more flux at noon", () => {
  const yard = createYard(atoll.placements.footing);
  yard.fins = 1;
  const cell = footingCell(atoll.placements.footing);
  assert.equal(tryFinishFin(yard, cell).ok, true);
  assert.equal(yard.metal, 22);
  const frame = encodePiece(createIdentity(), { nonce: 4.8, cell, id: "fin" });
  const accepted = acceptPiece(frame);
  assert.equal(accepted.id, "fin");
  assert.equal(adoptPiece(createYard(atoll.placements.footing), accepted.cell, accepted.id).ok, true);
  assert.ok(finOutput(DAY_TICKS / 4) > finOutput(0));
});
