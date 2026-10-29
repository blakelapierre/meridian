import assert from "node:assert/strict";
import test from "node:test";
import { boltHit, startBolt, stepBolt } from "../src/sim/bolt.js";
import { cellId, sameCell } from "../src/sim/cell.js";
import { roundMaterials } from "../src/sim/clocks.js";
import { firstCrate } from "../src/sim/culture.js";
import { deedVolume, insideDeed, mayEdit } from "../src/sim/deed.js";
import { bondOpen, hearBond, offerBond } from "../src/sim/fellowship.js";
import { lithoTick } from "../src/sim/litho.js";
import { notePool } from "../src/sim/pool.js";
import { separate } from "../src/sim/separate.js";
import { radialDown, shellDrop } from "../src/sim/shell.js";
import { fallHurt, bleed } from "../src/sim/hearth.js";
import { drainPool, flowOnce } from "../src/sim/pool.js";
import { slumpChoice } from "../src/sim/crust.js";
import { tithe, dragPace } from "../src/sim/fellowship.js";
import { standWhere, maySit } from "../src/sim/command.js";
import { penFactor } from "../src/sim/bolt.js";
import { noteHarm } from "../src/sim/identityharm.js";
import { createSkills, claimSpecialty } from "../src/sim/skills.js";
import { sporeMetal } from "../src/sim/litho.js";
import { quorum, inInterest } from "../src/sim/cell.js";
import { overheadPoint } from "../src/sim/clocks.js";
import { grantKey } from "../src/sim/deed.js";
import { createVein, tapVein } from "../src/sim/vein.js";
import { createIdentity, exportKey, importKey, keyPhrase } from "../src/net/identity.js";

test("the concept slices that are pure stay small and strict", () => {
  assert.ok(shellDrop(0, 0) === 0);
  assert.ok(shellDrop(1000, 0) > 1.4 && shellDrop(1000, 0) < 1.7);
  const down = radialDown(0, 0, 0);
  assert.ok(down[2] < -0.99);

  assert.equal(firstCrate("hosts").metal, 40);
  assert.equal(firstCrate("veil").stone, 4);
  assert.equal(firstCrate("holds").stone, 12);

  const pools = [];
  assert.equal(notePool(pools, { x: 1, y: 2, floor: 0 }), null);
  assert.ok(notePool(pools, { x: 1, y: 2, floor: -0.4 }));
  assert.equal(notePool(pools, { x: 1, y: 2, floor: -0.5 }), null);

  const deed = deedVolume([0, 0], "me");
  assert.equal(insideDeed(deed, 1, 1), true);
  assert.equal(mayEdit(deed, 1, 1, "me"), true);
  assert.equal(mayEdit(deed, 1, 1, "them"), false);
  assert.equal(mayEdit(deed, 20, 0, "them"), true);

  const bonds = new Map();
  offerBond(bonds, "a");
  assert.equal(bondOpen(bonds, "a", true), false);
  hearBond(bonds, "a");
  assert.equal(bondOpen(bonds, "a", true), true);
  assert.equal(bondOpen(bonds, "a", false), false);

  assert.equal(roundMaterials({ abandoned: true, phase: "gap", previous: "live" }), 0);
  assert.equal(roundMaterials({ abandoned: false, phase: "gap", previous: "live" }), 8);
  assert.equal(roundMaterials({ abandoned: false, phase: "live", previous: "buy" }), 0);

  const bolt = startBolt([0, 0, 2], [1, 0, 0], 10);
  stepBolt(bolt, 1);
  assert.ok(bolt.position[0] > 9);
  assert.ok(bolt.position[2] < 2);
  assert.equal(boltHit(bolt, bolt.position), true);

  assert.equal(cellId(-80), "atoll-0");
  assert.equal(cellId(10), "atoll-1");
  assert.equal(sameCell("atoll-1", "atoll-0"), false);
  assert.equal(sameCell("atoll-1", ""), true);

  const moved = separate([0, 0, 0], [[0.2, 0]]);
  assert.ok(Math.hypot(moved[0] - 0.2, moved[1]) >= 0.69);

  assert.equal(lithoTick(80, { beach: true, nearest: 100 }), 80);
  assert.equal(lithoTick(80, { beach: false, nearest: 30 }), 79);

  const key = createIdentity();
  const back = importKey(exportKey(key));
  assert.equal(back.pubkey.length, key.pubkey.length);
  assert.equal(back.secret.length, key.secret.length);
});

test("the next slice of each open note is a small rule", () => {
  assert.equal(drainPool([{ key: "1,2" }], { x: 1, y: 2, floor: 0 }), true);
  const skills = createSkills();
  skills.mining.value = 40;
  assert.equal(claimSpecialty(skills), "mining");
  assert.equal(claimSpecialty(skills), null);
  assert.equal(sporeMetal(5, { beach: false, wood: true, nearest: 30 }), 4);
  assert.equal(sporeMetal(5, { beach: true, wood: true, nearest: 30 }), 5);
  assert.equal(quorum(2, 3), true);
  assert.equal(quorum(1, 3), false);
  assert.equal(inInterest(90), false);
  assert.deepEqual(overheadPoint(3, 4), { x: 3, y: 4 });
  assert.equal(fallHurt(100, -4), 100);
  assert.equal(fallHurt(100, -12), 92);
  const keys = new Set();
  grantKey(keys, "them");
  const deed = deedVolume([0, 0], "me");
  assert.equal(mayEdit(deed, 1, 0, "them", keys), true);
  assert.equal(standWhere({ integrity: 0, at: [1, 2] })[0], 1);
  assert.equal(standWhere({ integrity: 10, at: [1, 2] }), null);
  const vein = createVein([0, 0], 3);
  assert.equal(tapVein(vein, 0, 0), 2);
  assert.equal(vein.metal, 1);
  const phrase = keyPhrase(createIdentity());
  assert.equal(importKey(phrase).pubkey.length, 32);
  const vitals = { integrity: 30, blood: 10 };
  assert.ok(bleed(vitals, 1) < 10);
  const flowed = flowOnce({ x: 1, y: 2, floor: -1, key: "a" }, -1, -2);
  assert.equal(flowed.y, 2.5);
  assert.equal(tithe(10), 0);
  assert.equal(maySit(), false);
  assert.equal(penFactor(0, 1), 1);
  assert.ok(penFactor(20, 1) < 1);
  assert.equal(noteHarm([], "self", "salvage")[0].what, "salvage");
  assert.equal(slumpChoice(500, -500), 250);
  assert.equal(slumpChoice(0, 0), null);
  assert.equal(dragPace(true), 1.6);
});

