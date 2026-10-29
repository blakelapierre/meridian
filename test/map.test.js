import assert from "node:assert/strict";
import test from "node:test";
import { abilityLine, formatFix, headingDegrees, mapAbilities, mapMarks, placeMark } from "../src/sim/map.js";

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
