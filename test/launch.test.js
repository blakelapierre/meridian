import assert from "node:assert/strict";
import test from "node:test";
import { benchHref, tiles, trio } from "../tools/launch.js";

test("a check opens a primary, the other client, and a follow view", () => {
  const [primary, second, follow] = trio("/tools/view/index.html?look=dummy");
  assert.match(primary, /id=a/);
  assert.match(primary, /offer=1/);
  assert.match(primary, /look=dummy/);
  assert.match(primary, /to=b%2Cc|to=b,c/);
  assert.match(second, /id=b/);
  assert.match(second, /offer=c/);
  assert.match(follow, /id=c/);
  assert.match(follow, /follow=a/);
  assert.match(follow, /look=dummy/);
  const [tabB, tabA, behind] = trio("/tools/dig/index.html?id=b&to=a");
  assert.match(tabB, /id=b/);
  assert.match(tabA, /id=a/);
  assert.match(tabA, /offer=1/);
  assert.match(behind, /id=c/);
  assert.match(behind, /follow=b/);
});

test("a check is one window whose frames are the three clients", () => {
  const href = benchHref("/tools/view/index.html?look=dummy");
  const bench = new URL(href, "http://127.0.0.1");
  assert.equal(bench.pathname, "/tools/bench/index.html");
  assert.match(bench.searchParams.get("primary"), /look=dummy/);
  assert.match(bench.searchParams.get("primary"), /id=a/);
  assert.match(bench.searchParams.get("second"), /id=b/);
  assert.match(bench.searchParams.get("follow"), /follow=a/);
});
test("the primary pane is widescreen and the three panes do not overlap", () => {
  const boxes = tiles(1920, 1080, 0, 0);
  const aspect = boxes[0].width / boxes[0].height;
  assert.ok(Math.abs(aspect - 16 / 9) < 0.02, String(aspect));
  assert.equal(boxes[0].left + boxes[0].width, boxes[1].left);
  assert.equal(boxes[1].left, boxes[2].left);
  assert.equal(boxes[1].top + boxes[1].height, boxes[2].top);
  assert.ok(boxes[2].left + boxes[2].width <= 1920);
  assert.ok(boxes[2].top + boxes[2].height <= 1080);
  assert.ok(boxes[0].top + boxes[0].height <= 1080);
});
