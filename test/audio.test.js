import assert from "node:assert/strict";
import test from "node:test";
import { cueFor, hearStep } from "../src/audio/cues.js";
import { createNotes, offerNotes, takeTold, writeNote } from "../src/sim/notes.js";

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

test("notes are written only when the skill can keep them, and a stranger is not told", () => {
  const notes = createNotes();
  assert.equal(writeNote(notes, { mining: 1 }, "dig"), null);
  assert.equal(writeNote(notes, { mining: 4 }, "dig").line, "The sand took a hole.");
  assert.equal(writeNote(notes, { mining: 20 }, "dig"), null);
  assert.equal(writeNote(notes, { appraisal: 4 }, "seen", { line: "Sand" }), null);
  assert.equal(writeNote(notes, { appraisal: 8 }, "seen", { line: "Sand · loose crust" }).line, "Sand · loose crust");
  assert.deepEqual(offerNotes(notes, { appraisal: 20, mapping: 20 }, "stranger"), []);
  assert.equal(offerNotes(notes, { appraisal: 8 }, "acquaintance").length, 1);
  const heard = createNotes();
  assert.equal(takeTold(heard, { appraisal: 0, mapping: 0 }, "The sand took a hole."), null);
  assert.equal(takeTold(heard, { appraisal: 8 }, "The sand took a hole.").kind, "told");
});
