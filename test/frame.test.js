import assert from "node:assert/strict";
import test from "node:test";
import { frameCamera } from "../src/sim/body.js";

function viewAngle(origin, dir, point) {
  const vx = point[0] - origin[0];
  const vy = point[1] - origin[1];
  const vz = point[2] - origin[2];
  const dist = Math.hypot(vx, vy, vz) || 1;
  const dot = (vx * dir[0] + vy * dir[1] + vz * dir[2]) / dist;
  return Math.acos(Math.min(1, Math.max(-1, dot)));
}

test("an active target pulls the camera out so the body and the target both fit", () => {
  const feet = [0, 0, 0];
  const target = [8, 6, 1];
  const framed = frameCamera(feet, target, 3.4);
  assert.ok(framed);
  assert.ok(framed.distance > 3.4);
  const chest = [0, 0, 0.9];
  const half = (70 * Math.PI) / 180 / 2;
  assert.ok(viewAngle(framed.origin, framed.dir, chest) < half);
  assert.ok(viewAngle(framed.origin, framed.dir, target) < half);
  const flat = Math.hypot(target[0], target[1]) || 1;
  const right = [-target[1] / flat, target[0] / flat, 0];
  const bodySide = chest[0] * right[0] + chest[1] * right[1];
  const targetSide = (target[0] - framed.origin[0]) * right[0] + (target[1] - framed.origin[1]) * right[1];
  const originSide = (framed.origin[0]) * right[0] + framed.origin[1] * right[1];
  assert.notEqual(Math.sign(originSide), 0);
  assert.ok(Math.abs(targetSide - bodySide) > 0.4);
});

test("a target underfoot does not steal the camera", () => {
  assert.equal(frameCamera([1, 2, 0], [1.1, 2.1, 1], 3.4), null);
});
