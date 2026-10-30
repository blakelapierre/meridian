import assert from "node:assert/strict";
import test from "node:test";
import { paintFrame } from "../src/engine/frame.js";
import { project } from "../src/engine/cast.js";
import { buildScene } from "../src/render/scene.js";
import { loadCatalog } from "../src/sim/catalog.js";
import { moveIntent, stepHands } from "../src/sim/hands.js";
import { createPlayer, createPlayerWorld, createStamina, TANGENT_GRAVITY } from "../src/sim/player.js";

const { atoll } = loadCatalog();

function pawn(position, velocity = [0, 0, 0]) {
  const player = createPlayer(position, velocity);
  const world = createPlayerWorld(player);
  world.tangentGravity = TANGENT_GRAVITY;
  return { player, world, stamina: createStamina() };
}

test("A and D strafe and do not turn the body", () => {
  const { player, world, stamina } = pawn([0, -150, 0]);
  const yaw = 0;
  for (let step = 0; step < 30; step++) stepHands(world, player, stamina, { yaw, forward: 0, strafe: 1, sprint: false, jump: false });
  assert.ok(player.position[0] > 1, player.position[0]);
  assert.ok(Math.abs(player.position[1] + 150) < 0.05, player.position[1]);
  const other = pawn([0, -150, 0]);
  for (let step = 0; step < 30; step++) {
    stepHands(other.world, other.player, other.stamina, { yaw, forward: 1, strafe: 0, sprint: false, jump: false });
  }
  assert.ok(other.player.position[1] > -149);
});

test("holding back from a sprint still stops inside the window", () => {
  const { player, world, stamina } = pawn([0, 0, 0], [0, 6.6, 0]);
  let crossed = null;
  for (let step = 1; step <= 12; step++) {
    stepHands(world, player, stamina, { yaw: 0, forward: -1, strafe: 0, sprint: false, jump: false });
    const speed = Math.hypot(player.velocity[0], player.velocity[1]);
    if (crossed === null && speed < 0.8) crossed = step / 30;
  }
  assert.ok(crossed >= 0.14 && crossed <= 0.18, crossed);
});

test("looking level keeps the sky up and mouse-right to the right", () => {
  const level = { dir: [0, 1, 0], fov: 70, aspect: 1, planeDistance: 1 };
  const sky = project(0.5, 0.25, level);
  const ground = project(0.5, 0.75, level);
  const east = project(0.75, 0.5, level);
  const west = project(0.25, 0.5, level);
  assert.ok(sky[2] > ground[2]);
  assert.ok(east[0] > west[0]);
  const facingEast = { dir: [1, 0, 0], fov: 70, aspect: 1, planeDistance: 1 };
  assert.ok(project(0.75, 0.5, facingEast)[1] < project(0.25, 0.5, facingEast)[1]);
  assert.ok(project(0.5, 0.25, facingEast)[2] > project(0.5, 0.75, facingEast)[2]);
});

test("the center pixel on the pad is the dummy", () => {
  const pad = atoll.placements.accuracyPad;
  const scene = buildScene({
    feet: [pad.x / 100, pad.y / 100, 0],
    yaw: Math.PI / 2,
    pitch: -0.075,
    tick: (72 * 60 * 30) / 4,
    atoll,
    width: 41,
    height: 21,
  });
  const pixels = paintFrame(scene, 41, 21);
  const center = (10 * 41 + 20) * 4;
  assert.ok(pixels[center] > pixels[center + 2], pixels.slice(center, center + 3).join(","));
  const sky = buildScene({
    feet: [pad.x / 100, pad.y / 100, 0],
    yaw: Math.PI / 2,
    pitch: 1.1,
    tick: (72 * 60 * 30) / 4,
    atoll,
    crust: false,
    width: 5,
    height: 5,
  });
  const up = paintFrame(sky, 5, 5);
  const mid = (2 * 5 + 2) * 4;
  assert.ok(up[mid + 2] > up[mid], up.slice(mid, mid + 3).join(","));
});

test("auto run holds forward and sprint until you back up", () => {
  assert.equal(moveIntent({ auto: true }).forward, 1);
  assert.equal(moveIntent({ auto: true }).sprint, true);
  assert.equal(moveIntent({ auto: true, back: 1 }).forward, -1);
  assert.equal(moveIntent({ auto: true, back: 1 }).sprint, false);
  assert.equal(moveIntent({ forward: 1 }).sprint, false);
});
