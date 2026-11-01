import assert from "node:assert/strict";
import test from "node:test";
import { chaseOrigin, playerParts, rayMisses } from "../src/sim/body.js";
import { lookDirection } from "../src/sim/hands.js";
import { kitList, kitRead } from "../src/sim/kit.js";

test("worn cloth, a plate, and a pack read on the body without covering the chase ray", () => {
  assert.deepEqual(kitList(["cloth", "pack", "loft"]), ["cloth", "pack"]);
  assert.equal(kitRead({ back: "pack", tool: "bit" }), "pack");
  assert.equal(kitRead(["long"]), "long gun");
  assert.equal(kitRead(["plate", "helm"]), "plate");
  const feet = [4, -8, 0];
  const worn = ["cloth", "plate", "pack", "long", "bit", "hammer"];
  for (const crouch of [false, true]) {
    for (const pitch of [0, -0.35, 0.4]) {
      const parts = playerParts(feet, 0.4, crouch, { worn });
      const origin = chaseOrigin(feet, 0.4, pitch, crouch);
      const dir = lookDirection(0.4, pitch);
      assert.equal(rayMisses(origin, dir, parts), true, `pitch ${pitch} crouch ${crouch}`);
    }
  }
  const geared = playerParts([0, 0, 0], 0, false, { worn: ["plate", "bit"] });
  assert.ok(geared.some((part) => part.tile === "metal"));
  assert.ok(geared.some((part) => part.kind === "box"));
  const bare = playerParts([0, 0, 0], 0, false);
  assert.equal(bare.length, 14);
  assert.ok(bare.some((part) => part.tile === "skin"));
  assert.ok(bare.some((part) => part.tile === "cloth"));
  assert.ok(bare.some((part) => part.tile === "hair"));
  assert.ok(geared.length > 14);
});
