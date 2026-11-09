// A picture snapshot the page can post. The island mesh is built on the picture thread.
import { Crust } from "../sim/crust.js";
import { buildScene } from "./scene.js?v=77";

export function sceneFromStage(stage, atoll) {
  const field = new Crust(stage.seed || atoll.worldSeed, stage.cell || atoll.cellId);
  for (const [key, sample] of stage.crust || []) field.overrides.set(key, sample);
  const scene = buildScene({
    feet: stage.feet,
    yaw: stage.yaw || 0,
    pitch: stage.pitch || 0,
    crouch: !!stage.crouch,
    tick: stage.tick || 0,
    sunTick: stage.sunTick,
    atoll,
    crust: field,
    pieces: stage.pieces || [],
    width: stage.width,
    height: stage.height,
    view: stage.view || "first",
    self: stage.self !== false,
    others: stage.others || [],
    cameraOrigin: stage.cameraOrigin || null,
    cameraDir: stage.cameraDir || null,
    fov: stage.fov || 70,
    smoke: stage.smoke || null,
    swarm: stage.swarm || null,
    pools: stage.pools || [],
    bolts: stage.bolts || [],
    loose: stage.loose || [],
    lean: stage.lean || 0,
    sparse: !!stage.sparse,
    stride: stage.stride || 0,
    gait: stage.gait || 0,
    worn: stage.worn || null,
    down: stage.down || [],
    helpers: stage.helpers || [],
  });
  scene.wear = stage.wear || null;
  scene.prints = stage.prints || [];
  scene.work = stage.work || null;
  scene.time = stage.time || 0;
  scene.rain = stage.rain || 0;
  scene.fog = stage.fog ?? 1;
  scene.gaze = stage.gaze || null;
  scene.fovea = stage.fovea || null;
  return scene;
}
