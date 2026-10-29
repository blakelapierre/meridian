import assert from "node:assert/strict";
import test from "node:test";
import { createFps } from "../src/render/fps.js";

test("the counter is painted frames, so a 1fps window reads 1", () => {
  const fps = createFps();
  fps.paint(0);
  for (let i = 1; i <= 30; i++) fps.paint(Math.round((i * 500) / 30));
  assert.equal(fps.value, 60);
  const slow = createFps();
  slow.paint(0);
  slow.paint(1000);
  assert.equal(slow.value, 1);
});
