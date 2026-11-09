import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { Crust } from "../src/sim/crust.js";
import { ISLAND_R, LAKE, LAND_TOP, MOUNTAIN, allPines, bakeLand, bankPlants, fogLevel, landDigest, landView, landWater, mountainHeight } from "../src/sim/land.js";
import { WADE, bankParts, baseDune, biomeAt, duneHeight, land, standHeight, waterAt } from "../src/sim/life.js";
import { sceneFromStage } from "../src/render/stage.js";

const field = land();

test("the land bakes the same every time, and a different seed bakes a different land", () => {
  const again = bakeLand(baseDune, "atoll-slice-1", { fresh: true });
  assert.equal(landDigest(again), landDigest(field));
  assert.deepEqual(again.plan.spring, field.plan.spring);
  assert.equal(again.plan.river.length, field.plan.river.length);
  const other = bakeLand(baseDune, "another-world", { fresh: true });
  assert.notEqual(landDigest(other), landDigest(field));
});

test("the voxel crust and its chunk hashes do not change with the land", () => {
  const a = new Crust("atoll-slice-1", "atoll-0");
  const b = new Crust("atoll-slice-1", "atoll-0");
  a.write(1, 2, -1, 250);
  b.write(1, 2, -1, 250);
  assert.deepEqual([...a.hash(0, 0, -1)], [...b.hash(0, 0, -1)]);
  // The dunes south of the land are the old dunes, so spawn and the yard stand where they did.
  for (const [x, y] of [[0, -150], [5, -150], [-20, -156], [0, -125], [36, -96], [0, 10]]) {
    assert.equal(duneHeight(x, y), baseDune(x, y));
    assert.equal(standHeight(x, y, 0), baseDune(x, y));
    assert.equal(waterAt(x, y), null);
  }
});

test("a mountain rises in the north with a spring near the top", () => {
  const peak = duneHeight(MOUNTAIN.x, MOUNTAIN.y);
  assert.ok(peak > MOUNTAIN.height * 0.85, `peak ${peak}`);
  assert.ok(peak < LAND_TOP - 8, `peak ${peak} leaves room for a pine under LAND_TOP`);
  assert.equal(biomeAt(MOUNTAIN.x, MOUNTAIN.y), "summit");
  const spring = field.plan.spring;
  assert.ok(spring.z > MOUNTAIN.height * 0.8, `spring at ${spring.z}`);
  assert.ok(Math.hypot(spring.x - MOUNTAIN.x, spring.y - MOUNTAIN.y) < MOUNTAIN.radius * 0.25);
  assert.ok(waterAt(spring.x, spring.y) != null, "the spring holds water");
  assert.equal(mountainHeight(0, -150), 0);
});

test("the stream runs from the spring down into the lake, never uphill, and widens", () => {
  const stream = field.plan.stream;
  assert.ok(stream.length > 20);
  assert.ok(Math.hypot(stream[0].x - field.plan.spring.x, stream[0].y - field.plan.spring.y) < 0.01);
  for (let i = 1; i < stream.length; i += 1) {
    assert.ok(Math.hypot(stream[i].x - stream[i - 1].x, stream[i].y - stream[i - 1].y) < 2.5, `gap at ${i}`);
    assert.ok(stream[i].surface <= stream[i - 1].surface + 1e-9, `uphill at ${i}`);
    assert.ok(stream[i].half >= stream[i - 1].half - 1e-9, `narrows at ${i}`);
  }
  assert.ok(stream[0].half <= 0.6, "starts as a small stream");
  assert.ok(stream.at(-1).half > stream[0].half * 3, "and widens");
  const end = stream.at(-1);
  assert.ok(Math.hypot(end.x - LAKE.x, end.y - LAKE.y) < LAKE.radius, "ends in the lake");
  assert.ok(Math.abs(end.surface - LAKE.level) < 0.05, "meets the lake at its level");
  let wet = 0;
  for (const v of stream) if (waterAt(v.x, v.y) != null) wet += 1;
  assert.ok(wet / stream.length > 0.95, `water along the stream: ${wet}/${stream.length}`);
});

