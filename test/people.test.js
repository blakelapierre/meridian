import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { PEOPLE, speakTo, targetPlate } from "../src/sim/people.js";
import { haltFeet } from "../src/sim/town.js";
import { listPlayers, listObjects } from "../src/sim/target.js";
import { subjectFromHit } from "../src/sim/appraise.js";
import { buildScene } from "../src/render/scene.js";

const atoll = JSON.parse(readFileSync(new URL("../content/atoll.json", import.meta.url), "utf8"));

test("the plate names the target even when appraisal does not", () => {
  assert.equal(targetPlate(null), null);
  const plate = targetPlate({
    name: "Meeting hall",
    kind: "building",
    line: "You cannot tell what that is.",
    canAct: false,
  });
  assert.equal(plate.title, "Meeting hall");
  assert.match(plate.line, /Esc or ⌫ clears/);
  assert.equal(plate.line.includes("cannot tell"), false);
  const person = targetPlate({
    name: "Pell",
    kind: "person",
    detail: "at the hearth",
    line: "Pell",
    canAct: false,
  });
  assert.equal(person.title, "Pell");
  assert.match(person.line, /at the hearth/);
  assert.match(person.line, /U speaks/);
});

test("three people stand clear of the walls and will speak up close", () => {
  assert.equal(PEOPLE.length, 3);
  const ids = PEOPLE.map((person) => person.id).sort();
  assert.deepEqual(ids, ["hask", "nim", "pell"]);
  for (const person of PEOPLE) {
    const stayed = haltFeet([person.at[0], person.at[1], 0], atoll.props, 0.35);
    assert.equal(stayed[0], person.at[0], person.id);
    assert.equal(stayed[1], person.at[1], person.id);
    assert.equal(speakTo(person, [person.at[0] + 10, person.at[1]]).reason, "too far");
    assert.equal(speakTo(person, person.at).ok, true);
    assert.ok(speakTo(person, person.at).line.length > 8);
  }
});

test("tab finds them and backtick does not", () => {
  const options = { people: PEOPLE, feet: [-20, -157, 0] };
  const people = listPlayers(options);
  assert.equal(people[0].id, "pell");
  assert.deepEqual(people.map((item) => item.id).sort(), ["hask", "nim", "pell"]);
  assert.equal(listObjects(options).some((item) => item.kind === "person"), false);
});

test("a look at Pell names Pell", () => {
  const scene = buildScene({
    feet: [-20.2, -156.8, 0],
    yaw: 0,
    pitch: 0,
    atoll,
    crust: false,
    width: 8,
    height: 8,
  });
  const spheres = scene.objects.filter((object) => object.type === "sphere");
  assert.ok(spheres.slice(0, 3).every((part) => part.id === "pell"));
  const subject = subjectFromHit({ object: spheres[0], point: [-20.2, -156.8, 1.4], t: 1 });
  assert.equal(subject.kind, "person");
  assert.equal(subject.name, "Pell");
  assert.match(subject.speech, /stone/);
});
