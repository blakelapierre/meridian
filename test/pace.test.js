import assert from "node:assert/strict";
import test from "node:test";
import { coverLevel, createPacer, createPicturePace, easePixels, fitPixels, nativePixels, nextScale, noteRayRate, paceWord, pictureSize, playPixels, shouldPaint, sizeAt, stepOctave, tuneRays, viewStill, visualThroughput } from "../src/render/pace.js";

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

test("a still view that misses vsync says recover instead of native", () => {
  assert.equal(paceWord("vsync", { still: true, arrived: true, holding: false }), "vsync recover");
  assert.equal(paceWord("vsync", { still: true, arrived: true, holding: true }), "vsync native");
  assert.equal(paceWord("vsync", { still: false, holding: true }), "vsync");
});

test("throughput is pixels times the frames you can see", () => {
  const refresh = 33;
  assert.ok(Math.abs(visualThroughput(100, 33, refresh) - 100 * (1000 / 33)) < 1);
  assert.ok(visualThroughput(480 * 270, 80, refresh) > visualThroughput(96 * 68, 33, refresh));
  assert.ok(visualThroughput(200 * 100, 33, refresh) > visualThroughput(200 * 100, 16, refresh) * 0.99);
});

test("movement snaps toward vsync and will not stay under 12fps", () => {
  const box = { displayW: 1280, displayH: 720 };
  const pace = createPicturePace();
  let seen = pace.step({ gap: 33, ...box, still: true });
  for (let i = 0; i < 6; i += 1) seen = pace.step({ gap: 200, ...box, still: true });
  const before = seen.scale;
  seen = pace.step({ gap: 200, ...box, still: false });
  assert.ok(seen.scale < before * 0.7);
  let slow = seen.scale;
  for (let i = 0; i < 8; i += 1) slow = pace.step({ gap: 120, ...box, still: false }).scale;
  assert.ok(slow < seen.scale);
});

test("a still camera can keep walking toward higher throughput", () => {
  const box = { displayW: 1600, displayH: 900 };
  const pace = createPicturePace();
  const cost = (level) => {
    const size = pictureSize(level, box.displayW, box.displayH);
    const pixels = size.width * size.height;
    return 10 + (pixels * pixels) / 5e9;
  };
  let seen = pace.step({ gap: cost(0.4), ...box });
  let prev = seen.scale;
  for (let i = 0; i < 80; i += 1) {
    seen = pace.step({ gap: cost(seen.scale), ...box, still: true });
    assert.ok(Math.abs(seen.scale - prev) / prev <= 0.05);
    prev = seen.scale;
  }
  const size = pictureSize(seen.scale, box.displayW, box.displayH);
  assert.ok(size.width * size.height > 96 * 68);
  const ms = cost(seen.scale);
  assert.ok(1000 / ms > 8);
});

test("resolution climbs one octave toward the window and steps back when a frame misses", () => {
  const coarse = sizeAt(2, 960, 540);
  assert.equal(coarse.width, 240);
  assert.equal(coarse.height, 134);
  assert.ok(coverLevel(960, 540, 4000) > coverLevel(960, 540, 200000));
  assert.equal(stepOctave(4, 2), 3);
  assert.equal(stepOctave(2, 4), 3);
  assert.ok(tuneRays(4000, { missed: true, paintMs: 4, refresh: 16 }) < 4000);
  assert.ok(tuneRays(4000, { missed: false, paintMs: 4, refresh: 16 }) > 4000);
  assert.equal(fitPixels(1_000_000, 16, 900_000), 16000);
  assert.equal(fitPixels(60_000_000, 16, 900_000), 900000);
  assert.ok(noteRayRate(0, 16000, 8) > noteRayRate(0, 16000, 20));
});
