import assert from "node:assert/strict";
import test from "node:test";
import { Crust } from "../src/sim/crust.js";
import { acceptEdit } from "../src/sim/edit.js";

function proposal(crust, write = { i: 0, j: 0, k: -1, sdf_mm: 250 }) {
  return {
    eye: [25, 25, 165],
    aim: [25, 25, 15],
    chunk: [0, 0, -1],
    before: crust.hash(0, 0, -1),
    mode: "dig",
    spoilRoom: 1,
    writes: [write],
  };
}

test("a dig is refused unless localEdits or a cert allows it", () => {
  const crust = new Crust();
  const before = crust.sampleIndex(0, 0, -1);
  assert.equal(acceptEdit(crust, proposal(crust)).reason, "flag");
  assert.equal(crust.sampleIndex(0, 0, -1), before);
  assert.equal(acceptEdit(crust, proposal(crust), { localEdits: true, strike: true }).reason, "strike");
  assert.equal(acceptEdit(crust, proposal(crust), { localEdits: true }).ok, true);
  assert.equal(crust.sampleIndex(0, 0, -1), 250);
});

test("two clients that accept the same dig share a chunk hash", () => {
  const left = new Crust();
  const right = new Crust();
  assert.equal(acceptEdit(left, proposal(left), { certified: true }).ok, true);
  assert.equal(acceptEdit(right, proposal(right), { localEdits: true }).ok, true);
  assert.equal(Buffer.compare(left.hash(0, 0, -1), right.hash(0, 0, -1)), 0);
  const stale = new Crust();
  const bad = proposal(stale);
  bad.before = Buffer.alloc(32);
  assert.equal(acceptEdit(stale, bad, { certified: true }).reason, "hash");
  const far = proposal(stale, { i: 0, j: 0, k: -20, sdf_mm: 250 });
  assert.equal(acceptEdit(stale, far, { certified: true }).reason, "reach");
});
