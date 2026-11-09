import assert from "node:assert/strict";
import test from "node:test";
import { createIdentity } from "../src/net/identity.js";
import { sceneFromStage } from "../src/render/stage.js";
import { acceptSheet, characterBody, encodeSheet } from "../src/sim/persist.js";
import { createSkills } from "../src/sim/skills.js";
import {
  HELPER_CAP,
  HELPER_COST,
  HELPER_NEED,
  canCraftHelper,
  craftHelper,
  cycleHelperTask,
  dismissHelper,
  helperLine,
  nearestHelper,
  orderHelper,
  packHelpers,
  stepHelper,
  unpackHelpers,
} from "../src/sim/helper.js";

function yardOf({ metal = 30, stone = 8, fiber = 2 } = {}) {
  return { metal, stone, fiber };
}

function skilled(value = HELPER_NEED) {
  const skills = createSkills();
  skills.building.value = value;
  skills.building.xp = value;
  return skills;
}

test("a helper costs building skill and is not paid for until the skill is there", () => {
  const yard = yardOf();
  const skills = skilled(HELPER_NEED - 0.1);
  const crew = [];
  const made = craftHelper(yard, skills, { x: 1, y: 2, tick: 10 }, crew);
  assert.equal(made.ok, false);
  assert.equal(made.reason, "skill");
  assert.equal(yard.metal, 30);
  assert.equal(crew.length, 0);
  assert.equal(canCraftHelper(yard, skilled(0), 0).reason, "skill");
});

test("materials are named when the skill is enough and nothing is spent on a refusal", () => {
  const yard = yardOf({ metal: HELPER_COST.metal - 1, stone: 8, fiber: 2 });
  const before = yard.metal;
  const made = craftHelper(yard, skilled(8), { tick: 3 }, []);
  assert.equal(made.ok, false);
  assert.equal(made.reason, "metal");
  assert.equal(yard.metal, before);
  assert.equal(craftHelper(yardOf({ stone: 0 }), skilled(8), {}, []).reason, "stone");
  assert.equal(craftHelper(yardOf({ fiber: 0 }), skilled(8), {}, []).reason, "fiber");
});

test("crafting spends the cost, raises the maker, and seeds the helper from that building", () => {
  const yard = yardOf();
  const skills = skilled(8);
  const crew = [];
  const made = craftHelper(yard, skills, { x: 4, y: -150, tick: 90 }, crew);
  assert.equal(made.ok, true);
  assert.equal(yard.metal, 30 - HELPER_COST.metal);
  assert.equal(yard.stone, 8 - HELPER_COST.stone);
  assert.equal(yard.fiber, 2 - HELPER_COST.fiber);
  assert.equal(crew.length, 1);
  assert.equal(made.helper.task, "follow");
  assert.equal(made.helper.skills.building.value, 2);
  assert.ok(skills.building.value > 8);
  assert.ok(made.trained > 0);
  assert.equal(crew.length, 1);
});

test("three is the crew, and dismissing the nearest one returns half the metal and stone", () => {
  const yard = yardOf({ metal: 80, stone: 40, fiber: 10 });
  const skills = skilled(20);
  const crew = [];
  for (let i = 0; i < HELPER_CAP; i += 1) {
    assert.equal(craftHelper(yard, skills, { x: i, y: i, tick: 100 + i }, crew).ok, true);
  }
  assert.equal(craftHelper(yard, skills, { tick: 200 }, crew).reason, "many");
  assert.equal(crew.length, HELPER_CAP);
  const near = nearestHelper(crew, 0, 0);
  assert.equal(near, crew[0]);
  const metal = yard.metal;
  const stone = yard.stone;
  assert.equal(dismissHelper(yard, near).ok, true);
  assert.equal(yard.metal, metal + HELPER_COST.metal / 2);
  assert.equal(yard.stone, stone + HELPER_COST.stone / 2);
  assert.equal(dismissHelper(yard, null).ok, false);
});

