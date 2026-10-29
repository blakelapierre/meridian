import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { cast } from "../src/engine/cast.js";
import { acceptWall, encodeWall } from "../src/net/walls.js";
import { createIdentity } from "../src/net/identity.js";
import { adoptSalvage, adoptWall, cellOnGround, createYard, pieceBoxes, pieceIntegrity, placeTicks, tryPlaceWall, trySalvage } from "../src/sim/build.js";
import { lookDirection } from "../src/sim/hands.js";

const atoll = JSON.parse(readFileSync(new URL("../content/atoll.json", import.meta.url)));

test("a wall on the ruin stands and a wall in the sand does not", () => {
  const yard = createYard(atoll.placements.footing);
  const footing = yard.pieces[0].at;
  const beside = [footing[0] + 1, footing[1]];
  assert.equal(tryPlaceWall(yard, beside).ok, true);
  assert.equal(yard.metal, 24);
  assert.equal(tryPlaceWall(yard, [footing[0] + 3, footing[1]]).reason, "support");
  assert.equal(yard.metal, 24);
  const boxes = pieceBoxes(yard.pieces);
  const wall = boxes[1];
  const hit = cast(
    [wall.min[0] - 1, (wall.min[1] + wall.max[1]) / 2, 1],
    [1, 0, 0],
    boxes,
  );
  assert.equal(hit.object, wall);
});

test("the other browser adopts the wall without paying", () => {
  const leader = createYard(atoll.placements.footing);
  const witness = createYard(atoll.placements.footing);
  const cell = [leader.pieces[0].at[0], leader.pieces[0].at[1] + 1];
  assert.equal(tryPlaceWall(leader, cell).ok, true);
  const frame = encodeWall(createIdentity(), { nonce: 1, cell });
  const accepted = acceptWall(frame);
  assert.equal(adoptWall(witness, accepted.cell).ok, true);
  assert.equal(witness.metal, 30);
  assert.equal(witness.pieces.length, 2);
});

test("building skill shortens the raise and starts the wall stronger", () => {
  assert.equal(placeTicks(0), 12 * 30);
  assert.equal(placeTicks(140), Math.round(12 * 30 * 0.6));
  assert.equal(pieceIntegrity(0), 80);
  assert.equal(pieceIntegrity(140), 120);
  const yard = createYard(atoll.placements.footing);
  const cell = [yard.pieces[0].at[0] + 1, yard.pieces[0].at[1]];
  assert.equal(tryPlaceWall(yard, cell, 140).ok, true);
  assert.equal(yard.pieces.at(-1).integrity, 120);
  const frame = encodeWall(createIdentity(), { nonce: 2, cell, integrity: 120 });
  const accepted = acceptWall(frame);
  assert.equal(accepted.integrity, 120);
});

test("a fractional building skill still produces a wall the other client can adopt", () => {
  const integrity = pieceIntegrity(1);
  assert.equal(Number.isInteger(integrity), true);
  const yard = createYard(atoll.placements.footing);
  const cell = [yard.pieces[0].at[0] + 1, yard.pieces[0].at[1]];
  const frame = encodeWall(createIdentity(), { nonce: 3.9, cell, integrity: integrity + 0.4 });
  const accepted = acceptWall(frame);
  assert.equal(accepted.integrity, integrity);
  assert.equal(adoptWall(createYard(atoll.placements.footing), accepted.cell, accepted.integrity).ok, true);
});

test("salvage returns the metal and a wall that lost its footing falls", () => {
  const lone = createYard(atoll.placements.footing);
  const beside = [lone.pieces[0].at[0] + 1, lone.pieces[0].at[1]];
  tryPlaceWall(lone, beside);
  assert.equal(trySalvage(lone, beside).ok, true);
  assert.equal(lone.metal, 30);
  const yard = createYard(atoll.placements.footing);
  const footing = yard.pieces[0].at;
  const next = [footing[0] + 1, footing[1]];
  const further = [footing[0] + 2, footing[1]];
  tryPlaceWall(yard, next);
  tryPlaceWall(yard, further);
  assert.equal(trySalvage(yard, next).ok, true);
  assert.equal(yard.metal, 24);
  assert.equal(yard.pieces.some((piece) => piece.id === "wall"), false);
  const witness = createYard(atoll.placements.footing);
  tryPlaceWall(witness, next);
  adoptSalvage(witness, next);
  assert.equal(witness.metal, 24);
  assert.equal(witness.pieces.length, 1);
});

test("looking at the ground next to your feet picks a cell", () => {
  const eye = [0, -140, 1.65];
  const dir = lookDirection(0, -1.1);
  const cell = cellOnGround(eye, dir);
  assert.ok(cell);
  assert.ok(Math.abs(cell[1] * 0.5 - eye[1]) < 2);
});
