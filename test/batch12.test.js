import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { edgeBounces, EDGE_LAST_BOUNCE } from "../src/render/gpu.js";

const gpu = readFileSync(new URL("../src/render/gpu.js", import.meta.url), "utf8");

test("the foveated edge drops the second bounce", () => {
  assert.equal(EDGE_LAST_BOUNCE, 1);
  assert.equal(edgeBounces(0.9), 1);
  assert.equal(edgeBounces(0.1), 4);
  assert.equal(edgeBounces(0.9, true), 4, "a full (non-foveated) trace keeps every bounce");
});

test("shader stops a mirror on the edge's last hop with the sky tint", () => {
  assert.match(gpu, /float edgeT = uFull < 0\.5 \? fovT\(vRay\) : 0\.0;/);
  assert.match(gpu, /mirror < 0\.2 \|\| bounce >= lastBounce/);
});

import { fallFromCount, landingNote, TUCK_SOAK } from "../src/sim/hearth.js";

test("a fall reads a soak you can change: a tucked landing soaks more", () => {
  assert.equal(TUCK_SOAK, 2);
  assert.equal(fallFromCount(100, -12, 3), 95);
  assert.equal(fallFromCount(100, -12, 3, true), 97);
  assert.equal(fallFromCount(100, -12, 9, true), 100, "soak caps at 8, a full fall's hurt");
  assert.equal(fallFromCount(100, -4, 0, true), 100);
  const skills = { landing: { falls: 3 } };
  assert.equal(landingNote(skills), " land 3 soak 3");
  assert.equal(landingNote(skills, true), " land 3 soak 5 tuck");
});

import { cloudShade, finCloud } from "../src/sim/cloud.js";
import { fluxMetal } from "../src/sim/hearth.js";

test("a cloud cuts the fin", () => {
  assert.equal(fluxMetal(32400, 0, false, 0.5), Math.floor(fluxMetal(32400, 0, false) * 0.5 * 10 / 10) || fluxMetal(32400, 0, false, 0.5));
  assert.ok(fluxMetal(32400, 0, false, 0.8) < fluxMetal(32400, 0, false, 0));
  assert.equal(cloudShade([0, 0, 1], [0, 0, -1], 0), 0, "no sky below the horizon");
  let shaded = 0, clear = 0;
  for (let t = 0; t < 32400 * 2; t += 600) { const s = finCloud([0, 0], t); if (s >= 0.1) shaded += 1; else clear += 1; assert.ok(s >= 0 && s <= 0.8); }
  assert.ok(shaded > 0 && clear > 0, "some minutes are clouded, some clear");
  assert.equal(finCloud([5, 7], 12345), finCloud([5, 7], 12345), "deterministic for every peer");
});

test("the fin's cloud is the sky's cloud", () => {
  const gpu = readFileSync(new URL("../src/render/gpu.js", import.meta.url), "utf8");
  assert.match(gpu, /valueNoise\(q\.xy \* 0\.018 \+ vec2\(uTime \* 0\.004, 0\.2\)\)/);
  const main = readFileSync(new URL("../src/app/main.js", import.meta.url), "utf8");
  assert.match(main, /scene\.time = tick \/ 30/);
  assert.match(main, /finCloud\(piece\.at, tick\)/);
});

