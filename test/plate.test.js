import assert from "node:assert/strict";
import test from "node:test";
import { GEO_COLOR, createPlate, dragCenter, hitGround, isMapDrag, mapFollowAfter, mapSpan, placeOnView, plateViewRect, revealLook, revealRange, samplePlate, stamp } from "../src/sim/plate.js";
import { chaseOrigin } from "../src/sim/body.js";
import { lookDirection } from "../src/sim/hands.js";

test("the map image keeps earlier geography and updates a cell when it changes", () => {
  const plate = createPlate();
  stamp(plate, 0, -150, GEO_COLOR.sand, 2);
  stamp(plate, 12, -140, GEO_COLOR.wood, 2);
  assert.deepEqual(samplePlate(plate, 0, -150).slice(0, 3), GEO_COLOR.sand.slice(0, 3));
  assert.deepEqual(samplePlate(plate, 12, -140).slice(0, 3), GEO_COLOR.wood.slice(0, 3));
  stamp(plate, 0, -150, GEO_COLOR.pit, 2);
  assert.deepEqual(samplePlate(plate, 0, -150).slice(0, 3), GEO_COLOR.pit.slice(0, 3));
  assert.deepEqual(samplePlate(plate, 12, -140).slice(0, 3), GEO_COLOR.wood.slice(0, 3));
});

test("looking around reveals a wedge that grows with mapping", () => {
  const near = revealLook({ x: 0, y: -150, yaw: 0, pitch: -0.6, skills: { mapping: 0 } });
  assert.ok(near.some((point) => point.y > -150));
  assert.ok(revealRange({ mapping: 80, eyesight: 40 }) > revealRange({ mapping: 0 }));
  const wide = revealLook({ x: 0, y: -150, yaw: 0, pitch: 0, skills: { mapping: 140 }, heightAt: (x, y) => (y > -146 ? 2 : 0) });
  assert.ok(wide.length > near.length);
});

test("a look stamps the ground from the eyes, not from the chase camera", () => {
  const steep = revealLook({ x: 0, y: -150, yaw: 0, pitch: -1.2, skills: { mapping: 0 } });
  const ahead = steep.filter((point) => point.y !== -150 || point.x !== 0);
  assert.ok(ahead.length > 0);
  assert.ok(ahead.some((point) => Math.hypot(point.x, point.y + 150) < 1.2));
  assert.ok(ahead.every((point) => Math.hypot(point.x, point.y + 150) < revealRange({}) + 0.05), ahead);
  const level = revealLook({ x: 0, y: 0, yaw: 0, pitch: 0, skills: { mapping: 0 } });
  const levelHits = level.filter((point) => point.x !== 0 || point.y !== 0);
  assert.ok(levelHits.length > 0);
  assert.ok(levelHits.every((point) => point.y > 0 && point.y < 8), levelHits);
  const feet = [0, -150, 0];
  const eyes = revealLook({ x: feet[0], y: feet[1], yaw: 0, pitch: 0, skills: { mapping: 0 } });
  const chase = revealLook({
    x: feet[0],
    y: feet[1],
    yaw: 0,
    pitch: 0,
    origin: chaseOrigin(feet, 0, 0),
    dir: lookDirection(0, 0),
    skills: { mapping: 0 },
  });
  const eyeHits = eyes.filter((point) => point.x !== feet[0] || point.y !== feet[1]);
  const chaseHits = chase.filter((point) => point.x !== feet[0] || point.y !== feet[1]);
  assert.ok(eyeHits.every((point) => point.y > feet[1]));
  assert.ok(Math.min(...eyeHits.map((point) => point.y)) > Math.min(...chaseHits.map((point) => point.y)));
  const hill = hitGround([0, 0, 2], [0, 1, 0], (x, y) => (y > 6 ? 3 : 0), 16);
  assert.ok(hill.y > 5.5 && hill.y < 7, hill.y);
});

