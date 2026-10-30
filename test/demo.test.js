import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createTour, demoMode, lighthouseUrl, nextSlot, stepTour, tourDone, tourLine, TOUR } from "../src/app/demo.js";

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

test("the tour walks, shoots, digs, and maps with a confirmation for each", () => {
  const tour = createTour();
  const facts = { walked: 0, hits: 0, digs: 0, mapOpen: false };
  assert.match(tourLine(tour, false, 0), /^1\/4 .*W/);
  assert.match(tourLine(tour, true, 0), /Drag the left side/);
  facts.walked = 4;
  assert.equal(stepTour(tour, facts, 100), true);
  assert.match(tourLine(tour, false, 200), /^✓ Walked\. 2\/4 /);
  assert.doesNotMatch(tourLine(tour, false, 5000), /✓/);
  facts.digs = 1;
  assert.equal(stepTour(tour, facts, 300), false, "shoot comes before dig");
  facts.hits = 1;
  stepTour(tour, facts, 400);
  stepTour(tour, facts, 500);
  facts.mapOpen = true;
  stepTour(tour, facts, 600);
  assert.equal(tour.index, -1);
  assert.deepEqual(tourDone(tour), TOUR.map((step) => step.id));
  assert.match(tourLine(tour, false, 700), /Opened the map/);
  assert.equal(tourLine(tour, false, 9000), "");
  assert.equal(createTour(tourDone(tour)).index, -1);
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
