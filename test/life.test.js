import assert from "node:assert/strict";
import test from "node:test";
import { duneHeight, fauna, floraBoxes, groundLook, gullParts, HILL, standHeight } from "../src/sim/life.js";

test("hills reach about three body heights and a pit is still the floor", () => {
  let low = 99;
  let high = -1;
  for (let x = -80; x <= 80; x += 1) {
    for (let y = -200; y <= -80; y += 1) {
      const height = duneHeight(x, y);
      if (height < low) low = height;
      if (height > high) high = height;
    }
  }
  assert.ok(high > 4, high);
  assert.ok(high <= HILL + 0.001, high);
  assert.ok(low >= -0.001, low);
  assert.equal(HILL, 5.4);
  assert.equal(standHeight(0, -150, -1.2), -1.2);
  assert.equal(standHeight(0, -150, 0), duneHeight(0, -150));
});

test("the map color follows the slope, not a flat sand swatch", () => {
  const seen = new Set();
  for (let x = -40; x <= 40; x += 2) {
    for (let y = -180; y <= -100; y += 2) seen.add(groundLook(x, y).kind);
  }
  assert.equal(seen.has("sand"), true);
  assert.equal(seen.has("grass"), true);
  assert.equal(seen.has("rock"), true);
  const low = groundLook(0, -150);
  assert.ok(low.color[0] > low.color[2]);
});

test("the crab steps away and the plants sit on the roll", () => {
  const calm = fauna(0, [80, 80]);
  const crab = calm.find((animal) => animal.kind === "crab");
  const near = fauna(0, [crab.at[0], crab.at[1]]).find((animal) => animal.kind === "crab");
  assert.ok(Math.hypot(near.at[0] - crab.at[0], near.at[1] - crab.at[1]) > 0.8);
  assert.equal(calm.length, 6);
  assert.equal(calm.filter((animal) => animal.kind === "graze").length, 3);
  const plants = floraBoxes();
  assert.ok(plants.length >= 6);
  for (const plant of plants) {
    assert.ok(plant.max[2] > plant.min[2]);
    assert.ok(plant.min[2] > -0.5);
  }
});

test("the gull has a wingspan, a beak, and a wingbeat", () => {
  const gull = fauna(0, [80, 80]).find((animal) => animal.kind === "gull");
  const later = gullParts(420);
  assert.ok(gull.parts.length >= 24, gull.parts.length);
  let reach = 0;
  for (const part of gull.parts) {
    reach = Math.max(reach, Math.hypot(part.at[0] - gull.at[0], part.at[1] - gull.at[1], part.at[2] - gull.at[2]));
  }
  assert.ok(reach > 0.8, reach);
  const pose = gullParts(0);
  const forward = [Math.sin(pose.yaw), Math.cos(pose.yaw), 0];
  const beak = pose.parts.find((part) => part.color[0] > 0.8 && part.color[1] < 0.8);
  assert.ok(beak);
  const ahead = (beak.at[0] - pose.at[0]) * forward[0] + (beak.at[1] - pose.at[1]) * forward[1];
  assert.ok(ahead > 0.3, ahead);
  assert.ok(pose.parts.some((part) => part.color[0] < 0.2));
  const tipLift = (frame) => {
    let best = null;
    let far = -1;
    for (const part of frame.parts) {
      const flat = Math.hypot(part.at[0] - frame.at[0], part.at[1] - frame.at[1]);
      if (flat > far) {
        far = flat;
        best = part;
      }
    }
    return best.at[2] - frame.at[2];
  };
  assert.ok(Math.abs(tipLift(pose) - tipLift(later)) > 0.08);
});
