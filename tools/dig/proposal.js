import { DIG_SAMPLE_MM, VOXEL_CM } from "../../src/sim/crust.js";
import { signProposal, terrainBody } from "../../src/sim/oplog.js";

// The one dig both tabs agree on: voxel (0,0,-1) of atoll-0. The written value comes from
// the crust, so a voxel-size change (Batch 4 went 50 cm -> 25 cm) cannot leave this harness
// proposing a sample the edit rule refuses.
export const DIG_VOXEL = [0, 0, -1];

export function digProposal(identity, log) {
  const near = VOXEL_CM; // integer cm: canonical cbor has no floats
  return signProposal(identity, {
    cell: "atoll-0",
    nonce: 1,
    body: terrainBody({
      cell: "atoll-0",
      eye: [near, near, 165],
      aim: [near, near, -near],
      chunk: [0, 0, -1],
      before: log.crust.hash(0, 0, -1),
      mode: "dig",
      writes: [{ i: DIG_VOXEL[0], j: DIG_VOXEL[1], k: DIG_VOXEL[2], sdf_mm: DIG_SAMPLE_MM }],
    }),
  });
}

export { DIG_SAMPLE_MM };
