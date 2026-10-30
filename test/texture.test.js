import assert from "node:assert/strict";
import test from "node:test";
import { grassTexture, rockTexture, sandTexture } from "../src/render/texture.js";

function seam(tex) {
  let worst = 0;
  for (let y = 0; y < tex.height; y += 1) {
    const left = (y * tex.width) * 4;
    const right = (y * tex.width + tex.width - 1) * 4;
    worst = Math.max(worst, Math.abs(tex.data[left] - tex.data[right]));
  }
  return worst;
}

test("grass and rock tiles vary, and the sand grain meets at the side", () => {
  const sand = sandTexture();
  const grass = grassTexture();
  const rock = rockTexture();
  assert.equal(sand.width, 128);
  assert.equal(grass.height, 128);
  assert.notEqual(grass.data[1], grass.data[80]);
  assert.notEqual(rock.data[0], rock.data[64]);
  assert.ok(seam(sand) < 40, seam(sand));
});
