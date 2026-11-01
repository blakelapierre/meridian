import assert from "node:assert/strict";
import test from "node:test";
import { createPlayer, createPlayerWorld, stepPlayer } from "../src/sim/player.js";
import { attachPlanet, pullAt, settleLoose, throwStone, CAIRN_G, SURFACE_G } from "../src/sim/planet.js";
import { PLANET_RADIUS_M } from "../src/sim/shell.js";

test("the pinned planet pulls 9.81 at the surface and does not move", () => {
  const player = createPlayer([0, 0, 2]);
  const world = createPlayerWorld(player);
  const planet = attachPlanet(world);
  const home = planet.home.slice();
  const surface = pullAt(planet, world.gravityConstant, [0, 0, 0]);
  assert.ok(Math.abs(surface[2] + SURFACE_G) < 1e-6, surface[2]);
  assert.ok(Math.abs(surface[0]) < 1e-8 && Math.abs(surface[1]) < 1e-8);
  const pull = pullAt(planet, world.gravityConstant, player.position);
  stepPlayer(world, player, [0, 0, 0]);
  assert.ok(Math.abs(player.velocity[2] - pull[2] / 30) < 1e-4, player.velocity[2]);
  assert.deepEqual(planet.position, home);
  assert.equal(world.gravityConstant, CAIRN_G);
});

test("off the axis the pull leans toward the planet", () => {
  const player = createPlayer([0, -1000, 2]);
  const world = createPlayerWorld(player);
  const planet = attachPlanet(world);
  const pull = pullAt(planet, world.gravityConstant, [0, -1000, 2]);
  assert.ok(pull[1] > 0, pull[1]);
  assert.ok(pull[2] < -9.7, pull[2]);
  assert.equal(planet.position[2], -PLANET_RADIUS_M);
});

test("a thrown stone falls in the same step and then rests", () => {
  const player = createPlayer([0, 0, 0]);
  const world = createPlayerWorld(player);
  attachPlanet(world);
  const stone = throwStone(world, [2, 0, 3], [0, 0, 0], 0);
  stepPlayer(world, player, [0, 0, 0]);
  assert.ok(stone.velocity[2] < -0.2, stone.velocity[2]);
  for (let step = 0; step < 90; step += 1) {
    stepPlayer(world, player, [0, 0, 0]);
    settleLoose(world, () => 0);
  }
  assert.equal(stone.position[2], 0);
  assert.equal(stone.velocity[2], 0);
  assert.equal(world.universe.includes(player), true);
  assert.equal(world.universe.includes(stone), true);
});