test("a cloud's shadow falls on the sand", () => {
  const gpu = readFileSync(new URL("../src/render/gpu.js", import.meta.url), "utf8");
  assert.match(gpu, /direct \*= 1\.0 - 0\.75 \* cloudShadeAt\(p, sun\)/);
  assert.match(gpu, /float cloudShade\(vec3 rd\) \{\n  return cloudShadeAt\(uOrigin, rd\);/);
});

import { rainOver, rainPool, RAIN_SHADE } from "../src/sim/pool.js";

test("rain comes from the cloud over the pool", () => {
  assert.equal(RAIN_SHADE, 0.35);
  let wet = null, dry = null;
  for (let t = 0; t < 129600 && (wet === null || dry === null); t += 300) {
    if (rainOver(0, 0, t)) wet ??= t; else dry ??= t;
  }
  assert.ok(wet !== null && dry !== null);
  assert.equal(rainPool({ x: 0, y: 0, rain: 0 }, wet, { deck: true }).rain, 1);
  assert.equal(rainPool({ x: 0, y: 0, rain: 0 }, dry, { deck: true }).rain, 0);
  assert.equal(rainPool({ x: 1, y: 1, rain: 0 }, 0).rain, 1, "the old clock still works without the deck");
});

import { deedCost, friendLine, noteDeed } from "../src/sim/lore.js";

test("friendliness is not only a number: a record of what passed between you", () => {
  const deeds = new Map();
  assert.equal(friendLine(14), "acquaintance 14");
  noteDeed(deeds, "pell", "told"); noteDeed(deeds, "pell", "told"); noteDeed(deeds, "pell", "refused");
  assert.equal(noteDeed(deeds, "pell", "hugged"), null);
  assert.equal(friendLine(41, deeds.get("pell")), "friend 41 · told 2 · refused 1");
  assert.equal(deedCost("refused"), -5);
  assert.equal(deedCost("told"), 0);
  const main = readFileSync(new URL("../src/app/main.js", import.meta.url), "utf8");
  assert.match(main, /recordDeed\(refusedDrag\.id, "refused"\)/);
  assert.match(main, /Math\.max\(0, \(friends\.get\(refusedDrag\.id\) \|\| 0\) \+ deedCost\("refused"\)\)/);
});

import { ROLL_TICKS, rollSpeed, startRoll } from "../src/sim/hands.js";

test("a tucked landing rolls and keeps the run", () => {
  assert.equal(startRoll(false, [8, 0, 0], 0), null);
  assert.equal(startRoll(true, [1, 0, 0], 0), null, "a slow landing has nothing to keep");
  const roll = startRoll(true, [7, 0, 0], 100);
  assert.equal(rollSpeed(roll, 100 + ROLL_TICKS - 1), 7);
  assert.equal(rollSpeed(roll, 100 + ROLL_TICKS), 0);
  const hands = readFileSync(new URL("../src/sim/hands.js", import.meta.url), "utf8");
  assert.match(hands, /const rolled = !airborne && input\.roll > 0 \? Math\.max\(speed, input\.roll\) : speed;/);
  assert.match(hands, /wishPlanar\(input\.yaw, input\.forward \|\| 0, input\.strafe \|\| 0, rolled\)/);
  const main = readFileSync(new URL("../src/app/main.js", import.meta.url), "utf8");
  assert.match(main, /roll: rollSpeed\(roll, tick\)/);
});

test("phone controls send crouch, so a tuck works on touch", () => {
  const touch = readFileSync(new URL("../src/app/touch.js", import.meta.url), "utf8");
  assert.match(touch, /\{ code: "ControlLeft", label: "Crouch", hold: true \}/);
});

import { rainAt } from "../src/sim/cloud.js";

test("rain you can see under the deck that rains on pools", () => {
  let wet = -1, dry = -1;
  for (let t = 0; t < 129600 && (wet < 0 || dry < 0); t += 300) {
    const r = rainAt(0, 0, t); assert.ok(r >= 0 && r <= 1);
    if (r >= 0.25 && wet < 0) wet = t; if (r === 0 && dry < 0) dry = t;
  }
  assert.ok(wet >= 0 && dry >= 0);
  assert.ok(rainOver(0, 0, wet), "visible rain only where the pool rule also rains");
  const gpu = readFileSync(new URL("../src/render/gpu.js", import.meta.url), "utf8");
  assert.match(gpu, /uniform float uRain;/);
  assert.match(gpu, /gl\.uniform1f\(u\("uRain"\), scene\.rain \|\| 0\)/);
});

import { packDeeds, unpackDeeds, deedMessage, readDeedMessage, theirLine, DEEDS_KEY } from "../src/sim/lore.js";

test("friendliness record is kept on the device and sent to the person it is about", () => {
  const deeds = new Map([["ab", { told: 2, refused: 1 }]]);
  const back = unpackDeeds(JSON.parse(JSON.stringify(packDeeds(deeds))));
  assert.deepEqual(back.get("ab"), { told: 2, refused: 1 });
  assert.equal(unpackDeeds("junk").size, 0);
  const msg = readDeedMessage(deedMessage("ab", deeds.get("ab")));
  assert.deepEqual(msg, { about: "ab", told: 2, refused: 1 });
  assert.equal(readDeedMessage('{"t":"drag"}'), null);
  assert.equal(theirLine(msg), "they hold told 2 refused 1");
  assert.equal(theirLine(null), "");
  const main = readFileSync(new URL("../src/app/main.js", import.meta.url), "utf8");
  assert.match(main, /localStorage\.setItem\(DEEDS_KEY/);
  assert.match(main, /deed\.about === meId/);
  assert.equal(DEEDS_KEY, "meridian-deeds");
});

import { screenFoveaAngle } from "../src/render/gpu.js";

test("the focus is a circle on the screen, not an angle cone", () => {
  const gaze = [0.5, 0.5], view = 16 / 9, tan = Math.tan(0.6);
  // The same screen distance across and up gives the same reading (aspect corrected).
  const across = screenFoveaAngle([0.5 + 0.1 / view, 0.5], gaze, view, tan);
  const up = screenFoveaAngle([0.5, 0.6], gaze, view, tan);
  assert.ok(Math.abs(across - up) < 1e-9);
  assert.equal(screenFoveaAngle(gaze, gaze, view, tan), 0);
  const gpu = readFileSync(new URL("../src/render/gpu.js", import.meta.url), "utf8");
  assert.match(gpu, /float a = atan\(length\(d\)\);/);
});

test("the third-person figure balls up while the roll runs", () => {
  const main = readFileSync(new URL("../src/app/main.js", import.meta.url), "utf8");
  assert.match(main, /crouch: !!sample\.crouch \|\| rollSpeed\(roll, tick\) > 0/);
});
