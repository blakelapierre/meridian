import assert from "node:assert/strict";
import test from "node:test";
import { appraise, appraisalGain, SUBJECTS } from "../src/sim/appraise.js";

test("appraisal tells you more as the skill clears the difficulty", () => {
  assert.equal(appraise(0, SUBJECTS.dummy).line, "You cannot tell what that is.");
  assert.equal(appraise(0, SUBJECTS.dummy).canAct, false);
  assert.equal(appraise(0, SUBJECTS.sand).line, "Sand");
  assert.equal(appraise(20, SUBJECTS.dummy).line, "Practice dummy");
  assert.equal(appraise(20, SUBJECTS.dummy).canAct, false);
  const ready = appraise(55, SUBJECTS.dummy);
  assert.equal(ready.canAct, true);
  assert.match(ready.line, /attack with the line/);
  assert.doesNotMatch(ready.line, /health/);
  assert.match(appraise(90, SUBJECTS.dummy).line, /health 100/);
  assert.equal(appraisalGain(0), 1);
  assert.ok(appraisalGain(20) < 0.6);
});
