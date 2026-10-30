import assert from "node:assert/strict";
import test from "node:test";
import { GEO_COLOR, createPlate, dragCenter, hitGround, mapSpan, placeOnView, plateViewRect, revealLook, revealRange, samplePlate, stamp } from "../src/sim/plate.js";
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

test("a look stamps the ground under the view, not a flat guess ahead of the feet", () => {
  const steep = revealLook({ x: 0, y: -150, yaw: 0, pitch: -1.2, skills: { mapping: 0 } });
  const ahead = steep.filter((point) => point.y !== -150 || point.x !== 0);
  assert.ok(ahead.length > 0);
  assert.ok(ahead.some((point) => Math.hypot(point.x, point.y + 150) < 1.2));
  assert.ok(ahead.every((point) => Math.hypot(point.x, point.y + 150) < revealRange({}) + 0.05), ahead);
  const level = revealLook({ x: 0, y: 0, yaw: 0, pitch: 0, skills: { mapping: 0 } });
  const levelHits = level.filter((point) => point.x !== 0 || point.y !== 0);
  assert.ok(levelHits.length > 0);
  assert.ok(levelHits.every((point) => point.y > 0 && point.y < 8), levelHits);
  const behind = [0, -153.4, 2.2];
  const chase = revealLook({
    x: 0,
    y: -150,
    yaw: 0,
    pitch: -0.45,
    origin: behind,
    dir: lookDirection(0, -0.45),
    skills: { mapping: 0 },
  });
  assert.ok(chase.length > 1);
  assert.ok(chase.every((point) => Math.hypot(point.x, point.y + 150) < revealRange({}) + 0.05), chase);
  const feet = [0, -150, 0];
  const origin = chaseOrigin(feet, 0, 0);
  const levelChase = revealLook({
    x: feet[0],
    y: feet[1],
    yaw: 0,
    pitch: 0,
    origin,
    dir: lookDirection(0, 0),
    skills: { mapping: 0 },
  });
  const near = levelChase.filter((point) => point.x !== feet[0] || point.y !== feet[1]);
  assert.ok(near.length > 0);
  const closest = Math.min(...near.map((point) => Math.hypot(point.x - feet[0], point.y - feet[1])));
  assert.ok(closest < 6, closest);
  assert.ok(near.every((point) => point.y > origin[1]));
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
