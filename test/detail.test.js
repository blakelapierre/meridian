import assert from "node:assert/strict";
import test from "node:test";
import { createDetail } from "../src/render/detail.js";

test("a moving view stays coarse and a still view climbs to a full frame", () => {
  const detail = createDetail();
  const moving = detail.sample("a", 16);
  assert.equal(moving.level, 0);
  assert.ok(moving.coarse < 0.4);
  assert.ok(moving.radius < 0.2);
  assert.ok(moving.near < 8);
  let still = moving;
  for (let frame = 0; frame < 20; frame++) still = detail.sample("a", 16);
  assert.ok(still.level > 0.95);
  assert.ok(still.coarse > 0.95);
  assert.ok(still.radius > 0.7);
  assert.ok(still.near > 60);
  const again = detail.sample("b", 16);
  assert.equal(again.level, 0);
  assert.ok(again.radius < 0.2);
});

test("a slow still frame gives the detail back", () => {
  const detail = createDetail();
  detail.sample("a", 16);
  for (let frame = 0; frame < 10; frame++) detail.sample("a", 16);
  const before = detail.level;
  const eased = detail.sample("a", 40);
  assert.ok(eased.level < before);
});
