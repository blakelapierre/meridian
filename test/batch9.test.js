import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createGoal, goalDone, goalLine, GOALS, stepGoal } from "../src/app/goal.js";
import { perceptionFrom, SENSE_DEFAULTS } from "../src/sim/perception.js";
import { wantsTouch } from "../src/app/touch.js";

const DEG = Math.PI / 180;

test("first goal: a second pit, then an eyesight tier, then done", () => {
  const goal = createGoal();
  assert.match(goalLine(goal, false, 0), /dig another pit/);
  assert.equal(stepGoal(goal, { digs: 1, eyesight: 0 }, 0), false);
  assert.equal(stepGoal(goal, { digs: 2, eyesight: 0 }, 10), true);
  assert.match(goalLine(goal, true, 20), /✓ .*drag to look around/);
  assert.equal(stepGoal(goal, { digs: 2, eyesight: 0 }, 30), false);
  assert.equal(stepGoal(goal, { digs: 2, eyesight: 140 }, 40), true);
  assert.equal(goal.index, -1);
  assert.deepEqual(goalDone(goal), GOALS.map((g) => g.id));
  assert.equal(goalLine(goal, false, 1e9), "");
  assert.equal(createGoal(goalDone(goal)).index, -1);
});

test("a new player's sight is calmer at the start and still grows with skill", () => {
  const fresh = perceptionFrom({}).senses.sight;
  assert.ok(SENSE_DEFAULTS.sight.fovea >= 10 * DEG);
  assert.ok(SENSE_DEFAULTS.sight.falloff >= 60 * DEG);
  const keen = perceptionFrom({ eyesight: 140, focus: 140 }).senses.sight;
  assert.ok(keen.fovea > fresh.fovea + 5 * DEG);
  assert.ok(keen.falloff > fresh.falloff);
});

test("touch detection: coarse pointer or touch points without a fine pointer", () => {
  const win = (coarse, fine, points) => ({ location: { search: "" }, navigator: { maxTouchPoints: points },
    matchMedia: (q) => ({ matches: q.includes("coarse") ? coarse : q.includes("fine") ? fine : false }) });
  assert.equal(wantsTouch(win(true, false, 5)), true);
  assert.equal(wantsTouch(win(false, false, 5)), true);
  assert.equal(wantsTouch(win(false, true, 0)), false);
});

test("one onboarding layer, debug links only for dev, corner clear of the card", () => {
  const html = readFileSync(new URL("../tools/view/index.html", import.meta.url), "utf8");
  const main = readFileSync(new URL("../src/app/main.js", import.meta.url), "utf8");
  assert.match(html, /html:not\(\.dev\):not\(\.debug\) #demolinks/);
  assert.match(html, /get\("dev"\) === "1"/);
  assert.match(html, /#corner \{[^}]*safe-area-inset-top[^}]*z-index: 31/);
  assert.match(main, /node\.hidden = !line \|\| cardUp/);
  const onboard = readFileSync(new URL("../src/app/onboard.js", import.meta.url), "utf8");
  assert.match(onboard, /wantsTouch/);
});