test("the chart picture uses the same projection as the path", () => {
  const plate = createPlate();
  const center = [0, -150];
  const span = 32;
  const size = 220;
  const rect = plateViewRect(plate, center, span, size);
  const world = [12, -140];
  const at = placeOnView(center, world, span, size);
  const mpp = plate.meters / plate.size;
  const left = plate.origin[0] - plate.meters / 2;
  const north = plate.origin[1] + plate.meters / 2;
  const ix = (world[0] - left) / mpp;
  const iy = (north - world[1]) / mpp;
  assert.ok(Math.abs(rect.x + (ix / plate.size) * rect.size - at.x) < 1e-6);
  assert.ok(Math.abs(rect.y + (iy / plate.size) * rect.size - at.y) < 1e-6);
});

test("the wheel zooms the chart and a drag pans it", () => {
  assert.ok(mapSpan(0, 2) < mapSpan(0, 1));
  const dragged = dragCenter([0, -150], 20, -10, 100, 100);
  assert.ok(dragged[0] < 0);
  assert.ok(dragged[1] < -150);
});

test("a plain click on the chart keeps it following; only a real drag stops it", () => {
  assert.equal(isMapDrag(0, 0), false);
  assert.equal(isMapDrag(2, 2), false);
  assert.equal(isMapDrag(10, 0), true);
});

test("a pan stays put until the player recenters; zoom and walking never recenter", () => {
  let follow = true;
  follow = mapFollowAfter(follow, "drag");
  assert.equal(follow, false);
  for (const event of ["zoom", "move", "tick", "click"]) follow = mapFollowAfter(follow, event);
  assert.equal(follow, false, "still panned after zooming and walking");
  follow = mapFollowAfter(follow, "recenter");
  assert.equal(follow, true);
  assert.equal(mapFollowAfter(true, "zoom"), true, "zoom does not stop following");
});

test("reveal range follows the sight sense: default acuity matches the skill formula, focus and optics widen it, range caps it", async () => {
  const { perceptionFrom } = await import("../src/sim/perception.js");
  const skills = { mapping: 70, eyesight: 70 };
  const plain = perceptionFrom({ eyesight: 70 }).senses.sight;
  assert.ok(Math.abs(revealRange(skills, plain) - revealRange(skills)) < 1e-9);
  const focused = perceptionFrom({ eyesight: 70, focus: 140 }).senses.sight;
  assert.ok(revealRange(skills, focused) > revealRange(skills));
  const optics = perceptionFrom({ eyesight: 70 }, { sight: { acuity: 1 } }).senses.sight;
  assert.ok(revealRange(skills, optics) > revealRange(skills, plain));
  assert.equal(revealRange(skills, { acuity: 1, range: 10 }), 10);
  const near = revealLook({ x: 0, y: 0, yaw: 0, pitch: 0, skills, sight: { acuity: 1, range: 10 } });
  assert.ok(near.every((point) => Math.hypot(point.x, point.y) <= 10.05), near);
});

test("following, the chart fits the sight-based reveal radius; the wheel scales the fit; leaving follow keeps the scale", async () => {
  const { followSpan, zoomForSpan, FOLLOW_FIT_MARGIN } = await import("../src/sim/plate.js");
  const { perceptionFrom } = await import("../src/sim/perception.js");
  const sight = perceptionFrom({ eyesight: 70 }).senses.sight;
  const radius = revealRange({ mapping: 70, eyesight: 70 }, sight);
  assert.ok(Math.abs(followSpan(radius) - 2 * radius * FOLLOW_FIT_MARGIN) < 1e-9);
  const sharper = revealRange({ mapping: 70, eyesight: 70 }, perceptionFrom({ eyesight: 70 }, { sight: { acuity: 1 } }).senses.sight);
  assert.ok(followSpan(sharper) > followSpan(radius), "better sight zooms out");
  assert.ok(followSpan(radius, 2) < followSpan(radius), "wheel in zooms in");
  assert.equal(followSpan(0), 16);
  assert.equal(followSpan(1000), 256);
  const span = followSpan(radius);
  assert.ok(Math.abs(mapSpan(70, zoomForSpan(70, span)) - span) < 1e-9, "no jump when a pan leaves follow");
});
