import assert from "node:assert/strict";
import test from "node:test";
import { createYard, pieceBoxes, tryPlaceBow, trySalvage } from "../src/sim/build.js";
import { stepBows } from "../src/sim/bow.js";
import { createPilot, PILOT_GOALS, stepPilot, togglePilotGoal } from "../src/sim/pilot.js";

test("the pilot goals run in beach order and you can leave one off", () => {
  assert.deepEqual(PILOT_GOALS.map((goal) => goal.id), ["survey", "dig", "raise", "drill", "hunt", "speak"]);
  const pilot = createPilot();
  assert.deepEqual(pilot.picked, ["survey", "dig", "raise"]);
  assert.equal(stepPilot(pilot, { x: 0, y: 0, yaw: 0, tick: 0 }), null);
  pilot.on = true;
  const turned = stepPilot(pilot, { x: 0, y: 0, yaw: 0, tick: 0 });
  assert.equal(turned.goal, "survey");
  assert.ok(turned.yaw !== 0);
  const walking = stepPilot(pilot, { x: 0, y: 0, yaw: Math.atan2(8, 0), tick: 1 });
  assert.equal(walking.forward, 1);
  assert.equal(walking.shot, false);
  togglePilotGoal(pilot, "survey");
  togglePilotGoal(pilot, "hunt");
  assert.equal(pilot.picked.includes("survey"), false);
  assert.equal(pilot.picked.includes("hunt"), true);
});

test("dig holds the bit, and a hunt shoots only when a beast is close", () => {
  const digger = createPilot(["dig"]);
  digger.on = true;
  const digging = stepPilot(digger, { x: 1, y: 1, yaw: 0, tick: 4 });
  assert.equal(digging.slot, "bit");
  assert.equal(digging.hold, true);
  assert.equal(digging.shot, false);
  const hunter = createPilot(["hunt"]);
  hunter.on = true;
  const yaw = Math.atan2(3, 0);
  const shot = stepPilot(hunter, { x: 0, y: 0, yaw, tick: 8, beasts: [{ id: "crab", x: 3, y: 0 }] });
  assert.equal(shot.slot, "line");
  assert.equal(shot.shot, true);
  assert.equal(shot.forward, 0);
  const done = stepPilot(hunter, { x: 0, y: 0, yaw, tick: 16, beasts: [] });
  assert.equal(done.shot, false);
});

test("a crossbow costs 8, watches 16 m, and salvages for 4", () => {
  const yard = createYard({ x: 0, y: 0 });
  const foot = yard.pieces[0].at;
  assert.equal(tryPlaceBow(yard, [foot[0] + 8, foot[1]]).reason, "support");
  assert.equal(tryPlaceBow(yard, [foot[0] + 1, foot[1]]).ok, true);
  assert.equal(yard.metal, 22);
  const bow = yard.pieces.find((piece) => piece.id === "bow");
  const boxes = pieceBoxes([bow]);
  assert.equal(boxes.length, 2);
  assert.equal(boxes[0].name, "Crossbow");
  const far = stepBows(yard.pieces, [{ id: "crab", x: 40, y: 0, z: 0.4 }]);
  assert.equal(far.length, 0);
  const near = stepBows(yard.pieces, [{ id: "crab", x: bow.at[0] * 0.5 + 4, y: bow.at[1] * 0.5, z: 0.4 }]);
  assert.equal(near.length, 1);
  assert.equal(near[0].bite, 14);
  assert.equal(stepBows(yard.pieces, [{ id: "crab", x: bow.at[0] * 0.5 + 4, y: bow.at[1] * 0.5, z: 0.4 }]).length, 0);
  assert.equal(bow.cool, 44);
  const before = yard.metal;
  assert.equal(trySalvage(yard, bow.at).ok, true);
  assert.equal(yard.metal - before, 4);
});
