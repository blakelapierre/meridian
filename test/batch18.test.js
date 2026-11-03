import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { toolAim, snapCell, HAMMER_PROPOSE_M } from "../src/sim/aim.js";
import { lookDirection } from "../src/sim/hands.js";
import { createYard, tryPlacePost, tryPlaceBeam, tryPlaceRoof, underRoof, pieceBoxes, digStone, ROOF_Z } from "../src/sim/build.js";
import { ledgeHeight, ledgeProps, LEDGE, LEDGE_TOP_M } from "../src/sim/ledge.js";
import { fallHurt, fluxMetal, tryFinishHearth, tryFinishFin } from "../src/sim/hearth.js";
import { createVein, tapVein } from "../src/sim/vein.js";
import { DAY_TICKS } from "../src/sim/sun.js";

const main = readFileSync(new URL("../src/app/main.js", import.meta.url), "utf8");
const pieces = () => [{ id: "footing", at: [0, -280], anchors: true }];

test("hammer aims at a normal walking pitch (proposes ground ahead, like the #25 dig fix)", () => {
  const eye = [0, -142, 1.65 + 2.2];
  const mark = toolAim("hammer", eye, lookDirection(0, -0.25), [], pieces(), ["footing"]);
  assert.equal(mark.inRange, true);
  assert.equal(mark.kind, "footing");
  assert.deepEqual(mark.cell, [0, -280]);
  assert.equal(mark.distance, HAMMER_PROPOSE_M);
  assert.equal(toolAim("hammer", eye, lookDirection(0, 0.6), [], pieces()).inRange, false, "looking up proposes nothing");
});

test("snap only pulls toward pieces with work waiting", () => {
  assert.deepEqual(snapCell([1, -279], pieces(), ["footing"]), [0, -280]);
  assert.deepEqual(snapCell([1, -279], pieces(), []), [1, -279]);
  assert.deepEqual(snapCell([3, -280], pieces(), ["footing"]), [3, -280]);
});

test("the hearth on the footing reads as hearth, not footing (fin was unreachable)", () => {
  const list = [...pieces(), { id: "hearth", at: [0, -280] }];
  const mark = toolAim("hammer", [0, -142, 1.65], lookDirection(0, -0.25), [], list, ["hearth"]);
  assert.equal(mark.kind, "hearth");
});

test("whole ticks: periodic clocks can fire", () => {
  assert.match(main, /let tick = Math\.round\(/);
  assert.equal(Number.isInteger(Math.round((0.87 / (Math.PI * 2)) * DAY_TICKS)), true);
});

test("economy: vein + start metal covers hearth then fin; fin pays through the day", () => {
  const yard = createYard({ x: 0, y: -7000 });
  yard.metal = 20;
  yard.stone = 12;
  assert.equal(tryFinishHearth(yard, [0, -140]).ok, true);
  const vein = createVein([8, -148], 12);
  assert.match(main, /createVein\(\[8, -148\], 12\)/);
  while (vein.metal > 0) yard.metal += tapVein(vein, 8, -148);
  assert.equal(tryFinishFin(yard, [0, -140]).ok, true);
  const morning = Math.round((0.87 / (Math.PI * 2)) * DAY_TICKS / 1800) * 1800;
  assert.ok(fluxMetal(morning) >= 2, `morning fin pays ${fluxMetal(morning)}`);
  assert.ok(fluxMetal(morning, 0, false, 0.9) < fluxMetal(morning), "cloud cuts it");
});

test("spoil and stone only from digs that moved crust", () => {
  assert.match(main, /const dugVoxels = terrain\.dig\(/);
  assert.match(main, /if \(!dugVoxels\)/);
  assert.deepEqual([1, 2, 3, 4, 5, 6].map(digStone), [0, 0, 1, 0, 0, 1]);
  assert.equal(digStone(0), 0);
});

test("tuck-height ledge near spawn", () => {
  assert.ok(Math.abs(LEDGE_TOP_M - 5.4) < 1e-9);
  assert.equal(ledgeHeight(LEDGE.x0 - 0.1, -152.8), 0.6);
  assert.ok(Math.abs(ledgeHeight(LEDGE.x0 - LEDGE.step * LEDGE.steps + 0.1, -152.8) - LEDGE_TOP_M) < 1e-9);
  assert.equal(ledgeHeight(0, -150), 0);
  assert.equal(ledgeProps().length, LEDGE.steps);
  const landing = -Math.sqrt(2 * 9.81 * LEDGE_TOP_M);
  assert.ok(landing <= -9, `lands at ${landing.toFixed(1)} m/s`);
  assert.ok(fallHurt(100, landing, 0, true) > fallHurt(100, landing, 0, false), "tuck soaks");
});

test("raised roof on a beam, standable under", () => {
  const yard = createYard({ x: 0, y: -7000 });
  yard.metal = 20;
  yard.fiber = 2;
  const f = yard.pieces[0].at;
  assert.equal(tryPlaceRoof(yard, [f[0], f[1] + 1]).reason, "beam");
  assert.equal(tryPlacePost(yard, [f[0] - 1, f[1]]).ok, true);
  assert.equal(tryPlacePost(yard, [f[0] - 1, f[1] + 1]).ok, true);
  assert.equal(tryPlacePost(yard, [f[0] + 1, f[1]]).ok, true);
  assert.equal(tryPlacePost(yard, [f[0] + 1, f[1] + 1]).ok, true);
  const cell = [f[0], f[1] + 1];
  assert.equal(tryPlaceBeam(yard, cell).ok, true);
  assert.equal(tryPlaceRoof(yard, cell).ok, true);
  assert.equal(yard.fiber, 0);
  assert.equal(tryPlaceRoof(yard, cell).reason, "occupied");
  assert.equal(underRoof(yard.pieces, cell[0] * 0.5, cell[1] * 0.5), true);
  const roof = pieceBoxes(yard.pieces).find((box) => box.min?.[2] >= ROOF_Z - 0.01 || box.min?.z >= ROOF_Z - 0.01);
  assert.ok(roof, "roof box sits at ROOF_Z");
  assert.match(readFileSync(new URL("../docs/keymap.md", import.meta.url), "utf8"), /Shift\+P/);
});

test("playthrough tool and hooks exist", () => {
  for (const hook of ["look(", "teleport(", "hold(", "slot(", "skipTicks(", "upkeeps:"]) assert.ok(main.includes(hook), hook);
  assert.ok(readFileSync(new URL("../tools/playthrough/run.mjs", import.meta.url), "utf8").includes("ALL PASS"));
});
