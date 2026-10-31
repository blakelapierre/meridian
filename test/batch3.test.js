import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createSkills, grantUse, skillRows, SKILL_NAMES, SUBSKILLS } from "../src/sim/skills.js";
import { blockLevel, fadeLevel, perceptionFrom, SENSE_DEFAULTS } from "../src/sim/perception.js";
import { cueStyle, darkLift, exposureSkills, hearSource, noticing, panSpread, sensePresence, CATEGORIES } from "../src/sim/hearing.js";
import { AMBIENT_KINDS, createAmbient, planAmbient, SHORE_Y } from "../src/audio/ambient.js";
import { SKILL_TEXT, TIERS, tierOf, tooltipFor, unlockText } from "../src/app/skill-text.js";
import { createLog, createNoticeQueue, detectCrossings, LOG_CAP, LOG_KEY, relativeTime, tierSnapshot } from "../src/app/abilities.js";
import { historyKeep } from "../src/render/gpu.js";

const DEG = Math.PI / 180;
const fixed = (values) => { let i = 0; return () => values[i++ % values.length]; };
const memory = () => { const data = new Map(); return { getItem: (k) => data.get(k) ?? null, setItem: (k, v) => data.set(k, String(v)), data }; };

test("foveation fade is continuous: no step anywhere across the falloff", () => {
  const sight = perceptionFrom({}).senses.sight;
  assert.equal(SENSE_DEFAULTS.sight.falloff, 45 * DEG);
  let last = fadeLevel(sight, 0);
  let maxJump = 0;
  for (let a = 0; a <= 70; a += 0.1) {
    const level = fadeLevel(sight, a * DEG);
    maxJump = Math.max(maxJump, Math.abs(level - last));
    last = level;
  }
  assert.ok(maxJump < 0.02, `largest step ${maxJump}`);
  // The quantized level jumps by a whole step somewhere; the continuous one tracks it within half a level.
  for (let a = 0; a <= 70; a += 1) assert.ok(Math.abs(fadeLevel(sight, a * DEG) - blockLevel(sight, a * DEG)) <= 0.5 + 1e-9);
  assert.equal(historyKeep(true, true) > 0, true);
  assert.equal(historyKeep(false, true), 0);
  assert.equal(historyKeep(true, false), 0);
});

test("new skills exist, are capped, and Tracking is extended rather than duplicated", () => {
  assert.ok(SKILL_NAMES.includes("hearing") && SKILL_NAMES.includes("awareness"));
  assert.deepEqual(SUBSKILLS.hearing, ["nature", "footsteps", "mechanics", "weather", "rare", "localization"]);
  assert.ok(SUBSKILLS.eyesight.includes("dark"));
  assert.equal(skillRows().filter((row) => row.name === "tracking").length, 1);
  const skills = createSkills();
  for (let i = 0; i < 5000; i += 1) grantUse(skills, "awareness");
  assert.equal(skills.awareness.value, 100);
  for (let i = 0; i < 5000; i += 1) grantUse(skills, "localization");
  assert.equal(skills.localization.value, 0); // a sub-skill cannot pass its parent
  for (let i = 0; i < 300; i += 1) grantUse(skills, "hearing");
  for (let i = 0; i < 5000; i += 1) grantUse(skills, "localization");
  assert.ok(skills.localization.value <= skills.hearing.value + 1e-9);
});

test("hearing skill makes sounds reach further, louder and less masked", () => {
  const novice = createSkills();
  const expert = createSkills();
  for (const name of ["hearing", "nature", "localization"]) expert[name].value = 100;
  const sense = (s) => perceptionFrom({ hearing: s.hearing.value }).senses.hearing;
  const far = [0, 100];
  assert.equal(hearSource([0, 0], 0, far, sense(novice), novice, "nature"), null);
  assert.ok(hearSource([0, 0], 0, far, sense(expert), expert, "nature"));
  const near = [0, 20];
  const a = hearSource([0, 0], 0, near, sense(novice), novice, "nature", { rand: () => 0.5 });
  const b = hearSource([0, 0], 0, near, sense(expert), expert, "nature", { rand: () => 0.5 });
  assert.ok(b.gain > a.gain);
  assert.equal(hearSource([0, 0], 0, [0, 40], sense(novice), novice, "nature", { mask: 1 }), null);
  assert.ok(noticing(expert, "nature") > noticing(novice, "nature"));
});

test("localization narrows the pan blur", () => {
  const low = createSkills();
  const high = createSkills();
  high.localization.value = 100;
  assert.ok(panSpread(low) > 1);
  assert.ok(panSpread(high) < 0.1);
  const sense = SENSE_DEFAULTS.hearing;
  const src = [10, 0]; // straight to the right with yaw 0
  const sharp = hearSource([0, 0], 0, src, sense, high, "nature", { rand: () => 1 });
  const blurred = hearSource([0, 0], 0, src, sense, low, "nature", { rand: () => 1 });
  assert.ok(Math.abs(sharp.angle - Math.PI / 2) < 0.1);
  assert.ok(Math.abs(blurred.angle - Math.PI / 2) > 1);
  assert.deepEqual(exposureSkills(sharp, "nature"), ["hearing", "nature", "localization"]);
  assert.deepEqual(exposureSkills(null, "nature"), []);
});

