import assert from "node:assert/strict";
import test from "node:test";
import { createIdentity } from "../src/net/identity.js";
import { acceptLore, encodeLore } from "../src/net/lore.js";
import { createSurvey } from "../src/sim/map.js";
import { friendTier, learnLore, nextFriend, offerLore, packLore, shareRange, unpackLore } from "../src/sim/lore.js";
import { createPlate, GEO_COLOR, samplePlate, stamp, toldTint } from "../src/sim/plate.js";

test("nearby players trade map findings by skill and friendliness", () => {
  assert.ok(shareRange({ mapping: 70, appraisal: 70 }) > shareRange({}));
  assert.equal(friendTier(0), "stranger");
  assert.equal(friendTier(-1), "hostile");
  assert.equal(friendTier(nextFriend(11, true)), "acquaintance");
  const known = {
    ground: [{ kind: "sand", point: [1, -150, 0] }, { kind: "pit", point: [2, -149, 0] }],
    places: [{ id: "dummy", kind: "dummy", name: "dummy", point: [10, -125, 0] }],
  };
  const hostile = offerLore({ skills: { mapping: 80, mining: 20, appraisal: 30 }, friend: -1, ...known });
  assert.equal(hostile.ground.length, 0);
  assert.equal(hostile.tier, "hostile");
  const stranger = offerLore({ skills: { mapping: 80, appraisal: 10 }, friend: 0, ...known });
  assert.equal(stranger.ground.some((cell) => cell.kind === "sand"), true);
  assert.equal(stranger.ground.some((cell) => cell.kind === "pit"), false);
  assert.equal(stranger.places.length, 0);
  const friend = offerLore({ skills: { mapping: 80, mining: 20, appraisal: 30 }, friend: 40, ...known });
  assert.equal(friend.ground.some((cell) => cell.kind === "pit"), true);
  assert.equal(friend.places[0].name, "dummy");
  const packed = packLore(friend);
  const frame = encodeLore(createIdentity(), { nonce: 3.2, friend: 40, ...packed });
  const accepted = acceptLore(frame);
  const heard = unpackLore(accepted);
  const blind = createSurvey();
  const first = learnLore(blind, null, heard, { mapping: 0 }, () => {}, GEO_COLOR);
  assert.ok(first.ground > 0 && first.ground <= 2, first.ground);
  const plate = createPlate();
  const student = createSurvey();
  const learned = learnLore(student, plate, heard, { mapping: 20, mining: 10, appraisal: 20 }, stamp, GEO_COLOR);
  assert.ok(learned.ground > 0);
  assert.deepEqual(samplePlate(plate, 1, -150).slice(0, 3), toldTint(GEO_COLOR.sand).slice(0, 3));
  assert.equal(student.places.has("dummy"), true);
});
