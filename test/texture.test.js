import assert from "node:assert/strict";
import test from "node:test";
import { dummyTexture, SAND_TILE, sandTexture, WOOD_TILE } from "../src/render/texture.js";
import { SPHERE_BUDGET } from "../src/render/gpu.js";

test("a sphere texture is not a flat color", () => {
  const tex = dummyTexture();
  const sand = sandTexture();
  const colors = new Set();
  for (let i = 0; i < tex.data.length; i += 16) colors.add(tex.data[i]);
  const grains = new Set();
  for (let i = 0; i < sand.data.length; i += 16) grains.add(sand.data[i]);
  assert.equal(tex.width, 128);
  assert.ok(colors.size > 1);
  assert.ok(grains.size > 1);
});

test("body spheres cannot overwrite the sand or wood tiles", () => {
  assert.ok(SAND_TILE >= SPHERE_BUDGET);
  assert.ok(WOOD_TILE >= SPHERE_BUDGET);
  assert.notEqual(SAND_TILE, WOOD_TILE);
});
