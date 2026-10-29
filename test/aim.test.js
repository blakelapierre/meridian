import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { toolAim } from "../src/sim/aim.js";
import { createYard, pieceBoxes } from "../src/sim/build.js";
import { Crust } from "../src/sim/crust.js";
import { lookDirection } from "../src/sim/hands.js";

const atoll = JSON.parse(readFileSync(new URL("../content/atoll.json", import.meta.url)));

function world(pieces) {
  return [{ type: "crust", field: new Crust(atoll.worldSeed, atoll.cellId) }, ...pieceBoxes(pieces)];
}

test("the bit lights the sand underfoot and ignores a wall out of reach", () => {
  const yard = createYard(atoll.placements.footing);
  const near = toolAim("bit", [0, -140, 1.65], lookDirection(0, -1.2), world(yard.pieces), yard.pieces);
  assert.equal(near.inRange, true);
  assert.equal(near.kind, "ground");
  const far = toolAim("bit", [0, -140, 1.65], lookDirection(0, -0.2), world(yard.pieces), yard.pieces);
  assert.equal(far.inRange, false);
});

test("the hammer lights a wall inside 4 m and not one past it", () => {
  const yard = createYard(atoll.placements.footing);
  const footing = yard.pieces[0].at;
  const wall = [footing[0] + 1, footing[1]];
  yard.pieces.push({ id: "wall", at: wall, anchors: false });
  const eye = [wall[0] * 0.5, wall[1] * 0.5 - 2, 1.2];
  const toward = [0, 1, -0.05];
  const hit = toolAim("hammer", eye, toward, world(yard.pieces), yard.pieces);
  assert.equal(hit.inRange, true);
  assert.equal(hit.kind, "wall");
  const missed = toolAim("hammer", [eye[0], eye[1] - 6, eye[2]], toward, world(yard.pieces), yard.pieces);
  assert.equal(missed.inRange, false);
});
