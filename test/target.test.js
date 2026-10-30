import assert from "node:assert/strict";
import test from "node:test";
import { cycleTarget, listObjects, listPlayers, listTargets } from "../src/sim/target.js";
import { worldToScreen } from "../src/engine/cast.js";
import { chaseOrigin } from "../src/sim/body.js";
import { createPacer } from "../src/render/pace.js";

test("tab cycles interesting targets and skips the landscape", () => {
  const list = listTargets({
    dummy: { x: 0, y: 400, z: 0 },
    pieces: [{ id: "wall", at: [2, 2] }, { id: "sand", at: [0, 0] }],
    props: [{ id: "door.south", box: { min: { x: 0, y: 0, z: 0 }, max: { x: 100, y: 100, z: 100 } } }],
    feet: [0, 0, 0],
  });
  assert.deepEqual(list.map((item) => item.kind), ["prop", "wall", "dummy"]);
  assert.equal(list.some((item) => item.kind === "sand"), false);
  assert.equal(cycleTarget(list, null, 1).kind, "prop");
  assert.equal(cycleTarget(list, list[0].id, 1).id, list[1].id);
  assert.equal(cycleTarget(list, list[0].id, -1).id, list[2].id);
});

test("tab stays on people and backtick stays on objects", () => {
  const options = {
    dummy: { x: 0, y: 400, z: 0 },
    others: [
      { id: "miner", feet: [2, 0, 0], yaw: 0 },
      { id: "surveyor", feet: [4, 0, 0], yaw: 0 },
    ],
    pieces: [{ id: "wall", at: [2, 2] }],
    props: [{ id: "door.south", box: { min: { x: 0, y: 0, z: 0 }, max: { x: 100, y: 100, z: 100 } } }],
    feet: [0, 0, 0],
  };
  const people = listPlayers(options);
  const objects = listObjects(options);
  assert.deepEqual(people.map((item) => item.id), ["miner", "surveyor"]);
  assert.equal(people.some((item) => item.kind !== "player"), false);
  assert.equal(objects.some((item) => item.kind === "player"), false);
  assert.deepEqual(objects.map((item) => item.kind), ["prop", "wall", "dummy"]);
  assert.equal(cycleTarget(people, "miner", 1).id, "surveyor");
  assert.equal(cycleTarget(objects, "door.south", 1).kind, "wall");
});

test("a point straight ahead lands on the screen center", () => {
  const screen = worldToScreen([0, 10, 0], {
    origin: [0, 0, 0],
    dir: [0, 1, 0],
    fov: 90,
    aspect: 1,
    planeDistance: 1,
  });
  assert.ok(Math.abs(screen.x - 0.5) < 0.02, screen.x);
  assert.ok(Math.abs(screen.y - 0.5) < 0.02, screen.y);
  assert.equal(worldToScreen([0, -4, 0], {
    origin: [0, 0, 0],
    dir: [0, 1, 0],
    fov: 90,
    aspect: 1,
    planeDistance: 1,
  }), null);
});

test("the scroll distance moves the camera along the line behind the body", () => {
  const near = chaseOrigin([0, 0, 0], 0, 0, false, 2);
  const far = chaseOrigin([0, 0, 0], 0, 0, false, 8);
  assert.ok(far[1] < near[1]);
  assert.equal(near[0], 0);
});

test("an extra frame slows to keep the primary at vsync and never slower than 1fps", () => {
  const extra = createPacer();
  let now = 0;
  assert.equal(extra.considerExtra(now, true).paint, true);
  extra.note(1, false, false);
  let painted = 0;
  for (let frame = 0; frame < 90; frame += 1) {
    now += 16;
    const decision = extra.considerExtra(now, true);
    assert.ok(decision.interval <= 1000);
    if (decision.paint) {
      painted += 1;
      extra.note(1, false, false);
    }
  }
  assert.ok(painted > 5, painted);
  const fast = extra.considerExtra(now, true);
  assert.ok(fast.interval < 200, fast.interval);
  const before = now;
  let nextPaint = 0;
  for (let frame = 0; frame < 80; frame += 1) {
    now += 16;
    const decision = extra.considerExtra(now, false);
    assert.ok(decision.interval <= 1000);
    if (decision.paint) {
      extra.note(1, false, false);
      if (!nextPaint) nextPaint = now;
    }
  }
  assert.ok(nextPaint > 0 && nextPaint - before <= 1100, nextPaint - before);
});
