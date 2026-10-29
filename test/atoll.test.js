import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { cast } from "../src/engine/cast.js";

const atoll = JSON.parse(readFileSync(new URL("../content/atoll.json", import.meta.url), "utf8"));

function inside(point, volume) {
  return point.x >= volume.min.x && point.x < volume.max.x
    && point.y >= volume.min.y && point.y < volume.max.y
    && point.z >= volume.min.z && point.z < volume.max.z;
}

test("atoll distances match the site record", () => {
  const south = atoll.site.insertions.find((item) => item.id === "south").volume;
  const centerY = (south.min.y + south.max.y) / 2;
  const door = atoll.props.find((prop) => prop.id === "door.south").box;
  assert.equal(Math.abs(centerY - door.min.y), atoll.metrics.southInsertionCenterToSouthDoorCm);
  const dummy = atoll.placements.dummy;
  const pad = atoll.placements.accuracyPad;
  assert.equal(Math.hypot(dummy.x - pad.x, dummy.y - pad.y), atoll.metrics.dummyFromAccuracyPadCm);
  assert.equal(atoll.site.volume.min.y - atoll.placements.spawnFeet.y, atoll.metrics.spawnSouthOfStrikeVolumeCm);
  assert.equal(inside(atoll.placements.spawnFeet, atoll.site.volume), false);
});

test("a ray from the accuracy pad hits the dummy", () => {
  const pad = atoll.placements.accuracyPad;
  const dummy = atoll.placements.dummy;
  const eye = [pad.x / 100, pad.y / 100, 1.65];
  const center = [dummy.x / 100, dummy.y / 100, 0.9];
  const dx = center[0] - eye[0];
  const dy = center[1] - eye[1];
  const dz = center[2] - eye[2];
  const len = Math.hypot(dx, dy, dz);
  const hit = cast(eye, [dx / len, dy / len, dz / len], [{
    type: "sphere",
    origin: center,
    radius: 0.35,
    color: [1, 0, 0, 1],
    body: "dummy",
  }]);
  assert.equal(hit.object.body, "dummy");
  assert.ok(Math.abs(hit.t - 10) < 1.5);
});