test("visual cues scale with skill: none, then shimmer, then narrower tinted pulses and a blip", () => {
  const skills = createSkills();
  assert.equal(cueStyle(skills, "nature"), null);
  skills.hearing.value = 30;
  const faint = cueStyle(skills, "nature");
  assert.ok(faint && faint.shimmer && !faint.pulse && !faint.blip);
  skills.nature.value = 80;
  skills.hearing.value = 90;
  skills.localization.value = 80;
  const sharp = cueStyle(skills, "nature");
  assert.ok(sharp.pulse && sharp.blip && sharp.opacity > faint.opacity && sharp.spread < faint.spread);
  assert.notDeepEqual(cueStyle(skills, "combat")?.tint, sharp.tint);
});

test("awareness senses approaches outside the view and dark adaptation lifts only the night", () => {
  assert.equal(sensePresence([0, 0], 0, [0, -5], 0), null);
  assert.ok(sensePresence([0, 0], 0, [0, -5], 50));
  assert.equal(sensePresence([0, 0], 0, [0, 5], 50), null); // in front: seen, not sensed
  assert.equal(darkLift(100, false), 0);
  assert.ok(darkLift(100, true) > darkLift(20, true));
});

test("the ambient scheduler varies its gaps and voices and follows day and night", () => {
  const state = createAmbient();
  const kinds = new Set();
  const gaps = [];
  let lastSurf = null;
  let r = 1;
  const rand = () => ((r = (r * 16807) % 2147483647) / 2147483647);
  for (let t = 0; t < 600; t += 0.1) {
    for (const e of planAmbient(state, { now: t, listener: [0, SHORE_Y + 20], light: "day", actors: [[5, 5]], rand })) {
      kinds.add(e.kind);
      if (e.kind === "surf") {
        if (lastSurf !== null) gaps.push(t - lastSurf);
        lastSurf = t;
      }
    }
  }
  for (const k of ["surf", "gust", "bird", "gull", "rustle", "activity"]) assert.ok(kinds.has(k), k);
  assert.ok(!kinds.has("insect"));
  assert.ok(new Set(gaps.map((g) => g.toFixed(1))).size > 5, "gaps vary");
  const night = createAmbient();
  const seen = new Set();
  for (let t = 0; t < 120; t += 0.1) for (const e of planAmbient(night, { now: t, listener: [0, 0], light: "night", rand })) seen.add(e.kind);
  assert.ok(seen.has("insect") && !seen.has("bird"));
  for (const kind of Object.values(AMBIENT_KINDS)) assert.ok(CATEGORIES.includes(kind.category));
});

test("every skill has a flavour and a line for every tier", () => {
  for (const row of skillRows()) {
    const text = SKILL_TEXT[row.name];
    assert.ok(text, row.name);
    assert.ok(text.flavour && !/\d/.test(text.flavour), row.name);
    assert.equal(text.tiers.length, TIERS.length, row.name);
    for (const line of text.tiers) assert.ok(line && !/\d/.test(line), `${row.name}: ${line}`);
    for (const tier of TIERS) assert.ok(tooltipFor(row.name, tier.at).tier.includes(text.tiers[tierOf(tier.at)]));
  }
  const src = readFileSync(new URL("../src/app/main.js", import.meta.url), "utf8");
  assert.match(src, /item\.title = /);
  assert.match(src, /setAttribute\("aria-label"/);
});

test("tier crossings fire once, never for tiny ticks, and use the tooltip text", () => {
  const skills = createSkills();
  skills.hearing.value = 9.5;
  const marks = tierSnapshot(skills);
  skills.hearing.value = 9.9;
  assert.deepEqual(detectCrossings(marks, skills), []);
  skills.hearing.value = 10.1;
  const found = detectCrossings(marks, skills);
  assert.equal(found.length, 1);
  assert.equal(found[0].text, unlockText("hearing", 1));
  assert.ok(found[0].text.includes(SKILL_TEXT.hearing.tiers[1]));
  assert.deepEqual(detectCrossings(marks, skills), []);
});

test("notices queue without overlapping and expire after the hold", () => {
  const queue = createNoticeQueue({ max: 2, hold: 5000 });
  ["a", "b", "c"].forEach((t) => queue.push(t));
  assert.equal(queue.step(0).add.length, 2);
  assert.equal(queue.waiting.length, 1);
  assert.equal(queue.step(4000).add.length, 0);
  const later = queue.step(5000);
  assert.equal(later.drop.length, 2);
  assert.deepEqual(later.add.map((i) => i.text), ["c"]);
});

test("the abilities log persists, caps at fifty and reads relative times", () => {
  const store = memory();
  const log = createLog(store);
  for (let i = 0; i < 60; i += 1) log.add({ skill: "run", tier: 1, text: `t${i}` }, 1000 + i);
  assert.equal(log.entries.length, LOG_CAP);
  const again = createLog(store);
  assert.equal(again.entries.length, LOG_CAP);
  assert.equal(again.entries[0].text, "t59");
  store.setItem(LOG_KEY, "not json");
  assert.deepEqual(createLog(store).entries, []);
  assert.equal(relativeTime(0, 3000), "just now");
  assert.equal(relativeTime(0, 5 * 60000), "5 min ago");
  assert.equal(relativeTime(0, 3 * 3600000), "3 h ago");
});
