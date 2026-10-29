import assert from "node:assert/strict";
import test from "node:test";
import { dummyTexture, sandTexture } from "../src/render/texture.js";

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
