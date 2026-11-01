import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { bitAim, crustFeet } from "../src/sim/bit.js";
import { Crust, VOXEL_CM, VOXEL_CM3, brushWrites } from "../src/sim/crust.js";
import { duneHeight } from "../src/sim/life.js";
import { addPrint, PRINT_CAP } from "../src/sim/prints.js";
import { createWear, decayWear, stepWear, wearAt, wearStage, WORN_AT, PATH_AT, WEAR_STEP } from "../src/sim/wear.js";
import { ONBOARD_KEY, markSeen, shouldShow, tipsFor, DESKTOP_TIPS, TOUCH_TIPS } from "../src/app/onboard.js";

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

test("wear: footsteps turn grass to worn dirt to packed path, and decay fades it", () => {
  const wear = createWear();
  assert.equal(wearStage(wearAt(wear, 1, 1)), 0);
  for (let i = 0; i * WEAR_STEP <= WORN_AT; i++) stepWear(wear, 1, 1);
  assert.ok(wearStage(wearAt(wear, 1, 1)) >= 1, "worn dirt");
  for (let i = 0; i * WEAR_STEP <= PATH_AT; i++) stepWear(wear, 1, 1);
  assert.equal(wearStage(wearAt(wear, 1, 1)), 2, "packed path");
  assert.ok(wearAt(wear, 1.25, 1) > 0 && wearAt(wear, 1.25, 1) < wearAt(wear, 1, 1), "neighbours wear a little");
  decayWear(wear, 255);
  assert.equal(wearAt(wear, 1, 1), 0);
  assert.equal(wear.cells.size, 0);
});

test("prints: one per stride per walker, capped at PRINT_CAP", () => {
  const prints = [];
  assert.equal(addPrint(prints, { x: 0, y: 0, who: "a" }), true);
  assert.equal(addPrint(prints, { x: 0.3, y: 0, who: "a" }), false, "too close to own last print");
  assert.equal(addPrint(prints, { x: 0.3, y: 0, who: "b" }), true, "another walker may print there");
  for (let i = 1; i <= 100; i++) addPrint(prints, { x: i, y: 0, who: "a" });
  assert.equal(prints.length, PRINT_CAP);
  assert.equal(prints.at(-1).x, 100);
});

test("dig cost: 25 cm voxels cost 15625 cm3; the base grant lands the first write on tick 3", () => {
  assert.equal(VOXEL_CM, 25);
  assert.equal(VOXEL_CM3, 15625);
  const crust = new Crust();
  const { eye, aim } = bitAim([0, -150, 0], 0, -1.2);
  const perTick = [];
  for (let t = 1; t <= 6; t++) perTick.push(brushWrites(crust, { eye, aim, ticks: 1 }).length);
  assert.deepEqual(perTick.slice(0, 3), [0, 0, 1]);
  assert.equal(perTick.reduce((a, b) => a + b), Math.floor((6667 * 6) / VOXEL_CM3));
});

test("dig at spawn: standing on a dune crest still reaches the crust", () => {
  const [x, y] = [0, -150];
  const dune = duneHeight(x, y);
  assert.ok(dune > 1, `spawn is up a dune (${dune.toFixed(2)} m)`);
  const dig = (feet) => {
    const crust = new Crust();
    const { eye, aim } = bitAim(feet, 0, -0.9);
    return brushWrites(crust, { eye, aim, ticks: 20 }).length;
  };
  assert.equal(dig([x, y, dune]), 0, "raw dune feet miss the crust (the old bug)");
  assert.ok(dig(crustFeet([x, y, dune], dune, 0)) > 0, "crust-space feet dig");
  assert.deepEqual(crustFeet([x, y, -0.5], dune, -0.5), [x, y, -0.5], "in a pit the body is already in crust space");
});

test("keymap.md documents every key the walk handles", () => {
  const main = read("src/app/main.js");
  const touch = read("src/app/touch.js");
  const codes = new Set([...main.matchAll(/event\.code === "([A-Za-z0-9]+)"/g), ...touch.matchAll(/code: *"([A-Za-z0-9]+)"/g)].map((m) => m[1]));
  const firstCols = read("docs/keymap.md").split("\n").filter((l) => l.startsWith("| ")).map((l) => l.split("|")[1].trim());
  const label = (code) => code.replace(/^Key|^Digit/, "").replace("Escape", "Esc").replace("ControlLeft", "Ctrl");
  const missing = [...codes].filter((code) => {
    const want = label(code);
    return !firstCols.some((col) => col.split(/[ ()]+/).includes(want) || col.includes(code));
  });
  assert.deepEqual(missing, []);
  assert.ok(codes.has("KeyI") && codes.has("KeyL"));
  assert.match(read("tools/view/index.html"), /<b>I<\/b>[^<]*network/i);
});

test("onboard card: first run only, reopenable, skipped for bots and embeds", () => {
  const store = new Map();
  const storage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) };
  assert.equal(shouldShow({ storage }), true);
  markSeen(storage);
  assert.equal(store.get(ONBOARD_KEY), "seen");
  assert.equal(shouldShow({ storage }), false);
  assert.equal(shouldShow({ storage, params: new URLSearchParams("onboard=1") }), true);
  assert.equal(shouldShow({ storage: { getItem: () => null }, params: new URLSearchParams("bot=3") }), false);
  assert.equal(shouldShow({ storage: { getItem: () => null }, embedded: true }), false);
  assert.equal(tipsFor(true), TOUCH_TIPS);
  assert.equal(tipsFor(false), DESKTOP_TIPS);
});

test("offline note links to the ?lighthouse= explanation, and the anchor exists", () => {
  assert.match(read("src/app/main.js"), /docs\/lighthouse\.md#the-lighthouse-parameter/);
  assert.match(read("docs/lighthouse.md"), /^## The lighthouse parameter$/m);
});

test("accessibility: focus rings, reduced motion, labelled controls", () => {
  const html = read("tools/view/index.html");
  assert.match(html, /:focus-visible/);
  assert.match(html, /prefers-reduced-motion/);
  assert.match(read("src/app/touch.js"), /aria-label/);
});
