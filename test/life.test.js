import assert from "node:assert/strict";
import test from "node:test";
import { crabParts, duneHeight, fauna, floraParts, groundLook, gullParts, HILL, standHeight } from "../src/sim/life.js";

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
  const crabWidth = calm.find((animal) => animal.kind === "crab").parts;
  assert.ok(crabWidth.length >= 12);
  const skink = calm.find((animal) => animal.kind === "skink");
  assert.ok(skink.parts.length >= 10);
  const goat = calm.find((animal) => animal.kind === "graze");
  assert.ok(goat.parts.length >= 12);
  assert.ok(skink.parts.some((part) => part.tile === "scale"));
  assert.ok(goat.parts.some((part) => part.tile === "horn"));
  const legs = crabParts([0, 0, 0], 0, 0);
  const stepped = crabParts([0, 0, 0], 0, 280);
  const leg = (parts) => parts.find((part) => part.kind === "capsule" && part.r < 0.015);
  assert.ok(leg(legs) && leg(stepped));
  assert.ok(Math.hypot(leg(legs).b[0] - leg(stepped).b[0], leg(legs).b[2] - leg(stepped).b[2]) > 0.01);
  const plants = floraParts();
  assert.ok(plants.length >= 40);
  assert.ok(plants.some((plant) => plant.tile === "leaf"));
  assert.ok(plants.some((plant) => plant.tile === "bark"));
  let treeTop = 0;
  for (const plant of plants) {
    assert.ok(plant.at[2] > -0.5);
    treeTop = Math.max(treeTop, plant.at[2] + plant.radius);
  }
  assert.ok(treeTop > 2, treeTop);
});

test("skipping meshes still places the same animals", () => {
  const light = fauna(0, [80, 80], { parts: false });
  const full = fauna(0, [80, 80]);
  assert.deepEqual(light.map((animal) => animal.kind), full.map((animal) => animal.kind));
  assert.equal(light.every((animal) => !animal.parts), true);
  const gull = light.find((animal) => animal.kind === "gull");
  const placed = full.find((animal) => animal.kind === "gull");
  assert.deepEqual(gull.at, placed.at);
});

test("the gull has a wingspan, a beak, and a wingbeat", () => {
  const gull = fauna(0, [80, 80]).find((animal) => animal.kind === "gull");
  const later = gullParts(420);
  assert.ok(gull.parts.length >= 8, gull.parts.length);
  assert.ok(gull.parts.some((part) => part.kind === "triangle"));
  assert.ok(gull.parts.some((part) => part.kind === "capsule"));
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