test("orders cycle, and an unknown word does not change the task", () => {
  const helper = { task: "follow", work: 4, spot: [1, 1], corners: [[0, 0]] };
  assert.equal(orderHelper(helper, "nope"), "follow");
  assert.equal(helper.work, 4);
  assert.equal(cycleHelperTask(helper), "dig");
  assert.equal(helper.work, 0);
  assert.equal(helper.spot, null);
  assert.equal(cycleHelperTask(helper), "haul");
  assert.equal(cycleHelperTask(helper), "survey");
  assert.equal(cycleHelperTask(helper), "hold");
  assert.equal(cycleHelperTask(helper), "follow");
});

test("digging is slower untrained, fills the arms, and the mining skill rises and slows", () => {
  const fresh = { id: "digger", x: 0, y: 0, yaw: 0, task: "dig", skills: { mining: { xp: 0, value: 0 }, hauling: { xp: 0, value: 0 }, mapping: { xp: 0, value: 0 }, building: { xp: 0, value: 0 } }, work: 0, carry: 0, spot: [0, 0] };
  const trained = { ...fresh, id: "old", skills: { mining: { xp: 40, value: 40 }, hauling: { xp: 0, value: 0 }, mapping: { xp: 0, value: 0 }, building: { xp: 0, value: 0 } }, work: 0, carry: 0, spot: [0, 0] };
  const home = { tick: 1, player: [0, 0], home: [0, 0], loose: [] };
  for (let i = 0; i < 102; i += 1) {
    stepHelper(fresh, home);
    stepHelper(trained, home);
  }
  assert.equal(fresh.carry, 0);
  assert.equal(trained.carry, 1);
  assert.ok(trained.skills.mining.value > 40);
  for (let i = 0; i < 60; i += 1) stepHelper(fresh, home);
  assert.equal(fresh.carry, 1);
  const first = fresh.skills.mining.value;
  fresh.work = 0;
  fresh.carry = 0;
  for (let i = 0; i < 150; i += 1) stepHelper(fresh, home);
  const second = fresh.skills.mining.value - first;
  assert.ok(second > 0);
  assert.ok(second < first);
  fresh.carry = 3;
  fresh.work = 0;
  const held = fresh.skills.mining.value;
  for (let i = 0; i < 200; i += 1) stepHelper(fresh, home);
  assert.equal(fresh.carry, 3);
  assert.equal(fresh.skills.mining.value, held);
});

test("haul brings stone home, and a loose stone is taken once", () => {
  const helper = { id: "hauler", x: 0, y: 0, yaw: 0, task: "haul", skills: { mining: { xp: 0, value: 0 }, hauling: { xp: 0, value: 0 }, mapping: { xp: 0, value: 0 }, building: { xp: 0, value: 0 } }, work: 0, carry: 2 };
  const dumped = stepHelper(helper, { tick: 1, player: [9, 9], home: [0, 0], loose: [] });
  assert.equal(dumped.deposited, 2);
  assert.equal(helper.carry, 0);
  assert.ok(helper.skills.hauling.value > 0);
  let taken = 0;
  const again = { ...helper, carry: 0, skills: helper.skills };
  const picked = stepHelper(again, {
    tick: 2,
    player: [0, 0],
    home: [5, 0],
    loose: [{ x: 0, y: 0, take: () => { taken += 1; return taken === 1; } }],
  });
  assert.equal(picked.deposited, 0);
  assert.equal(again.carry, 1);
  assert.equal(taken, 1);
  again.carry = 0;
  stepHelper(again, {
    tick: 3,
    player: [0, 0],
    home: [5, 0],
    loose: [{ x: again.x, y: again.y, take: () => false }],
  });
  assert.equal(again.carry, 0);
});

test("a skilled hauler covers more ground than a new one", () => {
  const slow = { id: "s", x: 0, y: 0, yaw: 0, task: "haul", skills: { hauling: { xp: 0, value: 0 } }, work: 0, carry: 0 };
  const fast = { id: "f", x: 0, y: 0, yaw: 0, task: "haul", skills: { hauling: { xp: 80, value: 80 } }, work: 0, carry: 0 };
  const sense = { tick: 4, player: [0, 0], home: [0, 0], loose: [{ x: 12, y: 0 }] };
  for (let i = 0; i < 40; i += 1) {
    stepHelper(slow, sense);
    stepHelper(fast, sense);
  }
  assert.ok(fast.x > slow.x + 1);
});