test("a small lake sits at the foot, deep enough to wade, shallow enough to stand", () => {
  const w = waterAt(LAKE.x, LAKE.y);
  assert.ok(w != null && Math.abs(w - LAKE.level) < 0.02, `lake surface ${w}`);
  assert.ok(w - duneHeight(LAKE.x, LAKE.y) > 1, "deep in the middle");
  let cells = 0;
  for (let x = LAKE.x - 25; x <= LAKE.x + 25; x += 1) {
    for (let y = LAKE.y - 25; y <= LAKE.y + 25; y += 1) if (Math.abs((waterAt(x, y) ?? -9) - LAKE.level) < 0.02) cells += 1;
  }
  assert.ok(cells > Math.PI * LAKE.radius ** 2 * 0.6, `lake area ${cells} m²`);
  assert.equal(biomeAt(LAKE.x, LAKE.y), "lake");
  assert.ok(standHeight(LAKE.x, LAKE.y) >= w - WADE - 1e-6, "deep water floats you");
});

test("the river leaves the lake and reaches the sea, falling all the way", () => {
  const river = field.plan.river;
  assert.ok(Math.hypot(river[0].x - LAKE.x, river[0].y - LAKE.y) < LAKE.radius, "starts in the lake");
  assert.ok(river[0].surface <= LAKE.level);
  for (let i = 1; i < river.length; i += 1) {
    assert.ok(Math.hypot(river[i].x - river[i - 1].x, river[i].y - river[i - 1].y) < 2.5, `gap at ${i}`);
    assert.ok(river[i].surface <= river[i - 1].surface + 1e-9, `uphill at ${i}`);
  }
  const mouth = river.at(-1);
  assert.ok(Math.hypot(mouth.x, mouth.y) > ISLAND_R, "the mouth is past the coast, where the sea starts");
  assert.ok(mouth.surface < 0.1 && mouth.surface >= 0, `mouth at sea level: ${mouth.surface}`);
  let wet = 0;
  let inside = 0;
  for (const v of river) {
    if (Math.hypot(v.x, v.y) > ISLAND_R - 1) continue;
    inside += 1;
    if (waterAt(v.x, v.y) != null) wet += 1;
  }
  assert.ok(wet / inside > 0.95, `water along the river: ${wet}/${inside}`);
});

test("pines grow on the slopes by altitude, not in water, not at spawn; reeds and bushes line the banks", () => {
  const pines = allPines(field);
  assert.ok(pines.length > 300, `pines ${pines.length}`);
  let slope = 0;
  for (const p of pines) {
    assert.ok(p.y > 24, "none in the south");
    assert.equal(waterAt(p.x, p.y), null, `pine in water at ${p.x},${p.y}`);
    assert.ok(duneHeight(p.x, p.y) < MOUNTAIN.height * 0.8, "below the tree line");
    assert.ok(p.radius <= 1.1 && p.height <= 8.5);
    if (mountainHeight(p.x, p.y, field.seedHash) > 3) slope += 1;
  }
  assert.ok(slope / pines.length > 0.6, "most stand on the mountain");
  const high = pines.filter((p) => duneHeight(p.x, p.y) > MOUNTAIN.height * 0.4).length;
  const mid = pines.filter((p) => duneHeight(p.x, p.y) > 6 && duneHeight(p.x, p.y) <= MOUNTAIN.height * 0.4).length;
  assert.ok(mid > high, "thinner toward the tree line");
  const plants = bankPlants(field);
  assert.ok(plants.length > 40);
  assert.ok(plants.some((p) => p.kind === "reed") && plants.some((p) => p.kind === "bush"));
  for (const p of plants) {
    assert.equal(waterAt(p.x, p.y), null);
    let near = false;
    for (let a = 0; a < 16 && !near; a += 1) {
      for (const r of [1, 2, 3, 4]) if (waterAt(p.x + Math.cos(a * 0.39) * r, p.y + Math.sin(a * 0.39) * r) != null) near = true;
    }
    assert.ok(near, `bank plant at ${p.x},${p.y} is by the water`);
  }
  const view = landView(field, "mountain");
  assert.ok(bankParts([view.x, view.y, 0], 0).length > 0, "the shore view draws reeds");
  assert.equal(bankParts([0, -150, 0], 0).length, 0, "spawn draws none");
});

