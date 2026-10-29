import assert from "node:assert/strict";
import test from "node:test";
import { ageStructure, isGrounded } from "../src/sim/support.js";

function piece(id, x, extra = {}) {
  return {
    id,
    cell: [x, 0, 0],
    integrity: 100,
    metal: 6,
    anchors: false,
    collapsed: false,
    ...extra,
  };
}

test("a wall on the ruin footing stays up and a loose wall does not", () => {
  const ruin = piece("ruin", 0, { anchors: true, metal: 4 });
  const wall = piece("wall", 1);
  assert.equal(isGrounded([ruin, wall], wall), true);
  ageStructure([ruin, wall], 10);
  assert.equal(wall.collapsed, false);
  assert.equal(wall.integrity, 100);

  const loose = piece("loose", 5);
  assert.equal(isGrounded([loose], loose), false);
  ageStructure([loose], 5);
  assert.equal(loose.collapsed, true);
  assert.equal(loose.spoil, 3);
});

test("support reaches eight pieces and fails on the ninth", () => {
  const chain = [piece("ruin", 0, { anchors: true, metal: 4 })];
  for (let x = 1; x <= 9; x++) chain.push(piece(`w${x}`, x));
  assert.equal(isGrounded(chain, chain[8]), true);
  assert.equal(isGrounded(chain, chain[9]), false);
});
