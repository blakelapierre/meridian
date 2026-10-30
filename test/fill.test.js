import assert from "node:assert/strict";
import test from "node:test";
import { acceptEdit } from "../src/sim/edit.js";
import { Crust } from "../src/sim/crust.js";

test("fill closes an open voxel and refuses solid ground", () => {
  const crust = new Crust();
  const open = {
    eye: [25, 25, 165],
    aim: [25, 25, 15],
    chunk: [0, 0, -1],
    mode: "fill",
    spoilRoom: 1,
    writes: [{ i: 0, j: 0, k: -1, sdf_mm: -500 }],
  };
  assert.equal(acceptEdit(crust, open, { localEdits: true }).reason, "fill");
  crust.write(0, 0, -1, 500);
  assert.equal(acceptEdit(crust, open, { localEdits: true }).ok, true);
  assert.ok(crust.sampleIndex(0, 0, -1) < 0);
});

test("smooth moves a voxel toward zero and refuses a jump past half a meter", () => {
  const crust = new Crust();
  crust.write(0, 0, -1, 500);
  const eye = [25, 25, 165];
  const aim = [25, 25, 15];
  const moved = {
    eye,
    aim,
    chunk: [0, 0, -1],
    mode: "smooth",
    spoilRoom: 1,
    writes: [{ i: 0, j: 0, k: -1, sdf_mm: 0 }],
  };
  assert.equal(acceptEdit(crust, moved, { localEdits: true }).ok, true);
  assert.equal(crust.sampleIndex(0, 0, -1), 0);
  crust.write(0, 0, -1, 500);
  const jumped = { ...moved, writes: [{ i: 0, j: 0, k: -1, sdf_mm: -500 }] };
  assert.equal(acceptEdit(crust, jumped, { localEdits: true }).reason, "smooth");
});
