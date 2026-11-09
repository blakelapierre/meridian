import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { Crust } from "../src/sim/crust.js";
import { diamondSquare, sampleField } from "../src/sim/diamond.js";
import { ISLAND_R, LAKE, LAND_TOP, MOUNTAIN, allPines, fractalAt, landFractal, northFade, bakeLand, bankPlants, fogLevel, landDigest, landView, landWater, mountainHeight } from "../src/sim/land.js";
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

test("diamond-square is reproducible from its seed, tiles, and fills [-1, 1] with fractal detail", () => {
  const a = diamondSquare(6, 1234);
  const b = diamondSquare(6, 1234);
  const c = diamondSquare(6, 1235);
  assert.equal(a.size, 65);
  assert.deepEqual([...a.cells], [...b.cells]);
  assert.notDeepEqual([...a.cells], [...c.cells]);
  let lo = Infinity;
  let hi = -Infinity;
  for (const v of a.cells) {
    lo = Math.min(lo, v);
    hi = Math.max(hi, v);
  }
  assert.equal(lo, -1);
  assert.equal(hi, 1);
  // The wrapped edge matches, so the field tiles without a seam.
  for (let k = 0; k < a.size; k += 1) {
    assert.equal(a.cells[k], a.cells[(a.size - 1) * a.size + k]);
    assert.equal(a.cells[k * a.size], a.cells[k * a.size + a.size - 1]);
  }
  assert.equal(sampleField(a, 3, 5), a.cells[5 * a.size + 3]);
  // Detail at every scale: neighbours are close, far cells differ more (a rough, not white, field).
  let near = 0;
  let far = 0;
  for (let k = 0; k < 64 * 64; k += 1) {
    const x = k % 64;
    const y = (k / 64) | 0;
    near += Math.abs(sampleField(a, x, y) - sampleField(a, x + 1, y));
    far += Math.abs(sampleField(a, x, y) - sampleField(a, x + 16, y));
  }
  assert.ok(far > near * 2, `far ${far} near ${near}`);
  // The land's field is the same object per seed, and a pure function of it.
  assert.equal(landFractal(field.seedHash), landFractal(field.seedHash));
  assert.deepEqual([...diamondSquare(9, (field.seedHash ^ 0x6d2b79f5) >>> 0, 0.56).cells.slice(0, 64)], [...landFractal(field.seedHash).cells.slice(0, 64)]);
  assert.equal(northFade(0, -150), 0);
  assert.equal(northFade(0, 20), 0);
  assert.ok(Math.abs(fractalAt(-40, 160)) <= 1);
});

