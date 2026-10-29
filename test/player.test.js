import assert from "node:assert/strict";
import test from "node:test";
import { createPlayer, createPlayerWorld, stepPlayer, STOP_ACCEL } from "../src/sim/player.js";

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
