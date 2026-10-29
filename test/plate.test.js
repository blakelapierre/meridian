import assert from "node:assert/strict";
import test from "node:test";
import { GEO_COLOR, createPlate, dragCenter, mapSpan, revealLook, revealRange, samplePlate, stamp } from "../src/sim/plate.js";

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
  const wide = revealLook({ x: 0, y: -150, yaw: 0, pitch: 0, skills: { mapping: 140 } });
  assert.ok(wide.length > near.length);
});

test("the wheel zooms the chart and a drag pans it", () => {
  assert.ok(mapSpan(0, 2) < mapSpan(0, 1));
  const dragged = dragCenter([0, -150], 20, -10, 100, 100);
  assert.ok(dragged[0] < 0);
  assert.ok(dragged[1] < -150);
});