test("the mountain has fractal ridges and gullies", () => {
  // Around a ring at mid height the ground rises and falls many times, not a smooth cone.
  const ring = [];
  for (let k = 0; k < 360; k += 1) {
    const a = (k / 360) * Math.PI * 2;
    ring.push(mountainHeight(MOUNTAIN.x + Math.cos(a) * MOUNTAIN.radius * 0.45, MOUNTAIN.y + Math.sin(a) * MOUNTAIN.radius * 0.45, field.seedHash));
  }
  let turns = 0;
  for (let k = 1; k < 359; k += 1) if ((ring[k] - ring[k - 1]) * (ring[k + 1] - ring[k]) < 0) turns += 1;
  assert.ok(turns >= 12, `ridges and gullies around the flank: ${turns}`);
  assert.ok(Math.max(...ring) - Math.min(...ring) > 3, "deep enough to see");
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
    assert.ok(stream[i].surface < stream[i - 1].surface, `not falling at ${i}`);
    assert.ok(stream[i].half >= stream[i - 1].half - 1e-9, `narrows at ${i}`);
  }
  // It winds around the mountain: the bearing from the peak sweeps at least 180° (it is about 260°).
  let sweep = 0;
  for (let i = 1; i < stream.length; i += 1) {
    let d = Math.atan2(stream[i].y - MOUNTAIN.y, stream[i].x - MOUNTAIN.x) - Math.atan2(stream[i - 1].y - MOUNTAIN.y, stream[i - 1].x - MOUNTAIN.x);
    d = ((((d + Math.PI) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)) - Math.PI;
    sweep += d;
  }
  assert.ok(Math.abs(sweep) >= Math.PI, `sweep ${(Math.abs(sweep) * 180) / Math.PI}°`);
  // And it bends: the heading turns both ways many times.
  let flips = 0;
  let prevTurn = 0;
  for (let i = 2; i < stream.length; i += 1) {
    const a = Math.atan2(stream[i - 1].y - stream[i - 2].y, stream[i - 1].x - stream[i - 2].x);
    const b = Math.atan2(stream[i].y - stream[i - 1].y, stream[i].x - stream[i - 1].x);
    const t = Math.sign(Math.sin(b - a) - Math.sign(sweep) * 0.02);
    if (t !== 0 && prevTurn !== 0 && t !== prevTurn) flips += 1;
    if (t !== 0) prevTurn = t;
  }
  assert.ok(flips >= 6, `meander bends ${flips}`);
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
    assert.ok(river[i].surface < river[i - 1].surface, `not falling at ${i}`);
  }
  // The river meanders: its path is clearly longer than the straight line from lake to mouth.
  const straight = Math.hypot(river.at(-1).x - river[0].x, river.at(-1).y - river[0].y);
  assert.ok(river.at(-1).s > straight * 1.12, `sinuosity ${river.at(-1).s / straight}`);
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
  assert.ok(pines.length > 200, `pines ${pines.length}`);
  let slope = 0;
  for (const p of pines) {
    assert.ok(p.y > 24, "none in the south");
    assert.equal(waterAt(p.x, p.y), null, `pine in water at ${p.x},${p.y}`);
    assert.ok(duneHeight(p.x, p.y) < MOUNTAIN.height * 0.8, "below the tree line");
    assert.ok(p.radius <= 1.65 && p.height <= 9 && p.radius + 0.6 <= 4.5 / 2 + 1e-9, "a pine fits inside its cell");
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
  assert.match(gpu, /U\("uniform1f", "uFog", scene\.fog \?\? 1\)/);
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
  assert.match(gpu, /1\.25 \+ 0\.4 \* size, 4\.2 \+ 3\.6 \* size/);
  assert.match(landSrc, /radius: 1\.25 \+ 0\.4 \* size, height: 4\.2 \+ 3\.6 \* size/);
  assert.match(gpu, /uPineSeed", \(landField\.seedHash \^ 0x9172\)/);
  assert.match(landSrc, /field\.seedHash \^ 0x9172/);
  // The march starts under the land's top, not the old 5.6 m dune cap.
  assert.ok(!/ro\.z > 5\.6/.test(gpu));
  assert.match(gpu, /LAND_TOP/);
});

test("?look=mountain stands dry facing the peak; ?look=spring wades the stream facing uphill", () => {
  for (const which of ["mountain", "spring"]) {
    const v = landView(field, which);
    assert.ok(Number.isFinite(v.yaw) && Number.isFinite(v.pitch));
  }
  assert.equal(waterAt(landView(field, "mountain").x, landView(field, "mountain").y), null);
  // The spring view stands in the shallow stream (ankle deep, below WADE) and looks up the channel.
  const brook = landView(field, "spring");
  const wet = waterAt(brook.x, brook.y);
  assert.ok(wet !== null && wet - duneHeight(brook.x, brook.y) < 0.6);
  const ahead = 6;
  assert.ok(duneHeight(brook.x + Math.sin(brook.yaw) * ahead, brook.y + Math.cos(brook.yaw) * ahead) > duneHeight(brook.x, brook.y));
  const shore = landView(field, "mountain");
  const toPeak = Math.atan2(MOUNTAIN.x - shore.x, MOUNTAIN.y - shore.y);
  assert.ok(Math.abs(toPeak - shore.yaw) < 1e-9);
  assert.ok(landWater(field, LAKE.x, LAKE.y) > 0);
  const main = readFileSync(new URL("../src/app/main.js", import.meta.url), "utf8");
  assert.match(main, /const skyEye = Math\.min\(1500, Math\.max\(0, Number\(params\.get\("sky"\)\) \|\| 0\)\);/);
  assert.match(main, /params\.get\("look"\) === "mountain" \|\| params\.get\("look"\) === "spring"/);
});
