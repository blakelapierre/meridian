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
