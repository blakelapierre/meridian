import assert from "node:assert/strict";
import test from "node:test";
import { blendOrigin, easeFollow, gazeAxis, gazeFor, gazeOnScreen, gazePlan, gazeUnaxis, maxZoom, rangeRead, relaxOrbit, sightPractice, stepFollow, stepZoom, zoomFov } from "../src/sim/sight.js";
import { lookDirection } from "../src/sim/hands.js";

test("the wheel sets follow distance and height instead of zooming", () => {
  const out = stepFollow({ distance: 3.4, height: 0 }, 1);
  assert.ok(out.distance > 3.4);
  assert.ok(out.height > 0);
  const inn = stepFollow(out, -1);
  assert.ok(inn.distance < out.distance);
  assert.ok(inn.height < out.height);
  const eased = easeFollow({ distance: 3.4, height: 0 }, out, 0.05);
  assert.ok(eased.distance > 3.4 && eased.distance < out.distance);
});

test("releasing the right mouse brings the orbit back behind the body", () => {
  const held = relaxOrbit(1.2, -0.4, 0.05, true);
  assert.equal(held.yaw, 1.2);
  let orbit = { yaw: 1.2, pitch: -0.4 };
  for (let frame = 0; frame < 90; frame += 1) orbit = relaxOrbit(orbit.yaw, orbit.pitch, 1 / 30, false);
  assert.equal(orbit.yaw, 0);
  assert.equal(orbit.pitch, 0);
});

test("zooming in close eases into first person, then eyesight and optics magnify", () => {
  let zoom = { distance: 2, first: false, level: 0, forced: false, blend: 0 };
  zoom = stepZoom(zoom, -1, 0, "none");
  assert.equal(zoom.first, false);
  zoom = stepZoom(zoom, -1, 0, "none");
  assert.equal(zoom.first, false);
  assert.equal(zoom.blend, 0);
  assert.equal(zoom.distance, 1.2);
  zoom = stepZoom(zoom, -1, 0, "none");
  assert.ok(zoom.blend > 0 && zoom.blend < 1);
  assert.equal(zoom.first, false);
  while (!zoom.first) zoom = stepZoom(zoom, -1, 0, "none");
  assert.equal(zoom.blend, 1);
  const stuck = stepZoom(zoom, -1, 0, "none");
  assert.equal(stuck.level, 0);
  assert.equal(zoomFov(1, 0, "none"), 70);
  const glasses = stepZoom(zoom, -1, 0, "glasses");
  assert.ok(glasses.level > 0);
  assert.ok(zoomFov(1, 0, "binoculars") < zoomFov(1, 0, "glasses"));
  assert.ok(zoomFov(1, 0, "telescope") < zoomFov(1, 0, "binoculars"));
  assert.ok(maxZoom(140, "none") > maxZoom(0, "none"));
  assert.ok(zoomFov(1, 140, "none") < 70);
  const midway = blendOrigin([0, -2, 2], [0, 0, 1.65], 0);
  const eyes = blendOrigin([0, -2, 2], [0, 0, 1.65], 1);
  assert.equal(midway[1], -2);
  assert.equal(eyes[1], 0);
  const back = stepZoom({ distance: 1.2, first: false, level: 0, forced: false, blend: 0.25 }, 1, 0, "binoculars");
  assert.equal(back.first, false);
  assert.ok(back.blend < 0.25);
});

test("range finding gets finer with skill and with a range tool", () => {
  const bare = rangeRead(20, 0, "none");
  const trained = rangeRead(20, 100, "none");
  const glass = rangeRead(80, 0, "telescope");
  assert.match(bare.text, /about/);
  assert.doesNotMatch(trained.text, /about/);
  assert.ok(trained.meters != null);
  assert.equal(rangeRead(400, 0, "none").text, "too far");
  assert.notEqual(glass.text, "too far");
  const coarse = rangeRead(18, 0, "none").meters;
  const fine = rangeRead(18, 120, "telescope").meters;
  assert.ok(Math.abs(fine - 18) <= Math.abs(coarse - 18));
});

test("rays gather on the gaze, and eyesight and focus scale that patch", () => {
  const fresh = gazePlan(0, 0);
  const eyed = gazePlan(140, 0);
  const aimed = gazePlan(140, 140);
  assert.equal(fresh.reach, 18);
  assert.ok(eyed.reach > fresh.reach);
  assert.ok(aimed.reach > eyed.reach);
  assert.ok(eyed.spread > fresh.spread);
  assert.ok(aimed.spread < eyed.spread);
  assert.ok(aimed.gamma < fresh.gamma);
  assert.ok(eyed.gamma >= fresh.gamma);
  const center = 0.5;
  for (const gamma of [fresh.gamma, aimed.gamma]) {
    assert.equal(gazeAxis(0, center, gamma), 0);
    assert.equal(gazeAxis(1, center, gamma), 1);
    assert.equal(gazeAxis(center, center, gamma), center);
    const packed = gazeAxis(0.6, center, gamma) - gazeAxis(0.4, center, gamma);
    assert.ok(packed < 0.2, packed);
    for (let s = 0; s <= 1; s += 0.05) {
      const back = gazeUnaxis(gazeAxis(s, 0.37, gamma), 0.37, gamma);
      assert.ok(Math.abs(back - s) < 1e-6, back);
    }
  }
  assert.equal(gazeAxis(0.25, 0.5, 1), 0.25);
  const eye = [0, 0, 1.65];
  const look = lookDirection(0.2, 0);
  const camera = { origin: eye.slice(), dir: look.slice(), fov: 70, aspect: 16 / 9, planeDistance: 1 };
  const ahead = gazeOnScreen(camera, eye, look);
  assert.ok(Math.abs(ahead[0] - 0.5) < 0.02, ahead[0]);
  assert.ok(Math.abs(ahead[1] - 0.5) < 0.02, ahead[1]);
  const down = gazeFor(
    { origin: [0, -3.4, 2.4], dir: [0, 1, 0], fov: 70, aspect: 16 / 9, planeDistance: 1 },
    eye,
    lookDirection(0, -0.6),
    40,
    10,
  );
  assert.ok(Math.abs(down.x - 0.5) < 0.08, down.x);
  assert.ok(down.y > 0.55, down.y);
  assert.ok(down.reach > 18);
});

test("looking trains the eyes, and focus only while they are held on something", () => {
  assert.deepEqual(sightPractice({}), { eyesight: true, focus: false });
  assert.deepEqual(sightPractice({ down: true, aimed: true, eyes: true }), { eyesight: false, focus: false });
  assert.equal(sightPractice({ aimed: true }).focus, true);
  assert.equal(sightPractice({ zoom: 0.2 }).focus, true);
  assert.equal(sightPractice({ eyes: true, still: true }).focus, true);
  assert.equal(sightPractice({ eyes: true }).focus, false);
  assert.equal(sightPractice({ still: true }).focus, false);
});
