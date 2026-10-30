import assert from "node:assert/strict";
import test from "node:test";
import { createIdentity } from "../src/net/identity.js";
import { createSkills } from "../src/sim/skills.js";
import { createSurvey } from "../src/sim/map.js";
import { createPlate, samplePlate, stamp } from "../src/sim/plate.js";
import {
  acceptSheet,
  applyCharacter,
  characterBody,
  encodeSheet,
  keepSheet,
  loadIdentity,
  loadPlate,
  loadSheet,
  memoryStore,
  packBlock,
  packPlate,
  saveIdentity,
  savePlate,
  saveSheet,
  unpackPlate,
  unpackStoredBlock,
  forgetKept,
} from "../src/sim/persist.js";

test("a character and their key come back from the store", () => {
  const store = memoryStore();
  const identity = createIdentity();
  saveIdentity(store, identity, "self");
  const back = loadIdentity(store, "self");
  assert.equal(back.secret.length, identity.secret.length);
  assert.equal([...back.pubkey].join(), [...identity.pubkey].join());
  const skills = createSkills();
  skills.mapping.value = 12.4;
  skills.topography.value = 6;
  const body = characterBody({
    at: [1.234, -150.2, 0.4],
    yaw: 1.25,
    skills,
    metal: 9,
    notes: [{ line: "The sand took a hole." }],
    ground: [{ kind: "grass", point: [1.2, -150, 0] }],
    seq: 4,
  });
  saveSheet(store, body, "self");
  const sheet = loadSheet(store, "self");
  const player = { position: [0, 0, 0] };
  const fresh = createSkills();
  const yard = { metal: 0, stone: 0, fiber: 0, sticks: 0, smokes: 0 };
  const notes = [];
  const survey = createSurvey();
  applyCharacter(sheet, { player, skills: fresh, yard, survey, notes });
  assert.equal(player.position[0], 1.23);
  assert.equal(fresh.mapping.value, 12.4);
  assert.equal(fresh.topography.value, 6);
  assert.equal(yard.metal, 9);
  assert.equal(notes[0].line, "The sand took a hole.");
  assert.equal(survey.ground.size, 1);
  const frame = encodeSheet(identity, body);
  const accepted = acceptSheet(frame);
  assert.equal(accepted.ok, true);
  assert.equal(accepted.seq, 4);
  const world = { sheets: {} };
  assert.equal(keepSheet(world, accepted, "aa"), true);
  assert.equal(keepSheet(world, { ...accepted, seq: 2 }, "bb"), false);
  assert.equal(world.sheets[Object.keys(world.sheets)[0]].seq, 4);
  const stored = packBlock({
    bits: 8,
    chunk: [0, 0, 0],
    height: 1,
    miner: "m",
    nonce: 3,
    ops: [{ aim: [0, 0, 0], before: new Uint8Array([1, 2]), chunk: [0, 0, 0], eye: [0, 0, 0], mode: "dig", seq: 1, writes: [] }],
    prev: new Uint8Array([4, 5]),
    seq: 1,
    state: new Uint8Array([6]),
    time: 7,
  });
  const block = unpackStoredBlock(stored);
  assert.equal(block.prev[0], 4);
  assert.equal(block.ops[0].before[1], 2);
  const plate = createPlate(32, 32, [0, 0]);
  stamp(plate, 1, 1, [10, 20, 30, 255], 0.4);
  const storePlate = memoryStore();
  savePlate(storePlate, plate, "self");
  const again = createPlate(32, 32, [0, 0]);
  unpackPlate(again, loadPlate(storePlate, "self"));
  assert.deepEqual(samplePlate(again, 1, 1).slice(0, 3), samplePlate(plate, 1, 1).slice(0, 3));
  assert.equal(packPlate(createPlate(8, 8)).length > 0, true);
});

test("forgetting the keep wipes every meridian save and leaves the rest", () => {
  const store = memoryStore({
    "meridian-id-self": "a",
    "meridian-sheet-self": "{}",
    "meridian-plate-ai-surveyor": "b",
    "meridian-world-self": "{}",
    other: "stay",
  });
  assert.equal(forgetKept(store), 4);
  assert.equal(store.get("meridian-id-self"), null);
  assert.equal(store.get("meridian-plate-ai-surveyor"), null);
  assert.equal(store.get("meridian-world-self"), null);
  assert.equal(store.get("other"), "stay");
});
