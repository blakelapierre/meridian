import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { hearAt, perceptionFrom, SENSE_DEFAULTS } from "../src/sim/perception.js";
import { pushNote } from "../src/sim/rules.js";
import { landingNote, countLanding } from "../src/sim/hearth.js";
import { seaGain } from "../src/audio/cues.js";

test("hearAt fades with distance and goes silent past the hearing range", () => {
  const ear = SENSE_DEFAULTS.hearing;
  const near = hearAt([0, 0], 0, [0, 5], ear);
  const far = hearAt([0, 0], 0, [0, 30], ear);
  assert.ok(near.gain > far.gain);
  assert.equal(hearAt([0, 0], 0, [0, ear.range + 1], ear), null);
});

test("hearAt pans by side relative to facing", () => {
  const ear = SENSE_DEFAULTS.hearing;
  // Facing +y (yaw 0): +x is to the right, matching wishPlanar's strafe.
  assert.ok(hearAt([0, 0], 0, [10, 0], ear).pan > 0.99);
  assert.ok(hearAt([0, 0], 0, [-10, 0], ear).pan < -0.99);
  assert.ok(Math.abs(hearAt([0, 0], 0, [0, 10], ear).pan) < 1e-9);
  // Turned to face +x: a source at +x is straight ahead.
  assert.ok(Math.abs(hearAt([0, 0], Math.PI / 2, [10, 0], ear).pan) < 1e-9);
});

test("better hearing hears farther and louder", () => {
  const dull = perceptionFrom().senses.hearing;
  const keen = perceptionFrom({ hearing: 140 }).senses.hearing;
  assert.equal(hearAt([0, 0], 0, [0, 60], dull), null);
  assert.ok(hearAt([0, 0], 0, [0, 60], keen));
  assert.ok(hearAt([0, 0], 0, [0, 10], keen).gain > hearAt([0, 0], 0, [0, 10], dull).gain);
});

test("sea is quieter at night than at dawn, but not silent", () => {
  assert.ok(seaGain("night") < seaGain("dawn"));
  assert.ok(seaGain("night") > 0);
});

test("wind push note appears only when there is a push", () => {
  assert.equal(pushNote(null), "");
  assert.match(pushNote([0.6, 0.1, 0]), /wind push \d/);
});

test("landing counter shows on the body line once counted", () => {
  const skills = { jump: { value: 0 }, landing: { value: 0 } };
  assert.equal(landingNote(skills), "");
  countLanding(skills);
  assert.equal(landingNote(skills), " land 1");
});

test("debug toggle and phone Info can show #net in demo mode", () => {
  const html = readFileSync(new URL("../tools/view/index.html", import.meta.url), "utf8");
  assert.match(html, /html\.demo:not\(\.debug\):not\(\.touch-info\) #net/);
  assert.doesNotMatch(html, /html\.demo #net/);
});
