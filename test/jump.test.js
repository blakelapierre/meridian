import assert from "node:assert/strict";
import test from "node:test";
import { createPlayer, createPlayerWorld, createStamina, TANGENT_GRAVITY } from "../src/sim/player.js";
import { stepHands } from "../src/sim/hands.js";
import { createJump, jumpAbility } from "../src/sim/jump.js";
import { createSkills, grantUse } from "../src/sim/skills.js";

function crest(holdTicks, skill) {
  const player = createPlayer();
  const world = createPlayerWorld(player);
  world.tangentGravity = TANGENT_GRAVITY;
  const stamina = createStamina();
  const jump = createJump();
  let max = 0;
  let launched = false;
  for (let step = 0; step < 120; step++) {
    const held = step < holdTicks;
    const result = stepHands(world, player, stamina, { yaw: 0, jump: held }, jump, skill);
    if (result.jump) launched = true;
    max = Math.max(max, player.position[2]);
    if (launched && player.position[2] === 0 && step > 2) break;
  }
  return max;
}

test("holding space rises toward the jump skill and a tap stays short", () => {
  const tap = crest(1, 0);
  const held = crest(40, 0);
  const trained = crest(40, 140);
  assert.ok(tap < 0.7 && tap > 0.15, tap);
  assert.ok(Math.abs(held - jumpAbility(0)) < 0.08, held);
  assert.ok(Math.abs(trained - jumpAbility(140)) < 0.08, trained);
  assert.ok(trained > held);
});

test("a jump still leaves a hill", () => {
  const player = createPlayer([0, 0, 3]);
  const world = createPlayerWorld(player);
  world.tangentGravity = TANGENT_GRAVITY;
  world.ground = 3;
  world.drop = -3;
  const stamina = createStamina();
  const jump = createJump();
  let launched = false;
  let max = 3;
  for (let step = 0; step < 20; step++) {
    const result = stepHands(world, player, stamina, { yaw: 0, jump: true }, jump, 0);
    if (result.jump) launched = true;
    max = Math.max(max, player.position[2]);
  }
  assert.ok(launched);
  assert.ok(max > 3.3, max);
});

test("using a skill adds experience and raises it", () => {
  const skills = createSkills();
  assert.equal(grantUse(skills, "jump"), 1);
  assert.equal(skills.jump.xp, 1);
  assert.equal(skills.jump.value, 1);
  const second = grantUse(skills, "jump");
  assert.ok(Math.abs(second - 1 / 1.05) < 1e-9, second);
  assert.equal(grantUse(skills, "marksmanship", { success: false }), 0);
  assert.equal(skills.marksmanship.value, 0);
  assert.equal(grantUse(skills, "mining", { tick: 0, gap: 30 }), 1);
  assert.equal(grantUse(skills, "mining", { tick: 10, gap: 30 }), 0);
  skills.appraisal.specialized = true;
  assert.equal(grantUse(skills, "appraisal"), 1.5);
});
