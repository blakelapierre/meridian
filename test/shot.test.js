import assert from "node:assert/strict";
import test from "node:test";
import { cast } from "../src/engine/cast.js";
import { loadCatalog } from "../src/sim/catalog.js";
import { angularOffset, coneRadians, shotDirection } from "../src/sim/shot.js";

const { atoll, catalog } = loadCatalog();
const line = catalog.weapons.find((weapon) => weapon.id === "line");

function sight() {
  const pad = atoll.placements.accuracyPad;
  const dummy = atoll.placements.dummy;
  const eye = [pad.x / 100, pad.y / 100, 1.65];
  const center = [dummy.x / 100, dummy.y / 100, 0.9];
  const dx = center[0] - eye[0];
  const dy = center[1] - eye[1];
  const dz = center[2] - eye[2];
  const length = Math.hypot(dx, dy, dz);
  return {
    eye,
    forward: [dx / length, dy / length, dz / length],
    dummy: { type: "sphere", origin: center, radius: 0.35, color: [1, 0, 0, 1], body: "dummy" },
  };
}

test("a standing line at 10 m stays on the sight and hits the dummy", () => {
  const { eye, forward, dummy } = sight();
  const cone = coneRadians(line, 0, false);
  for (let seed = 1; seed <= 32; seed++) {
    const direction = shotDirection(forward, cone, seed);
    assert.ok(angularOffset(forward, direction) <= cone + 1e-9);
    const hit = cast(eye, direction, [dummy]);
    assert.equal(hit.object.body, "dummy");
  }
});

test("a sprinting line leaves the standing sight more often than not", () => {
  const { forward } = sight();
  const standing = coneRadians(line, 0, false);
  const sprint = coneRadians(line, 6.6, false);
  assert.ok(Math.abs(sprint - standing * 2.5) < 1e-12);
  let offSight = 0;
  const samples = 64;
  for (let seed = 1; seed <= samples; seed++) {
    const direction = shotDirection(forward, sprint, seed);
    if (angularOffset(forward, direction) > standing) offSight += 1;
  }
  assert.ok(offSight > samples / 2, offSight);
});
