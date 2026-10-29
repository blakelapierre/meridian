import assert from "node:assert/strict";
import test from "node:test";
import { DAY_TICKS, finFluxPerMin, sunDirection, SUN_MULTIPLIER } from "../src/sim/sun.js";

test("a solar fin makes more flux at noon than at midnight", () => {
  assert.equal(SUN_MULTIPLIER, 1);
  const up = [0, 0, 1];
  const noon = sunDirection(DAY_TICKS / 4);
  const midnight = sunDirection((DAY_TICKS * 3) / 4);
  assert.ok(finFluxPerMin(up, noon) > finFluxPerMin(up, midnight));
  assert.equal(finFluxPerMin(up, noon), 10);
  assert.equal(finFluxPerMin(up, midnight), 0);
  assert.equal(Number.isInteger(finFluxPerMin(up, noon)), true);
});
