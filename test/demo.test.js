import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createTour, demoMode, goalOffset, lighthouseLine, lighthouseUrl, nextSlot, stepTour, tourDone, tourLine, tourStep, TOUR, TOUR_START } from "../src/app/demo.js";

const q = (search) => new URLSearchParams(search);

test("demo mode is on for github.io and off for local or ?debug=1", () => {
  assert.equal(demoMode(q(""), "blakelapierre.github.io"), true);
  assert.equal(demoMode(q("debug=1"), "blakelapierre.github.io"), false);
  assert.equal(demoMode(q(""), "127.0.0.1"), false);
  assert.equal(demoMode(q("demo=1"), "localhost"), true);
});

test("a public page never tries localhost and falls back to solo", () => {
  assert.equal(lighthouseUrl(q(""), "blakelapierre.github.io", null), null);
  assert.equal(lighthouseUrl(q(""), "blakelapierre.github.io", { url: null }), null);
  assert.equal(lighthouseUrl(q(""), "blakelapierre.github.io", { url: "ws://127.0.0.1:8787" }), null);
  assert.equal(lighthouseUrl(q(""), "blakelapierre.github.io", { url: "wss://lh.example.org" }), "wss://lh.example.org");
  assert.equal(lighthouseUrl(q("lighthouse=wss://x.example"), "blakelapierre.github.io", { url: "wss://lh.example.org" }), "wss://x.example");
  assert.equal(lighthouseUrl(q("lighthouse=off"), "127.0.0.1", null), null);
  assert.equal(lighthouseUrl(q("lighthouse=javascript:alert(1)"), "blakelapierre.github.io", null), null);
});

test("a local page keeps the dev lighthouse and ?signal= still works", () => {
  assert.equal(lighthouseUrl(q(""), "127.0.0.1", null), "ws://127.0.0.1:8787");
  assert.equal(lighthouseUrl(q(""), "localhost", { url: "wss://lh.example.org" }), "ws://127.0.0.1:8787");
  assert.equal(lighthouseUrl(q("signal=ws://127.0.0.1:9000"), "127.0.0.1", null), "ws://127.0.0.1:9000");
});

test("the committed lighthouse config parses and never points at localhost", () => {
  const config = JSON.parse(readFileSync(new URL("../content/lighthouse.json", import.meta.url), "utf8"));
  assert.ok(config.url === null || /^wss:\/\//.test(config.url));
});

test("3 takes the bit out first, then swaps bit and hammer", () => {
  let state = nextSlot("bit", "Digit3", false);
  assert.deepEqual(state, { slot: "bit", chosen: true });
  state = nextSlot(state.slot, "Digit3", state.chosen);
  assert.equal(state.slot, "hammer");
  state = nextSlot(state.slot, "Digit3", state.chosen);
  assert.equal(state.slot, "bit");
  state = nextSlot("line", "Digit3", true);
  assert.equal(state.slot, "bit");
  assert.equal(nextSlot("hammer", "Digit1", true).slot, "line");
});

test("the tour walks to the marker, shoots, digs, and joins at the gate", () => {
  const tour = createTour();
  const facts = { position: [TOUR_START.x, TOUR_START.y, 0], yaw: 0, hits: 0, nearShots: 0, digs: 0, joined: false };
  assert.match(tourLine(tour, false, 0), /^1\/4 .*W.*marker/);
  assert.match(tourLine(tour, true, 0), /Drag the left side/);
  assert.equal(stepTour(tour, facts, 0), false, "the spawn is not the marker");
  const start = TOUR[0].goal;
  assert.ok(Math.hypot(start[0] - TOUR_START.x, start[1] - TOUR_START.y) < 10, "the marker is a few steps away");
  assert.ok(Math.abs(goalOffset([TOUR_START.x, TOUR_START.y], TOUR_START.yaw, start)) < 0.2, "the spawn faces the marker");
  facts.position = [1, -127.5, 0];
  assert.equal(stepTour(tour, facts, 100), true);
  assert.match(tourLine(tour, false, 200), /^✓ Made it\. 2\/4 .*dummy/);
  assert.equal(tourStep(tour).slot, "line", "the shoot step hands over the line");
  assert.doesNotMatch(tourLine(tour, false, 5000), /✓/);
  facts.digs = 1;
  assert.equal(stepTour(tour, facts, 300), false, "shoot comes before dig");
  facts.nearShots = 1;
  assert.equal(stepTour(tour, facts, 400), true, "a near miss counts");
  assert.equal(tourStep(tour).slot, "bit");
  assert.equal(stepTour(tour, facts, 500), true);
  assert.equal(tourStep(tour).id, "gate");
  assert.equal(stepTour(tour, facts, 600), false);
  facts.joined = true;
  assert.equal(stepTour(tour, facts, 700), true);
  assert.equal(tour.index, -1);
  assert.deepEqual(tourDone(tour), ["walk", "shoot", "dig", "gate"]);
  assert.match(tourLine(tour, false, 800), /Joined the strike/);
  assert.equal(createTour(tourDone(tour)).index, -1);
});

test("skip moves on from any step and goal offsets point the right way", () => {
  const tour = createTour();
  tour.skip = true;
  assert.equal(stepTour(tour, { position: [0, -200, 0] }, 0), true);
  assert.match(tourLine(tour, false, 10), /Skipped/);
  assert.equal(tour.index, 1);
  assert.ok(goalOffset([0, 0], 0, [10, 0]) > 1.5, "east is to the right of north");
  assert.ok(goalOffset([0, 0], 0, [-10, 0]) < -1.5);
  assert.ok(Math.abs(goalOffset([0, 0], Math.PI / 2, [10, 0])) < 1e-9);
});
test("the view loads the demo pieces with fresh cache keys", () => {
  const main = readFileSync(new URL("../src/app/main.js", import.meta.url), "utf8");
  const view = readFileSync(new URL("../tools/view/index.html", import.meta.url), "utf8");
  assert.match(main, /from "\.\/demo\.js\?v=\d+"/);
  assert.match(main, /lighthouse\.json\?v=\d+/);
  assert.doesNotMatch(main, /ws:\/\/127\.0\.0\.1:8787/, "the dev address lives in demo.js behind the local check");
  assert.doesNotMatch(main, /exitPointerLock/, "a click while looking fires instead of dropping the cursor");
  assert.match(view, /id="hint"/);
  assert.match(view, /id="shotfx"/);
});

test("the network panel says when the lighthouse is unreachable and the demo plays solo", () => {
  assert.equal(lighthouseLine("unreachable"), "lighthouse unreachable, playing solo");
  assert.equal(lighthouseLine("up"), "lighthouse up");
  assert.equal(lighthouseLine("connecting"), "lighthouse connecting");
  assert.equal(lighthouseLine("off"), "", "a chosen solo says nothing");
});
