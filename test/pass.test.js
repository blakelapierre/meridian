import assert from "node:assert/strict";
import test from "node:test";
import { createVitals } from "../src/sim/hearth.js";
import { toggleDoor, tryPlaceDoor, tryPlaceRoad, createYard } from "../src/sim/build.js";
import {
  authority,
  bandage,
  blastPush,
  charterReady,
  clockName,
  companyWallet,
  crackGain,
  finGain,
  resonanceWord,
  soldierTarget,
  socketOf,
  dominionOpen,
  spendLogistics,
  spoilCap,
} from "../src/sim/rules.js";

test("the third pass of the notes is a set of small rules", () => {
  const vitals = createVitals();
  vitals.blood = 40;
  assert.equal(bandage(vitals, 1), true);
  assert.equal(vitals.blood, 55);
  assert.equal(bandage(vitals, 0), false);
  assert.equal(spoilCap(0), 4);
  assert.equal(spoilCap(40), 6);
  const shove = blastPush([0, 0], [1, 0]);
  assert.ok(shove[0] > 0);
  assert.deepEqual(blastPush([0, 0], [10, 0]), [0, 0, 0]);
  assert.equal(crackGain(10), 1);
  assert.equal(crackGain(80), 0.25);
  assert.ok(crackGain(50) < 1 && crackGain(50) > 0.25);
  assert.equal(finGain(1), 0.6);
  assert.equal(charterReady(2, [0, 0]), true);
  assert.equal(charterReady(1, [0, 0]), false);
  assert.equal(companyWallet(), 0);
  assert.equal(spendLogistics(0, 1), false);
  assert.equal(authority(["a", "b"], 3), "b");
  assert.equal(clockName(false), "hands");
  assert.equal(clockName(true), "strike");
  assert.equal(resonanceWord(20), "resonance");
  assert.equal(resonanceWord(3), "");
  assert.equal(soldierTarget(false, { width: 100 }, { width: 10 }).width, 10);
  vitals.left = 40;
  assert.equal(bandage(vitals, 1), true);
  assert.equal(vitals.left, 60);
  assert.equal(socketOf("pose"), "snap");
  assert.equal(socketOf("edit"), "ops");
  assert.equal(dominionOpen(), false);
  const yard = createYard({ x: 0, y: 0 }, 10);
  assert.equal(tryPlaceRoad(yard, [1, 0]).ok, true);
  assert.equal(tryPlaceDoor(yard, [2, 0]).ok, true);
  assert.equal(toggleDoor(yard, [2, 0]).open, true);
});
