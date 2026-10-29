import assert from "node:assert/strict";
import test from "node:test";
import { cast } from "../src/engine/cast.js";
import { loadCatalog } from "../src/sim/catalog.js";
import { certifyShot, healthOnCert } from "../src/sim/cert.js";
import { strikeDamage, WEAPONS } from "../src/sim/damage.js";

const { atoll } = loadCatalog();

function witness(dir) {
  const pad = atoll.placements.accuracyPad;
  const dummy = atoll.placements.dummy;
  const eye = [pad.x / 100, pad.y / 100, 1.65];
  const hit = cast(eye, dir, [{
    type: "sphere",
    origin: [dummy.x / 100, dummy.y / 100, 0.9],
    radius: 0.35,
    color: [1, 0, 0, 1],
    body: "dummy",
  }]);
  return hit && hit.object && hit.object.body === "dummy" ? "hit" : "miss";
}

test("two honest misses beat a liar who always says hit", () => {
  const honest = witness([0, 0, 1]);
  assert.equal(honest, "miss");
  const cert = certifyShot(["hit", honest, honest]);
  assert.equal(cert, "miss");
  assert.equal(healthOnCert(100, cert, strikeDamage(WEAPONS.line, "chest")), 100);
});

test("two honest hits commit the line damage", () => {
  const pad = atoll.placements.accuracyPad;
  const dummy = atoll.placements.dummy;
  const eye = [pad.x / 100, pad.y / 100, 1.65];
  const center = [dummy.x / 100, dummy.y / 100, 0.9];
  const dx = center[0] - eye[0];
  const dy = center[1] - eye[1];
  const dz = center[2] - eye[2];
  const length = Math.hypot(dx, dy, dz);
  const honest = witness([dx / length, dy / length, dz / length]);
  const cert = certifyShot([honest, honest, "miss"]);
  assert.equal(cert, "hit");
  assert.equal(healthOnCert(100, cert, strikeDamage(WEAPONS.line, "chest")), 72);
});