test("follow keeps a leash, survey walks and learns, hold stays", () => {
  const follower = { id: "f", x: 0, y: 0, yaw: 0, task: "follow", skills: { mining: { value: 0 }, hauling: { value: 0 }, mapping: { value: 0 }, building: { value: 0 } }, work: 0, carry: 0 };
  for (let i = 0; i < 90; i += 1) stepHelper(follower, { tick: i, player: [10, 0], home: [0, 0] });
  const dist = Math.hypot(follower.x - 10, follower.y);
  assert.ok(dist < 2.5, dist);
  assert.ok(dist > 1.2, dist);
  assert.equal(follower.skills.mapping.value, 0);
  const surveyor = { id: "m", x: 0, y: 0, yaw: 0, task: "survey", skills: { mining: { xp: 0, value: 0 }, hauling: { xp: 0, value: 0 }, mapping: { xp: 0, value: 0 }, building: { xp: 0, value: 0 } }, work: 0, carry: 0 };
  const before = [surveyor.x, surveyor.y];
  for (let i = 0; i < 20; i += 1) stepHelper(surveyor, { tick: i * 15, player: [0, 0], home: [0, 0] });
  assert.ok(surveyor.x !== before[0] || surveyor.y !== before[1]);
  assert.ok(surveyor.skills.mapping.value > 0);
  assert.ok(surveyor.skills.building.value > 0);
  const held = { id: "h", x: 3, y: 4, yaw: 0, task: "hold", skills: {}, work: 0, carry: 0 };
  stepHelper(held, { tick: 1, player: [0, 0], home: [0, 0] });
  assert.equal(held.x, 3);
  assert.equal(held.y, 4);
});

test("the sheet keeps the crew as integers and an empty crew adds nothing", () => {
  const helper = craftHelper(yardOf(), skilled(10), { x: -1.234, y: -150.2, tick: 7 }, []).helper;
  helper.task = "dig";
  helper.carry = 2;
  helper.skills.mining.value = 3.25;
  const packed = packHelpers([helper]);
  const body = characterBody({ at: [0, -150, 0], helpers: packed, seq: 2 });
  assert.equal(body.helpers[0].x, Math.round(-1.234 * 100));
  assert.equal(body.helpers[0].task, "dig");
  assert.equal(Number.isInteger(body.helpers[0].skills[0]), true);
  const back = unpackHelpers(body.helpers);
  assert.equal(back[0].task, "dig");
  assert.equal(back[0].carry, 2);
  assert.equal(back[0].x, body.helpers[0].x / 100);
  assert.equal(back[0].skills.mining.value, 3.3);
  assert.match(helperLine(back[0]), /^dig 2/);
  assert.equal(characterBody({ at: [0, 0, 0] }).helpers, undefined);
  const identity = createIdentity();
  const accepted = acceptSheet(encodeSheet(identity, body));
  assert.equal(accepted.ok, true);
  assert.equal(unpackHelpers(accepted.body.helpers)[0].id, helper.id);
});

test("the picture thread draws a helper from the stage", () => {
  const scene = sceneFromStage({
    feet: [0, -150, 0],
    yaw: 0,
    pitch: 0,
    tick: 0,
    sunTick: 0,
    width: 32,
    height: 18,
    pieces: [],
    view: "first",
    self: false,
    helpers: [{ id: "helper-1", x: 1, y: -150, yaw: 0.4, task: "follow", work: 2 }],
  }, {
    worldSeed: "atoll-slice-1",
    cellId: "atoll-0",
    props: [],
    placements: { dummy: { x: 0, y: -14000 } },
  });
  const parts = scene.objects.filter((object) => object.body === "helper");
  assert.equal(parts.length, 2);
  assert.equal(parts[0].id, "helper-1");
});
