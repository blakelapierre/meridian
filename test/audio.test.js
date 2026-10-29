import assert from "node:assert/strict";
import test from "node:test";
import { cueFor, hearStep } from "../src/audio/cues.js";
import { createErrands, errandLine, noteErrand } from "../src/sim/errands.js";

test("a cue has a pitch and a step only sounds after the foot travels", () => {
  assert.equal(cueFor("nope"), null);
  assert.ok(cueFor("shot").gain > cueFor("step").gain);
  const first = hearStep(null, [0, 0, 0], false);
  assert.equal(first.cue, null);
  const near = hearStep([0, 0, 0], [0.2, 0, 0], false);
  assert.equal(near.cue, null);
  const far = hearStep([0, 0, 0], [0, 1, 0], false);
  assert.equal(far.cue, "step");
});

test("the beach paper advances one errand at a time", () => {
  const paper = createErrands();
  assert.equal(errandLine(paper), "dig the beach");
  noteErrand(paper, "dig");
  assert.equal(errandLine(paper), "bind a hearth");
  noteErrand(paper, "bind");
  noteErrand(paper, "fin");
  assert.equal(errandLine(paper), "enter the compound");
  noteErrand(paper, "strike");
  assert.equal(errandLine(paper), "");
});
