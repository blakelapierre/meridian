import assert from "node:assert/strict";
import test from "node:test";
import { AGILITY_CAPS, agilityFactor } from "../src/sim/agility.js";
import { createSkills, grantUse, SKILL_NAMES } from "../src/sim/skills.js";
import { createPlayer, createPlayerWorld, createStamina, runSpeed, TANGENT_GRAVITY, wishSpeed } from "../src/sim/player.js";

test("agility is a trainable skill", () => {
  assert.ok(SKILL_NAMES.includes("agility"));
  const skills = createSkills();
  assert.ok(grantUse(skills, "agility", { tick: 0 }) > 0);
});

test("agility factors start at 1, grow with skill, and stop at the caps", () => {
  assert.deepEqual(AGILITY_CAPS, { run: 1.5, jump: 1.4, turn: 1.5 });
  for (const kind of ["run", "jump", "turn"]) {
    assert.equal(agilityFactor(kind, 0), 1);
    assert.ok(agilityFactor(kind, 70) > 1 && agilityFactor(kind, 70) < AGILITY_CAPS[kind]);
    assert.ok(Math.abs(agilityFactor(kind, 140) - AGILITY_CAPS[kind]) < 1e-12);
    assert.ok(Math.abs(agilityFactor(kind, 9999) - AGILITY_CAPS[kind]) < 1e-12);
    assert.equal(agilityFactor(kind, -5), 1);
  }
  assert.equal(agilityFactor("swim", 140), 1);
});

test("agility scales sprint speed only", () => {
  const pool = { value: 100, locked: false };
  assert.ok(Math.abs(wishSpeed(pool, { sprint: true, agility: 140 }) - runSpeed(0) * 1.5) < 1e-9);
  assert.equal(wishSpeed(pool, { agility: 140 }), wishSpeed(pool, {}));
});

test("agility raises the jump apex by at most 1.4x", async () => {
  const { createJump, stepLift, jumpAbility } = await import("../src/sim/jump.js");
  const apex = (agility) => {
    const player = createPlayer([0, 0, 0]);
    const world = createPlayerWorld(player);
    world.tangentGravity = TANGENT_GRAVITY;
    world.ground = 0;
    const stamina = createStamina();
    const jump = createJump();
    let top = 0;
    let out = { apex: 0 };
    for (let i = 0; i < 120; i++) {
      out = stepLift(world, player, stamina, { jump: true, agility }, jump, 0, [0, 0, 0], player.position[2] > 0.12);
      top = Math.max(top, player.position[2]);
    }
    return { top, cap: out.apex };
  };
  const base = apex(0);
  const best = apex(140);
  assert.ok(Math.abs(base.cap - jumpAbility(0)) < 1e-9);
  assert.ok(Math.abs(best.cap - jumpAbility(0) * 1.4) < 1e-9);
  assert.ok(best.top > base.top, `${best.top} > ${base.top}`);
  assert.ok(best.top <= jumpAbility(0) * 1.4 + 0.05);
});
