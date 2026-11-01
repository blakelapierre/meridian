import assert from "node:assert/strict";
import test from "node:test";
import { cast, shapeHit, sphereRayIntersection } from "../src/engine/cast.js";
import { paintFrame } from "../src/engine/frame.js";
import { createCrowd, createShapes } from "../src/engine/demo.js";
import { Mass, createUniverse, tick } from "../src/engine/physics.js";
import { packGpuNodes, packShapeTree } from "../src/engine/octree.js";

function sphere(x, y, z, radius = 1, color = [1, 0, 0, 1]) {
  return { type: "sphere", origin: [x, y, z], radius, color };
}

function linearClosest(origin, direction, objects) {
  let best = null;
  for (const object of objects) {
    if (object.type !== "sphere") continue;
    const hit = sphereRayIntersection(origin, direction, object.origin, object.radius);
    if (!hit) continue;
    if (!best || hit.t < best.t) best = { ...hit, object };
  }
  return best;
}

test("a crowd of spheres agrees with the direct ray", () => {
  const objects = [];
  for (let i = 0; i < 40; i++) objects.push(sphere((i % 8) * 12, Math.floor(i / 8) * 12, 0));
  const origin = [0, 0, -30];
  const direction = [0, 0, 1];
  const hit = cast(origin, direction, objects);
  const linear = linearClosest(origin, direction, objects);
  assert.ok(linear);
  assert.equal(hit.object, linear.object);
  assert.ok(Math.abs(hit.t - linear.t) < 1e-6);
  const blocked = cast([0, 0, -30], [0, 0, 1], objects);
  assert.equal(blocked.object.type, "sphere");
  const front = { type: "box", min: [-2, -2, -20], max: [2, 2, -10], color: [0, 1, 0, 1] };
  const withBox = objects.concat(front);
  const boxed = cast([0, 0, -30], [0, 0, 1], withBox);
  assert.equal(boxed.object, front);
});

test("a ray that starts against a body still hits it", () => {
  const body = sphere(0, 0, 1, 1);
  const hit = cast([0, 0, -0.001], [0, 0, 1], [body]);
  assert.equal(hit.object, body);
  assert.ok(hit.t > 0 && hit.t < 0.02, hit.t);
  const crowd = [body];
  for (let i = 0; i < 40; i++) crowd.push(sphere(100 + i * 20, 80, 40));
  const near = cast([0, 0, -0.001], [0, 0, 1], crowd);
  assert.equal(near.object, body);
  assert.ok(near.t > 0 && near.t < 0.02);
});

test("analytic shapes hit and miss where the formula says", () => {
  const plane = { type: "shape", kind: "plane", a: [0, 0, 0], b: [0, 0, 1], color: [1, 1, 1, 1] };
  const disk = { type: "shape", kind: "disk", a: [0, 0, 0], b: [0, 0, 1], r: 2, color: [1, 0.4, 0, 1] };
  const solid = { type: "shape", kind: "box", a: [10, 0, 0], b: [1, 1, 1], color: [0, 1, 0, 1] };
  const capsule = { type: "shape", kind: "capsule", a: [0, 0, 0], b: [0, 0, 4], r: 0.5, color: [0, 1, 1, 1] };
  const cylinder = { type: "shape", kind: "cylinder", a: [0, 0, 0], b: [0, 0, 4], r: 0.5, color: [0.5, 0, 1, 1] };
  const triangle = { type: "shape", kind: "triangle", a: [0, 0, 0], b: [2, 0, 0], c: [0, 2, 0], color: [1, 1, 0.8, 1] };
  assert.ok(shapeHit([0, 0, 5], [0, 0, -1], plane).t > 4);
  assert.equal(shapeHit([5, 0, 5], [0, 0, -1], disk), null);
  assert.ok(shapeHit([0, 0, 5], [0, 0, -1], disk));
  const boxHit = cast([10, 0, -5], [0, 0, 1], [solid]);
  assert.equal(boxHit.object, solid);
  assert.ok(cast([0.2, 0, -2], [0, 0, 1], [capsule]).object === capsule);
  assert.ok(cast([0.2, 0, -2], [0, 0, 1], [cylinder]).object === cylinder);
  const tri = cast([0.4, 0.4, 2], [0, 0, -1], [triangle]);
  assert.equal(tri.object, triangle);
  assert.ok(Math.abs(tri.normal[2]) > 0.9);
  const scene = createShapes();
  const ground = cast([0, -120, 0], [0, 1, 0], scene.shapes);
  assert.equal(ground.object.kind, "plane");
});

