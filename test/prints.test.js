import assert from "node:assert/strict";
import test from "node:test";
import { createIdentity } from "../src/net/identity.js";
import { acceptPrint, encodePrint } from "../src/net/prints.js";
import { addPrint } from "../src/sim/prints.js";

test("a short step does not stack, and a stride does", () => {
  const prints = [];
  assert.equal(addPrint(prints, { x: 1, y: 2, yaw: 0, who: "a" }), true);
  assert.equal(addPrint(prints, { x: 1.2, y: 2, yaw: 0, who: "a" }), false);
  assert.equal(addPrint(prints, { x: 2.2, y: 2, yaw: 0.4, who: "a" }), true);
  assert.equal(prints.length, 2);
});

test("a signed footstep round-trips onto the ground", () => {
  const frame = encodePrint(createIdentity(), { nonce: 4, x: 1.25, y: -150.5, yaw: 0.5 });
  const accepted = acceptPrint(frame);
  assert.equal(accepted.ok, true);
  assert.equal(accepted.x, 1.25);
  assert.equal(accepted.y, -150.5);
  assert.equal(accepted.yaw, 0.5);
});
