import assert from "node:assert/strict";
import test from "node:test";
import { createPacer, easePixels, nativePixels, nextScale, playPixels, shouldPaint, viewStill } from "../src/render/pace.js";

test("an inactive window paints once a second and the focused one paints every frame", () => {
  assert.equal(shouldPaint(true, 0), true);
  assert.equal(shouldPaint(false, 999), false);
  assert.equal(shouldPaint(false, 1000), true);
});

test("resolution steps down to hold vsync, then 30fps, and steps back up when there is room", () => {
  assert.ok(nextScale(1, 20, 16.7) < 1);
  assert.ok(nextScale(1, 40, 16.7) < nextScale(1, 20, 16.7));
  assert.equal(nextScale(1, 10, 16.7), 1);
  assert.ok(nextScale(0.5, 8, 16.7) > 0.5);
  assert.equal(nextScale(0.25, 50, 16.7), 0.25);
});

test("a still view may climb to the window's own pixels", () => {
  const moving = { x: 0, y: 0, yaw: 0, pitch: 0, busy: false };
  assert.equal(viewStill(moving, { ...moving, yaw: 0.2 }), false);
  assert.equal(viewStill(moving, moving), true);
  const play = playPixels(1600, 900);
  const native = nativePixels(1600, 900, 2);
  assert.ok(native.width > play.width);
  assert.equal(native.width, 3200);
  const eased = easePixels(play, native, 0.05);
  assert.ok(eased.width > play.width);
  assert.ok(eased.width < native.width);
  assert.ok(nextScale(0.5, 10, 16.7, true) > nextScale(0.5, 10, 16.7, false));
});

test("the pacer learns a 60Hz refresh and only resizes after a run of slow frames", () => {
  const pacer = createPacer();
  let now = 0;
  for (let frame = 0; frame < 10; frame++) {
    now += 16.7;
    pacer.consider(now, true);
  }
  assert.ok(Math.abs(pacer.refresh - 16.7) < 1);
  for (let frame = 0; frame < 29; frame++) pacer.note(40, true);
  assert.equal(pacer.scale, 0.5);
  pacer.note(40, true);
  assert.ok(pacer.scale < 0.5);
  const stalled = createPacer();
  let slow = 0;
  for (let frame = 0; frame < 20; frame++) {
    slow += 16.7;
    stalled.consider(slow, true);
    stalled.note(1, true);
  }
  assert.equal(stalled.scale, 0.5);
  stalled.consider(slow + 140, true);
  assert.ok(stalled.scale < 0.5);
  now += 500;
  assert.equal(pacer.consider(now, false).paint, false);
  now += 500;
  assert.equal(pacer.consider(now, false).mode, "1fps");
  assert.equal(pacer.consider(now, false).paint, true);
});
