import assert from "node:assert/strict";
import test from "node:test";
import { AGENDAS, AI_ORDER, createAgent, stepAgenda } from "../src/sim/ai.js";

test("four agendas want different things and use the same controls", () => {
  assert.equal(AI_ORDER.length, 4);
  const goals = AI_ORDER.map((name) => AGENDAS[name].agenda);
  assert.equal(new Set(goals).size, 4);
  const survey = stepAgenda("surveyor", createAgent("surveyor"), { x: -6, y: -150, yaw: 0, tick: 0 });
  assert.equal(survey.hold, false);
  assert.equal(survey.shot, false);
  assert.equal(survey.identify, true);
  const miner = stepAgenda("miner", createAgent("miner"), { x: 6, y: -148, yaw: 0, tick: 4 });
  assert.equal(miner.slot, "bit");
  assert.equal(miner.hold, true);
  assert.equal(miner.shot, false);
  const mason = stepAgenda("mason", createAgent("mason"), { x: 1.2, y: -140, yaw: 0, tick: 3, wall: true });
  assert.equal(mason.slot, "hammer");
  assert.equal(mason.salvage, true);
  assert.equal(mason.hold, false);
  const shot = stepAgenda("marksman", createAgent("marksman"), { x: 0, y: -128, yaw: Math.atan2(10, 3), tick: 16 });
  assert.equal(shot.slot, "line");
  assert.equal(shot.hold, false);
  assert.equal(shot.shot, true);
});
