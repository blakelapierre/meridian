import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createIdentity } from "../src/net/identity.js";
import { acceptShot, encodeShot } from "../src/net/shots.js";
import { applyDummyHit, createDummy, resolveShot, stepDummy } from "../src/sim/fire.js";
import { lookDirection } from "../src/sim/hands.js";
import { buildScene } from "../src/render/scene.js";

const atoll = JSON.parse(readFileSync(new URL("../content/atoll.json", import.meta.url)));

function padScene() {
  const pad = atoll.placements.accuracyPad;
  return buildScene({
    feet: [pad.x / 100, pad.y / 100, 0],
    yaw: Math.PI / 2,
    pitch: -0.075,
    atoll,
    crust: false,
    width: 16,
    height: 9,
  });
}

test("a standing shot from the pad hits the dummy in the chest for 28", () => {
  const scene = padScene();
  const shot = resolveShot({
    eye: scene.camera.origin,
    forward: scene.camera.dir,
    speed: 0,
    airborne: false,
    seed: 1,
    objects: scene.objects,
  });
  assert.equal(shot.hitbox, "chest");
  const dummy = createDummy();
  assert.deepEqual(applyDummyHit(dummy, shot.hitbox), { damage: 28, health: 72, hitbox: "chest" });
  applyDummyHit(dummy, "chest");
  applyDummyHit(dummy, "chest");
  assert.equal(dummy.health, 16);
  applyDummyHit(dummy, "chest");
  assert.equal(dummy.health, 0);
  for (let tick = 0; tick < 149; tick++) stepDummy(dummy);
  assert.equal(dummy.health, 0);
  stepDummy(dummy);
  assert.equal(dummy.health, 100);
});

test("the upper dummy is a headshot and a wall blocks the line", () => {
  const scene = padScene();
  const dummy = atoll.placements.dummy;
  const eye = scene.camera.origin;
  const head = [dummy.x / 100, dummy.y / 100, 1.2];
  const forward = head.map((value, index) => value - eye[index]);
  const shot = resolveShot({
    eye,
    forward,
    speed: 0,
    airborne: false,
    seed: 2,
    objects: scene.objects,
  });
  assert.equal(shot.hitbox, "head");
  const dummyBody = createDummy();
  assert.equal(applyDummyHit(dummyBody, "head").health, 0);
  const blocked = resolveShot({
    eye,
    forward,
    speed: 0,
    airborne: false,
    seed: 2,
    objects: [{
      type: "box",
      min: [eye[0] + 1, eye[1] - 2, 0],
      max: [eye[0] + 2, eye[1] + 2, 3],
      color: [1, 1, 1, 1],
    }, ...scene.objects],
  });
  assert.equal(blocked.hitbox, null);
});

test("the other browser traces the same shot before applying it", () => {
  const scene = padScene();
  const shot = resolveShot({
    eye: scene.camera.origin,
    forward: lookDirection(Math.PI / 2, -0.075),
    speed: 0,
    airborne: false,
    seed: 3,
    objects: scene.objects,
  });
  const frame = encodeShot(createIdentity(), {
    nonce: 4,
    origin: scene.camera.origin,
    dir: shot.dir,
    hitbox: shot.hitbox,
  });
  const accepted = acceptShot(frame, scene.objects);
  assert.equal(accepted.ok, true);
  assert.equal(accepted.hitbox, "chest");
  const liar = encodeShot(createIdentity(), {
    nonce: 5,
    origin: scene.camera.origin,
    dir: shot.dir,
    hitbox: "head",
  });
  assert.equal(acceptShot(liar, scene.objects).reason, "split");
  const sunTick = encodeShot(createIdentity(), {
    nonce: 4.87,
    origin: scene.camera.origin,
    dir: shot.dir,
    hitbox: shot.hitbox,
  });
  assert.equal(acceptShot(sunTick, scene.objects).nonce, 4);
});
