import assert from "node:assert/strict";
import test from "node:test";
import { maxZoom, rangeRead, relaxOrbit, stepZoom, zoomFov } from "../src/sim/sight.js";

test("releasing the right mouse brings the orbit back behind the body", () => {
  const held = relaxOrbit(1.2, -0.4, 0.05, true);
  assert.equal(held.yaw, 1.2);
  let orbit = { yaw: 1.2, pitch: -0.4 };
  for (let frame = 0; frame < 90; frame += 1) orbit = relaxOrbit(orbit.yaw, orbit.pitch, 1 / 30, false);
  assert.equal(orbit.yaw, 0);
  assert.equal(orbit.pitch, 0);
});

test("zooming in close becomes first person, then eyesight and optics magnify", () => {
  let zoom = { distance: 2, first: false, level: 0, forced: false };
  zoom = stepZoom(zoom, -1, 0, "none");
  assert.equal(zoom.first, false);
  zoom = stepZoom(zoom, -1, 0, "none");
  assert.equal(zoom.first, true);
  const stuck = stepZoom(zoom, -1, 0, "none");
  assert.equal(stuck.level, 0);
  assert.equal(zoomFov(1, 0, "none"), 70);
  const glasses = stepZoom(zoom, -1, 0, "glasses");
  assert.ok(glasses.level > 0);
  assert.ok(zoomFov(1, 0, "binoculars") < zoomFov(1, 0, "glasses"));
  assert.ok(zoomFov(1, 0, "telescope") < zoomFov(1, 0, "binoculars"));
  assert.ok(maxZoom(140, "none") > maxZoom(0, "none"));
  assert.ok(zoomFov(1, 140, "none") < 70);
  const back = stepZoom({ ...zoom, level: 0.15 }, 1, 0, "binoculars");
  assert.equal(back.first, false);
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
