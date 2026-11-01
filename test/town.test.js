import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { floraBoxes } from "../src/sim/life.js";
import { haltFeet } from "../src/sim/town.js";
import { bindPublicHearth, recallPoint } from "../src/sim/hearth.js";
import { appraise, subjectFromHit } from "../src/sim/appraise.js";
import { listTargets } from "../src/sim/target.js";
import { buildScene } from "../src/render/scene.js";

const atoll = JSON.parse(readFileSync(new URL("../content/atoll.json", import.meta.url), "utf8"));

function covers(box, x, y, radius = 0) {
  return x > box.min.x / 100 - radius && x < box.max.x / 100 + radius
    && y > box.min.y / 100 - radius && y < box.max.y / 100 + radius;
}

test("southmere is a square of roofs, a well, and a public hearth", () => {
  const town = atoll.props.filter((prop) => prop.place === "southmere");
  assert.equal(town.length, 12);
  assert.equal(atoll.props.length + floraBoxes().length <= 32, true);
  const hearth = town.find((prop) => prop.id === "mere.hearth");
  assert.equal(hearth.kind, "hearth");
  assert.equal(hearth.halt, true);
  assert.deepEqual(hearth.cell, [-40, -308]);
  assert.equal(town.filter((prop) => prop.halt).length, 7);
  assert.equal(town.some((prop) => prop.material === "thatch"), true);
  assert.equal(town.some((prop) => prop.material === "water"), true);
  const spawn = atoll.placements.spawnFeet;
  for (const prop of town) {
    assert.equal(covers(prop.box, spawn.x / 100, spawn.y / 100, 0.4), false, prop.id);
  }
  const names = new Set(town.map((prop) => prop.name));
  for (const name of ["Meeting hall", "Forge shed", "Ration house", "Splint house", "Chart house", "Hearth stone", "Well"]) {
    assert.equal(names.has(name), true, name);
  }
});

test("the square can be walked and a wall pushes you out", () => {
  const plaza = haltFeet([-48, -164, 0], atoll.props);
  assert.equal(plaza[0], -48);
  assert.equal(plaza[1], -164);
  const lane = haltFeet([-39, -162.3, 0], atoll.props);
  assert.equal(lane[0], -39);
  assert.equal(lane[1], -162.3);
  const inside = haltFeet([-48, -159, 0], atoll.props);
  assert.ok(Math.hypot(inside[0] + 48, inside[1] + 159) > 0.3);
  const hall = atoll.props.find((prop) => prop.id === "mere.hall");
  assert.equal(covers(hall.box, inside[0], inside[1], 0.35), false);
});

test("binding the public hearth recalls just north of the stone", () => {
  const hearth = atoll.props.find((prop) => prop.id === "mere.hearth");
  const yard = { pieces: [], bound: null };
  const bound = bindPublicHearth(yard, hearth.cell);
  assert.equal(bound.ok, true);
  assert.equal(yard.pieces.length, 0);
  const back = recallPoint(yard, [0, -150, 0]);
  for (const prop of atoll.props) {
    if (!prop.halt) continue;
    assert.equal(covers(prop.box, back[0], back[1], 0.35), false, prop.id);
  }
  const line = appraise(0, { name: hearth.name, material: "public stone", action: hearth.action, detail: hearth.detail, difficulty: 0 });
  assert.equal(line.line, "Hearth stone");
  const hit = subjectFromHit({
    t: 1,
    point: [-20.2, -154.6, 1],
    object: {
      type: "box",
      id: hearth.id,
      kind: "hearth",
      name: hearth.name,
      surface: hearth.material,
      action: hearth.action,
      detail: hearth.detail,
      difficulty: 0,
      cell: hearth.cell,
    },
  });
  assert.equal(hit.kind, "hearth");
  assert.equal(hit.public, true);
  assert.deepEqual(hit.cell, [-40, -308]);
  const listed = listTargets({ props: [hearth], feet: [-20, -154, 0] });
  assert.equal(listed[0].name, "Hearth stone");
  assert.equal(listed[0].public, true);
});

test("the nearest boxes are the ones you are standing in", () => {
  const town = buildScene({ feet: [-48, -168, 0], yaw: 0, pitch: 0, atoll, crust: false, width: 8, height: 8 });
  const townBoxes = town.objects.filter((object) => object.type === "box");
  assert.equal(townBoxes[0].id.startsWith("mere."), true, townBoxes[0].id);
  const compound = buildScene({ feet: [0, 0, 0], yaw: 0, pitch: 0, atoll, crust: false, width: 8, height: 8 });
  const compoundBoxes = compound.objects.filter((object) => object.type === "box");
  assert.equal(compoundBoxes[0].id.startsWith("mere."), false, compoundBoxes[0].id);
});
