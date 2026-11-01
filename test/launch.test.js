import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { aiHrefs, benchHref, bootOrder, tiles, trio } from "../tools/launch.js";

test("a check opens a primary, the other client, and a follow view", () => {
  const [primary, second, follow] = trio("/tools/view/index.html?look=dummy");
  assert.match(primary, /id=a/);
  assert.match(primary, /offer=1/);
  assert.match(primary, /look=dummy/);
  assert.match(primary, /surveyor/);
  assert.match(primary, /marksman/);
  assert.doesNotMatch(primary, /to=b/);
  assert.match(follow, /id=c/);
  assert.match(follow, /follow=a/);
  assert.match(follow, /look=dummy/);
  assert.match(follow, /surveyor/);
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
  assert.equal(bench.searchParams.get("second"), null);
  const clients = bench.searchParams.getAll("ai");
  assert.equal(clients.length, 4);
  assert.match(clients[0], /ai=surveyor/);
  assert.match(clients[3], /ai=marksman/);
  assert.match(bench.searchParams.get("follow"), /follow=a/);
  assert.equal(aiHrefs("a").length, 4);
});
test("the bench starts the primary, then the follow, then each AI", () => {
  const href = benchHref("/tools/view/index.html?look=dummy");
  const bench = new URL(href, "http://127.0.0.1");
  const order = bootOrder({
    primary: bench.searchParams.get("primary"),
    follow: bench.searchParams.get("follow"),
    second: bench.searchParams.get("second") || "",
    ais: bench.searchParams.getAll("ai"),
  });
  assert.deepEqual(order.map((item) => item.slot), ["primary", "follow", "ai", "ai", "ai", "ai"]);
  assert.match(order[2].src, /ai=surveyor/);
  assert.match(order[5].src, /ai=builder|ai=marksman/);
  assert.match(order[5].src, /ai=marksman/);
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

test("checks page: scale test is the local server and lighthouse, only the solo demo is GitHub Pages, every link is a new window", () => {
  const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
  const anchors = [...html.matchAll(/<a\b[^>]*>/g)].map((m) => m[0]);
  assert.ok(anchors.length >= 20);
  for (const tag of anchors) {
    assert.match(tag, /target="_blank"/, tag);
    assert.match(tag, /rel="noopener"/, tag);
  }
  const hrefs = anchors.map((tag) => tag.match(/href="([^"]+)"/)[1]);
  assert.deepEqual(
    hrefs.filter((href) => href.includes("github.io")),
    ["https://blakelapierre.github.io/meridian/tools/view/index.html?lighthouse=off"],
  );
  const scale = new URL(hrefs.find((href) => href.includes("/tools/scale/")));
  assert.equal(scale.origin, "http://127.0.0.1:8080");
  assert.equal(scale.pathname, "/tools/scale/index.html");
  assert.equal(scale.searchParams.get("max"), "50");
  assert.equal(scale.searchParams.get("lighthouse"), "ws://127.0.0.1:8787");
  const launch = readFileSync(new URL("../tools/launch.js", import.meta.url), "utf8");
  const skip = launch.indexOf('tools/archive');
  const scaleSkip = launch.indexOf('tools/scale');
  assert.ok(scaleSkip > skip);
  assert.ok(scaleSkip < launch.indexOf("event.preventDefault()"));
});
