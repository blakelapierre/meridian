import assert from "node:assert/strict";
import test from "node:test";
import { cameraAccel, cameraSpeed, coverLevel, createPacer, createPicturePace, easePixels, fitPixels, motionLimit, nativePixels, nextScale, noteRayRate, paceWord, pictureSize, playPixels, shouldPaint, sizeAt, stepOctave, traceInterval, tuneRays, viewStill, visualThroughput } from "../src/render/pace.js";

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

test("throughput squares speed and acceleration", () => {
  const refresh = 33;
  const seen = visualThroughput(100, 33, refresh, 2, 3);
  assert.ok(Math.abs(seen - 100 * (1000 / 33) * 4 * 9) < 1);
  assert.equal(visualThroughput(100, 33, refresh, 2, 0), 0);
  assert.ok(visualThroughput(480 * 270, 80, refresh, 1, 1) > visualThroughput(96 * 68, 33, refresh, 1, 1));
});

test("rapid acceleration holds vsync and a steady pace may use 12fps", () => {
  const refresh = 33;
  assert.ok(Math.abs(visualThroughput(100, 33, refresh, 2, 1) - 4 * visualThroughput(100, 33, refresh, 1, 1)) < 1);
  assert.ok(motionLimit(0, refresh) > 70);
  assert.ok(motionLimit(4.4, refresh, 0) > 70);
  assert.ok(motionLimit(4.4, refresh, 1) > motionLimit(4.4, refresh, 4));
  assert.ok(motionLimit(4.4, refresh, 12) < 40);
  const mild = motionLimit(1, refresh, 0) - motionLimit(1, refresh, 1);
  const hard = motionLimit(1, refresh, 4) - motionLimit(1, refresh, 8);
  assert.ok(mild < hard);
  assert.ok(cameraAccel(0, 4, 0.5) === 8);
  assert.ok(cameraSpeed({ x: 0, y: 0, yaw: 0, pitch: 0 }, { x: 4.4, y: 0, yaw: 0, pitch: 0 }, 1) > 4);
  const pose = { x: 0, y: 0, yaw: 0, pitch: 0, zoom: 0 };
  assert.ok(cameraSpeed(pose, { ...pose, zoom: 0.5 }, 0.5) > cameraSpeed(pose, pose, 0.5));
  const box = { displayW: 1280, displayH: 720 };
  const pace = createPicturePace();
  let seen = pace.step({ gap: 33, ...box, still: false, speed: 5, accel: 12 });
  for (let i = 0; i < 8; i += 1) seen = pace.step({ gap: 50, ...box, still: false, speed: 5, accel: 12 });
  const grown = seen.scale;
  for (let i = 0; i < 8; i += 1) seen = pace.step({ gap: 50, ...box, still: false, speed: 5, accel: 12 });
  assert.ok(seen.scale <= grown);
});

test("the trace rate follows acceleration, and the screen can still refresh", () => {
  assert.ok(traceInterval(false, 12, 16) <= 20);
  assert.ok(Math.abs(traceInterval(false, 0, 16) - 1000 / 12) < 1);
  assert.ok(traceInterval(true, 0, 16) >= 125);
});

test("a jump's acceleration snaps a still picture to vsync", () => {
  const box = { displayW: 1280, displayH: 720 };
  const pace = createPicturePace();
  let seen = pace.step({ gap: 16, ...box, still: true });
  for (let i = 0; i < 8; i += 1) seen = pace.step({ gap: 125, ...box, still: true });
  const parked = seen.scale;
  seen = pace.step({ gap: 125, ...box, still: false, speed: 3, accel: 20 });
  assert.ok(seen.scale < parked * 0.55);
  assert.ok(traceInterval(false, 20, 16) <= 20);
  const pose = { x: 0, y: 0, z: 0, yaw: 0, pitch: 0 };
  assert.ok(cameraSpeed(pose, { ...pose, z: 0.3 }, 0.1) > 2);
  assert.equal(viewStill(pose, { ...pose, z: 0.3 }), false);
  const framed = { ...pose, sx: 0.4, sy: 0.1, sz: 0 };
  assert.ok(cameraSpeed(pose, framed, 0.1) > 3);
  assert.equal(viewStill(pose, framed), false);
  assert.equal(viewStill({ ...pose, sx: 1, sy: 2, sz: 3 }, { ...pose, sx: 1, sy: 2, sz: 3 }), true);
  assert.ok(cameraAccel(0, cameraSpeed(pose, framed, 1 / 60), 1 / 60) >= 1);
});

test("a moving camera never keeps a frame slower than 12fps", () => {
  const box = { displayW: 1280, displayH: 720 };
  const pace = createPicturePace();
  let seen = pace.step({ gap: 16, ...box, still: false, speed: 1, accel: 0 });
  for (let i = 0; i < 4; i += 1) seen = pace.step({ gap: 200, ...box, still: false, speed: 1, accel: 0 });
  assert.ok(seen.scale < 0.4);
  assert.ok(traceInterval(false, 0, 16) <= 1000 / 12 + 0.1);
  assert.ok(traceInterval(true, 0, 16) > 1000 / 12);
});

test("a moving camera is pulled to at least 12fps in one step", () => {
  const box = { displayW: 1280, displayH: 720 };
  const pace = createPicturePace();
  let seen = pace.step({ gap: 16, ...box, still: false, speed: 0.2 });
  for (let i = 0; i < 6; i += 1) seen = pace.step({ gap: 16, ...box, still: false, speed: 0.2 });
  const before = seen.scale;
  for (let i = 0; i < 6; i += 1) seen = pace.step({ gap: 200, ...box, still: false, speed: 0.2 });
  assert.ok(seen.scale < before);
  assert.ok(seen.scale < before * 0.7);
  const parked = createPicturePace();
  let held = parked.step({ gap: 200, ...box, still: true });
  for (let i = 0; i < 6; i += 1) held = parked.step({ gap: 200, ...box, still: true });
  assert.ok(held.scale >= 0.4);
});

test("movement snaps toward vsync and will not stay under 12fps", () => {
  const box = { displayW: 1280, displayH: 720 };
  const pace = createPicturePace();
  let seen = pace.step({ gap: 33, ...box, still: true });
  for (let i = 0; i < 6; i += 1) seen = pace.step({ gap: 200, ...box, still: true });
  const before = seen.scale;
  seen = pace.step({ gap: 200, ...box, still: false });
  assert.ok(seen.scale < before);
  for (let i = 0; i < 6; i += 1) seen = pace.step({ gap: 200, ...box, still: false });
  assert.ok(seen.scale < before * 0.7);
  let slow = seen.scale;
  for (let i = 0; i < 8; i += 1) slow = pace.step({ gap: 120, ...box, still: false }).scale;
  assert.ok(slow < seen.scale);
});

test("a still camera climbs to the native picture", () => {
  const box = { displayW: 1600, displayH: 900 };
  const pace = createPicturePace();
  let seen = pace.step({ gap: 16, ...box, still: true });
  let prev = seen.scale;
  for (let i = 0; i < 40; i += 1) {
    seen = pace.step({ gap: 80, ...box, still: true, speed: 0, accel: 0 });
    assert.ok(seen.scale + 1e-6 >= prev);
    assert.ok(seen.scale <= prev * 1.2 + 1e-6);
    prev = seen.scale;
  }
  assert.ok(seen.scale > 0.98);
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
