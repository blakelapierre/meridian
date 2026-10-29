import assert from "node:assert/strict";
import test from "node:test";
import { tiles, trio } from "../tools/launch.js";

test("a check opens a primary, the other client, and a follow view", () => {
  const [primary, second, follow] = trio("/tools/view/index.html?look=dummy");
  assert.match(primary, /id=a/);
  assert.match(primary, /offer=1/);
  assert.match(primary, /look=dummy/);
  assert.match(second, /id=b/);
  assert.match(second, /to=a/);
  assert.doesNotMatch(second, /offer=1/);
  assert.match(follow, /^\/tools\/view\/index.html\?/);
  assert.match(follow, /follow=a/);
  assert.match(follow, /look=dummy/);
  const [tabB, tabA, behind] = trio("/tools/dig/index.html?id=b&to=a");
  assert.match(tabB, /id=b/);
  assert.match(tabA, /id=a/);
  assert.match(tabA, /offer=1/);
  assert.match(behind, /follow=b/);
});

test("the three windows sit side by side without overlap", () => {
  const boxes = tiles(1800, 1000, 12, 40);
  assert.equal(boxes.length, 3);
  assert.equal(boxes[0].left + boxes[0].width, boxes[1].left);
  assert.equal(boxes[1].left + boxes[1].width, boxes[2].left);
  assert.equal(boxes[0].top, 40);
  assert.equal(boxes[2].top, 40);
  assert.equal(boxes[0].height, 1000);
  assert.ok(boxes[0].width + boxes[1].width + boxes[2].width <= 1800);
});
