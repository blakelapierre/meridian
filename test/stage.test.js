import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { sceneFromStage } from "../src/render/stage.js";

const atoll = {
  worldSeed: "atoll-slice-1",
  cellId: "atoll-0",
  props: [],
  placements: { dummy: { x: 0, y: -14000 } },
};

test("the picture thread builds a scene from a plain stage, including dug ground", () => {
  const scene = sceneFromStage({
    feet: [0, -150, 0],
    yaw: 0,
    pitch: 0,
    tick: 0,
    sunTick: 0,
    width: 32,
    height: 18,
    crust: [["1,2,3", -50]],
    pieces: [],
    view: "first",
    self: false,
  }, atoll);
  const crust = scene.objects.find((object) => object.type === "crust");
  assert.equal(crust.field.overrides.get("1,2,3"), -50);
  assert.ok(scene.camera.origin);
  assert.ok(scene.objects.length > 1);
});

test("the page posts a stage and does not build the island mesh on the UI thread", () => {
  const main = readFileSync(new URL("../src/app/main.js", import.meta.url), "utf8");
  const worker = readFileSync(new URL("../src/app/render-worker.js", import.meta.url), "utf8");
  const remote = main.slice(main.indexOf("function paintRemote"), main.indexOf("\nfunction paint("));
  assert.match(main, /return paintRemote\(sample, width, height\)/);
  assert.match(remote, /painter\.paintStage\(stageFor/);
  assert.doesNotMatch(remote, /sceneFor\(/);
  assert.match(worker, /sceneFromStage/);
});