test("a field of shapes agrees with the direct ray, and a tight clump still packs", () => {
  const objects = [];
  for (let i = 0; i < 40; i++) {
    const x = (i % 8) * 6;
    const y = Math.floor(i / 8) * 6;
    objects.push({
      type: "shape",
      kind: "capsule",
      a: [x, y, 0],
      b: [x, y, 1.2],
      r: 0.3,
      origin: [x, y, 0.6],
      radius: 0.9,
      color: [1, 0, 0, 1],
    });
  }
  objects.push({ type: "shape", kind: "plane", a: [0, 0, -1], b: [0, 0, 1], color: [0, 1, 0, 1] });
  const linear = (origin, direction) => {
    let best = null;
    for (const object of objects) {
      const found = shapeHit(origin, direction, object);
      if (found && (!best || found.t < best.t)) best = found;
    }
    return best;
  };
  const behind = cast([1, 1, -4], [0, 0, 1], objects);
  assert.equal(behind.object, linear([1, 1, -4], [0, 0, 1]).object);
  assert.equal(behind.object.kind, "plane");
  const aimed = [objects[0].origin[0], objects[0].origin[1], 4];
  const body = cast(aimed, [0, 0, -1], objects);
  const direct = linear(aimed, [0, 0, -1]);
  assert.equal(body.object.kind, "capsule");
  assert.equal(body.object, direct.object);
  assert.ok(Math.abs(body.t - direct.t) < 1e-6);
  const gap = cast([3, 3, 4], [0, 0, -1], objects);
  assert.equal(gap.object, linear([3, 3, 4], [0, 0, -1]).object);
  const clump = [];
  for (let i = 0; i < 12; i++) {
    clump.push({
      type: "shape",
      kind: "capsule",
      a: [i * 0.02, 0, 0],
      b: [i * 0.02, 0.15, 0.4],
      r: 0.02,
      origin: [i * 0.02, 0.07, 0.2],
      radius: 0.25,
      color: [1, 1, 1, 1],
    });
  }
  assert.ok(packShapeTree(clump) > 0);
});

test("spread spheres pack, a tight clump does not", () => {
  const spread = new Float32Array(40 * 4);
  for (let i = 0; i < 40; i++) {
    spread[i * 4] = (i % 8) * 30;
    spread[i * 4 + 1] = Math.floor(i / 8) * 30;
    spread[i * 4 + 3] = 1;
  }
  assert.equal(packGpuNodes(spread, 40), true);
  const clump = new Float32Array(9 * 4);
  for (let i = 0; i < 9; i++) clump[i * 4 + 3] = 0.2;
  assert.equal(packGpuNodes(clump, 9), false);
});

test("like charges move apart and a heavy clump still pulls", () => {
  const left = new Mass(1, [255, 0, 0, 255], [-5, 0, 0]);
  const right = new Mass(1, [0, 0, 255, 255], [5, 0, 0]);
  left.charge = 1;
  right.charge = 1;
  left.size = 0.2;
  right.size = 0.2;
  const pair = createUniverse([left, right], { ticksPerStep: 30, gravityConstant: 0, coulombConstant: 50 });
  tick(pair);
  assert.ok(left.velocity[0] < 0);
  assert.ok(right.velocity[0] > 0);

  const probe = new Mass(1, [255, 255, 255, 255], [-40, 0, 0]);
  probe.size = 0.2;
  const bodies = [probe];
  for (let i = 0; i < 999; i++) {
    const body = new Mass(1, [200, 200, 200, 255], [0, (i % 30) * 0.01, Math.floor(i / 30) * 0.01]);
    body.size = 0.05;
    bodies.push(body);
  }
  const crowd = createUniverse(bodies, { ticksPerStep: 30, gravityConstant: 1, coulombConstant: 0 });
  tick(crowd);
  assert.ok(probe.velocity[0] > 0);
  assert.ok(Number.isFinite(probe.velocity[0]));
});

test("the 1500-body disk takes a step without a NaN", () => {
  const state = createCrowd();
  assert.equal(state.universe.length, 1500);
  tick(state);
  for (const body of state.universe) {
    assert.ok(Number.isFinite(body.position[0] + body.velocity[0] + body.gravity[0]));
  }
});

test("a held frame still sees a sphere in a crowd", () => {
  const objects = [];
  for (let i = 0; i < 36; i++) objects.push(sphere((i % 6) * 8 - 20, Math.floor(i / 6) * 8 - 20, 0, 1.2));
  const pixels = paintFrame({
    camera: { origin: [0, 0, -12], dir: [0, 0, 1], up: [0, 1, 0], fov: 60, aspect: 1, planeDistance: 1 },
    objects,
    miss: [0, 0, 0, 1],
  }, 8, 8);
  let lit = 0;
  for (let i = 0; i < pixels.length; i += 4) if (pixels[i] > 0) lit += 1;
  assert.ok(lit > 0);
});