test("?fog= toggles the fog: 0 off, 1 default, 2 thick; bots default off; the picture gets it", () => {
  assert.equal(fogLevel(null), 1);
  assert.equal(fogLevel("0"), 0);
  assert.equal(fogLevel("1"), 1);
  assert.equal(fogLevel("2"), 2);
  assert.equal(fogLevel("9"), 2);
  assert.equal(fogLevel("x"), 1);
  assert.equal(fogLevel(null, true), 0);
  assert.equal(fogLevel("1", true), 1);
  assert.ok(field.fogBanks.length >= 4 && field.fogBanks.length <= 6);
  assert.ok(field.fogBanks.some((b) => Math.hypot(b.x - LAKE.x, b.y - LAKE.y) < 1), "one sits over the lake");
  const atoll = { worldSeed: "atoll-slice-1", cellId: "atoll-0", props: [], placements: { dummy: { x: 0, y: -14000 } } };
  const stage = { feet: [0, -150, 0], width: 16, height: 9, view: "first", self: false };
  assert.equal(sceneFromStage({ ...stage, fog: 0 }, atoll).fog, 0);
  assert.equal(sceneFromStage({ ...stage, fog: 2 }, atoll).fog, 2);
  assert.equal(sceneFromStage(stage, atoll).fog, 1);
  const gpu = readFileSync(new URL("../src/render/gpu.js", import.meta.url), "utf8");
  assert.match(gpu, /if \(uFog < 0\.5\) return color;/);
  assert.match(gpu, /gl\.uniform1f\(u\("uFog"\), scene\.fog \?\? 1\)/);
  const main = readFileSync(new URL("../src/app/main.js", import.meta.url), "utf8");
  assert.match(main, /fogLevel\(params\.get\("fog"\)/);
});

test("the shader reads the same pine rule and hash as the walk", () => {
  const gpu = readFileSync(new URL("../src/render/gpu.js", import.meta.url), "utf8");
  const landSrc = readFileSync(new URL("../src/sim/land.js", import.meta.url), "utf8");
  for (const k of ["0x27d4eb2d", "0x165667b1", "0x85ebca6b", "0xc2b2ae35"]) {
    assert.ok(gpu.includes(k) && landSrc.includes(k), k);
  }
  assert.match(gpu, /roll < landAt\(\(cell \+ 0\.5\) \* PINE_CELL\)\.b \* 0\.9/);
  assert.match(landSrc, /roll < dens \* 0\.9/);
  assert.match(gpu, /0\.85 \+ 0\.25 \* size, 4\.5 \+ 4\.0 \* size/);
  assert.match(landSrc, /radius: 0\.85 \+ 0\.25 \* size, height: 4\.5 \+ 4 \* size/);
  assert.match(gpu, /uPineSeed"\), \(landField\.seedHash \^ 0x9172\)/);
  assert.match(landSrc, /field\.seedHash \^ 0x9172/);
  // The march starts under the land's top, not the old 5.6 m dune cap.
  assert.ok(!/ro\.z > 5\.6/.test(gpu));
  assert.match(gpu, /LAND_TOP/);
});

test("?look=mountain and ?look=spring stand somewhere dry and face the landmark", () => {
  for (const which of ["mountain", "spring"]) {
    const v = landView(field, which);
    assert.equal(waterAt(v.x, v.y), null, which);
    assert.ok(Number.isFinite(v.yaw) && Number.isFinite(v.pitch));
  }
  const shore = landView(field, "mountain");
  const toPeak = Math.atan2(MOUNTAIN.x - shore.x, MOUNTAIN.y - shore.y);
  assert.ok(Math.abs(toPeak - shore.yaw) < 1e-9);
  assert.ok(landWater(field, LAKE.x, LAKE.y) > 0);
  const main = readFileSync(new URL("../src/app/main.js", import.meta.url), "utf8");
  assert.match(main, /params\.get\("look"\) === "mountain" \|\| params\.get\("look"\) === "spring"/);
});
