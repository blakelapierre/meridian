import assert from "node:assert/strict";
import test from "node:test";
import { farPixels, NEAR_METERS, SPHERE_BUDGET } from "../src/render/gpu.js";
import { chaseOrigin, createCameraSpring, playerParts, rayMisses, stepCamera, stepLook } from "../src/sim/body.js";
import { lookDirection } from "../src/sim/hands.js";
import { buildScene } from "../src/render/scene.js";
import { readFileSync } from "node:fs";

const atoll = JSON.parse(readFileSync(new URL("../content/atoll.json", import.meta.url)));

test("the third-person camera sits behind a body and the crosshair misses it", () => {
  const feet = [4, -8, 0];
  for (const crouch of [false, true]) {
    for (const pitch of [0, -0.35, 0.4]) {
      const parts = playerParts(feet, 0.4, crouch);
      const origin = chaseOrigin(feet, 0.4, pitch, crouch);
      const dir = lookDirection(0.4, pitch);
      const ahead = (feet[0] - origin[0]) * dir[0] + (feet[1] - origin[1]) * dir[1];
      assert.ok(ahead > 1, "the body is in front of the camera");
      assert.equal(rayMisses(origin, dir, parts), true, `pitch ${pitch} crouch ${crouch}`);
      const forwardX = Math.sin(0.4);
      const forwardY = Math.cos(0.4);
      const rightX = Math.cos(0.4);
      const rightY = -Math.sin(0.4);
      const side = (origin[0] - feet[0]) * rightX + (origin[1] - feet[1]) * rightY;
      const back = (origin[0] - feet[0]) * forwardX + (origin[1] - feet[1]) * forwardY;
      assert.ok(Math.abs(side) < 1e-6, side);
      assert.ok(back < -1, "the camera is behind, not beside");
      const top = Math.max(...parts.map((part) => part.origin[2] + part.radius));
      assert.ok(top <= (crouch ? 1.25 : 1.85) + feet[2]);
      assert.ok(top >= (crouch ? 1.05 : 1.6) + feet[2]);
    }
  }
});

test("the walk scene defaults to the eyes, and third person adds the body", () => {
  const feet = [0, 0, 0];
  const first = buildScene({ feet, yaw: 0, pitch: 0, atoll, width: 16, height: 9 });
  assert.deepEqual(first.camera.origin, [0, 0, 1.65]);
  assert.equal(first.objects.some((object) => object.self), false);
  const third = buildScene({ feet, yaw: 0, pitch: 0, atoll, width: 16, height: 9, view: "third" });
  assert.ok(third.camera.origin[1] < feet[1]);
  assert.equal(third.objects.filter((object) => object.self).length, 3);
  const watched = buildScene({
    feet: [0, 0, 0],
    yaw: 0,
    pitch: 0,
    atoll,
    width: 16,
    height: 9,
    view: "third",
    self: false,
    others: [{ feet: [2, 0, 0], yaw: 0 }],
  });
  assert.equal(watched.objects.some((object) => object.self), false);
  assert.equal(watched.objects.filter((object) => object.body === "player").length, 3);
});

test("the camera stretches behind a sudden move and then settles", () => {
  const spring = createCameraSpring([0, 0, 2]);
  stepCamera(spring, [0, 6, 2], 1 / 30);
  assert.ok(spring.pos[1] < 3, spring.pos[1]);
  for (let frame = 0; frame < 240; frame += 1) stepCamera(spring, [0, 6, 2], 1 / 30);
  assert.ok(Math.abs(spring.pos[1] - 6) < 0.2, spring.pos[1]);
});

test("the look seeks a new direction instead of turning there at once", () => {
  const spring = createCameraSpring([0, 0, 2]);
  stepLook(spring, [0, 1, 0], 1 / 30);
  const turned = stepLook(spring, [0, -1, 0], 1 / 30);
  assert.ok(turned[1] > 0.5, turned[1]);
  for (let frame = 0; frame < 240; frame += 1) stepLook(spring, [0, -1, 0], 1 / 30);
  assert.ok(spring.look[1] < -0.9, spring.look[1]);
});

test("the painter can hold the dummy and five bodies", () => {
  assert.ok(SPHERE_BUDGET >= 1 + 5 * 3);
});

test("distance is a quarter of the close picture on each axis", () => {
  assert.equal(NEAR_METERS, 18);
  assert.deepEqual(farPixels(960, 540), { width: 240, height: 135 });
  assert.deepEqual(farPixels(5, 4), { width: 2, height: 2 });
  const src = readFileSync(new URL("../src/render/gpu.js", import.meta.url), "utf8");
  assert.match(src, /uniform float uMaxDist/);
  assert.match(src, /farPixels\(tw, th\)/);
});
