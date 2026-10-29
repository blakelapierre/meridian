import assert from "node:assert/strict";
import test from "node:test";
import { createPlayer, createPlayerWorld, createStamina, stepPlayer, stepStamina, STOP_ACCEL, TANGENT_GRAVITY, wishSpeed } from "../src/sim/player.js";

test("opposite strafe stops a sprint inside 140 to 180 ms", () => {
  const player = createPlayer([0, 0, 0], [6.6, 0, 0]);
  const world = createPlayerWorld(player);
  let crossed = null;
  for (let step = 1; step <= 12; step++) {
    stepPlayer(world, player, [-STOP_ACCEL, 0, 0]);
    if (crossed === null && player.velocity[0] < 0.8) crossed = step / 30;
  }
  assert.ok(crossed !== null, "never slowed down");
  assert.ok(crossed >= 0.14 && crossed <= 0.18, `crossed at ${crossed}`);
});

test("a separate body is not merged into a heavier one", () => {
  const player = createPlayer([0, 0, 0], [0, 0, 0]);
  const rock = new (player.constructor)(5000, [80, 80, 80, 255], [0.2, 0, 0], [0, 0, 0]);
  rock.policy = "merge";
  rock.size = 1;
  rock.collisionSize = 1;
  const world = createPlayerWorld(player);
  world.universe.push(rock);
  stepPlayer(world, player, [0, 0, 0]);
  assert.equal(world.universe.includes(player), true);
  assert.equal(world.universe.length, 2);
});

test("a jump on flat ground crests at 1.15 m", () => {
  const player = createPlayer();
  const world = createPlayerWorld(player);
  world.tangentGravity = TANGENT_GRAVITY;
  let max = 0;
  stepPlayer(world, player, [0, 0, 0], true);
  for (let step = 0; step < 90; step++) {
    max = Math.max(max, player.position[2]);
    stepPlayer(world, player, [0, 0, 0], false);
  }
  assert.ok(Math.abs(max - 1.15) < 0.005, max);
});

test("stamina drains while sprinting and will not sprint again until 20", () => {
  const pool = createStamina();
  for (let step = 0; step < 30; step++) stepStamina(pool, { sprint: true });
  assert.equal(pool.value, 86);
  assert.equal(wishSpeed(pool, { sprint: true }), 6.6);
  while (pool.value > 0) stepStamina(pool, { sprint: true });
  assert.equal(pool.value, 0);
  assert.equal(wishSpeed(pool, { sprint: true }), 4.4);
  for (let step = 0; step < 18; step++) stepStamina(pool, {});
  assert.equal(pool.value, 0);
  for (let step = 0; step < 30; step++) stepStamina(pool, {});
  assert.equal(pool.value, 20);
  assert.equal(wishSpeed(pool, { sprint: true }), 6.6);
  const jumped = createStamina();
  stepStamina(jumped, { jump: true });
  assert.equal(jumped.value, 88);
});

