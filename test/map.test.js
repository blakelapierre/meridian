import assert from "node:assert/strict";
import test from "node:test";
import { abilityLine, createSurvey, formatFix, headingDegrees, mapAbilities, mapMarks, noteNearby, notePlace, noteSurvey, placeMark } from "../src/sim/map.js";

test("the map keeps world coordinates and a live heading", () => {
  assert.equal(headingDegrees(0), 0);
  assert.equal(Math.round(headingDegrees(Math.PI / 2)), 90);
  assert.equal(formatFix(1.26, -150.04, 0), "1.3, -150.0 m  000°");
  const north = placeMark([0, 0, 0], [0, 10, 0], 20, 100);
  assert.ok(north.y < 50, north.y);
  assert.ok(Math.abs(north.x - 50) < 1, north.x);
});

test("mapping skill opens range, people, names, and objects", () => {
  const none = mapAbilities(0);
  const trained = mapAbilities(80);
  assert.equal(none.people, false);
  assert.equal(none.trail, 0);
  assert.ok(trained.radius > none.radius);
  assert.equal(trained.people, true);
  assert.equal(trained.names, true);
  assert.equal(trained.objects, true);
  assert.match(abilityLine(0), /^you$/);
  assert.match(abilityLine(80), /people/);
  assert.match(abilityLine(80), /names/);
  const hidden = mapMarks({
    self: [0, 0, 0],
    skill: 0,
    others: [{ id: "miner", feet: [3, 0, 0], color: [1, 0, 0, 1] }],
    target: { id: "dummy", kind: "dummy", point: [0, 8, 0] },
  });
  assert.equal(hidden.marks.some((mark) => mark.kind === "player"), false);
  assert.equal(hidden.marks.some((mark) => mark.kind === "target"), true);
  const shown = mapMarks({
    self: [0, 0, 0],
    skill: 80,
    others: [{ id: "miner", feet: [3, 0, 0], color: [1, 0, 0, 1] }],
    objects: [{ id: "wall:1:1", kind: "wall", point: [1, 1, 0] }],
    target: { id: "dummy", kind: "dummy", point: [0, 8, 0] },
  });
  const person = shown.marks.find((mark) => mark.kind === "player");
  assert.equal(person.name, "miner");
  assert.equal(shown.marks.some((mark) => mark.kind === "object"), true);
});

test("the chart keeps ground, pits, and places as skills rise", () => {
  const fresh = createSurvey();
  noteSurvey(fresh, { x: 1, y: 2, yaw: 0, depthAt: () => -0.5, skills: { mapping: 0, mining: 40 } });
  assert.equal(fresh.ground.size, 0);
  noteSurvey(fresh, { x: 1, y: 2, yaw: 0, depthAt: () => -0.5, skills: { mapping: 10, mining: 0 } });
  assert.equal([...fresh.ground.values()][0].kind, "sand");
  noteSurvey(fresh, { x: 1, y: 2, yaw: 0, depthAt: () => -0.5, skills: { mapping: 10, mining: 12 } });
  assert.equal([...fresh.ground.values()].some((cell) => cell.kind === "pit"), true);
  assert.equal(fresh.places.has("pit:0:1") || fresh.places.has("pit:0:0"), true);
  const sight = createSurvey();
  noteSurvey(sight, { x: 0, y: 0, yaw: 0, depthAt: () => 0, skills: { mapping: 10, eyesight: 140 } });
  assert.ok(sight.ground.size > 1);
  const places = createSurvey();
  notePlace(places, { id: "wall:1:1", kind: "wall", name: "wall", point: [1.4, 2.2, 0] }, { mapping: 0, building: 0 });
  assert.equal(places.places.size, 0);
  notePlace(places, { id: "wall:1:1", kind: "wall", name: "wall", point: [1.4, 2.2, 0] }, { building: 1, ranging: 25 });
  assert.equal(places.places.get("wall:1:1").name, "");
  notePlace(places, { id: "dummy", kind: "dummy", name: "dummy", point: [10.2, -125.4, 0] }, { appraisal: 20, ranging: 25 });
  assert.match(places.places.get("dummy").name, /dummy 10\.2,-125\.4/);
  noteNearby(places, [0, 0, 0], [{ id: "pad", kind: "pad", name: "pad", point: [3, 1, 0] }], { mapping: 10 });
  assert.equal(places.places.has("pad"), false);
  noteNearby(places, [0, 0, 0], [{ id: "pad", kind: "pad", name: "pad", point: [3, 1, 0] }], { mapping: 16 });
  assert.equal(places.places.has("pad"), true);
  const drawn = mapMarks({
    self: [0, 0, 0],
    skill: 20,
    ground: [...fresh.ground.values()],
    places: [...places.places.values()],
  });
  assert.equal(drawn.marks.some((mark) => mark.kind === "sand" || mark.kind === "pit"), true);
});
