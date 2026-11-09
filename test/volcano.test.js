import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { Crust } from "../src/sim/crust.js";
import { ISLAND_R, LAKE, LAND_TOP, MOUNTAIN } from "../src/sim/land.js";
import { baseDune, biomeAt, duneHeight, eruptionAt, land, standHeight, volcano, waterAt } from "../src/sim/life.js";
import {
  BOMB_COOL, ERUPT_PERIOD, GRAVITY, LAVA_LEVEL, MAX_BOMBS, VOLCANO, ashDensity, bakeVolcano, bombsAt, burst, heatAt, heatLevel,
  inVolcano, lavaAt, volcanoClock, volcanoDelta, volcanoDigest, volcanoLevel, volcanoView,
} from "../src/sim/volcano.js";

const field = volcano();
const SPAWNISH = [[0, -150], [5, -150], [-20, -156], [0, -125], [36, -96], [0, 10]];

test("the volcano bakes the same every time from the seed, and differently for another seed", () => {
  const again = bakeVolcano(baseDune, "atoll-slice-1", { fresh: true });
  assert.equal(volcanoDigest(again), volcanoDigest(field));
  assert.deepEqual(again.flows, field.flows);
  const other = bakeVolcano(baseDune, "another-world", { fresh: true });
  assert.notEqual(volcanoDigest(other), volcanoDigest(field));
});

test("it stands in the southwest, away from spawn, the mountain and the lake, inside the island", () => {
  const c = Math.hypot(VOLCANO.x, VOLCANO.y);
  assert.ok(c + VOLCANO.radius < ISLAND_R - 10);
  assert.ok(Math.hypot(VOLCANO.x - 0, VOLCANO.y + 150) > VOLCANO.radius + 90, "far from spawn");
  assert.ok(Math.hypot(VOLCANO.x - MOUNTAIN.x, VOLCANO.y - MOUNTAIN.y) > VOLCANO.radius + MOUNTAIN.radius);
  assert.ok(Math.hypot(VOLCANO.x - LAKE.x, VOLCANO.y - LAKE.y) > VOLCANO.radius + 100);
  const rim = Math.max(...[0, 1, 2, 3, 4, 5, 6, 7].map((k) => duneHeight(VOLCANO.x + Math.cos(k * 0.785 + 0.3) * VOLCANO.rim, VOLCANO.y + Math.sin(k * 0.785 + 0.3) * VOLCANO.rim)));
  assert.ok(rim > VOLCANO.height * 0.85 && rim < LAND_TOP - 4, `rim ${rim}`);
  // A crater: the middle is a lava lake below the rim.
  assert.ok(Math.abs(duneHeight(VOLCANO.x, VOLCANO.y) - LAVA_LEVEL) < 0.05);
  assert.ok(lavaAt(field, VOLCANO.x, VOLCANO.y) > 0.95);
  assert.equal(biomeAt(VOLCANO.x, VOLCANO.y), "lava");
});

test("rugged flanks: diamond-square ridges and gullies around the cone", () => {
  const ring = [];
  for (let k = 0; k < 96; k += 1) {
    const a = (k / 96) * Math.PI * 2;
    ring.push(duneHeight(VOLCANO.x + Math.cos(a) * VOLCANO.radius * 0.45, VOLCANO.y + Math.sin(a) * VOLCANO.radius * 0.45));
  }
  let turns = 0;
  for (let k = 1; k + 1 < ring.length; k += 1) if ((ring[k] - ring[k - 1]) * (ring[k + 1] - ring[k]) < 0) turns += 1;
  assert.ok(turns >= 12, `turns ${turns}`);
  assert.ok(Math.max(...ring) - Math.min(...ring) > 2.5);
});

test("spawn terrain and chunk hashes are unchanged", () => {
  const a = new Crust("atoll-slice-1", "atoll-0");
  const b = new Crust("atoll-slice-1", "atoll-0");
  a.write(1, 2, -1, 250);
  b.write(1, 2, -1, 250);
  assert.deepEqual([...a.hash(0, 0, -1)], [...b.hash(0, 0, -1)]);
  for (const [x, y] of SPAWNISH) {
    assert.equal(inVolcano(x, y), false);
    assert.equal(volcanoDelta(field, x, y), 0);
    assert.equal(duneHeight(x, y), baseDune(x, y));
    assert.equal(standHeight(x, y, 0), baseDune(x, y));
  }
  // The cone goes to nothing at its foot.
  assert.equal(volcanoDelta(field, VOLCANO.x + VOLCANO.radius + 4, VOLCANO.y), 0);
});

test("lava flows run from the crater lake strictly downhill, stay continuous, and never reach water", () => {
  const water = [...land().plan.stream, ...land().plan.river, { x: LAKE.x, y: LAKE.y }];
  assert.ok(field.flows.length >= 3);
  for (const pts of field.flows) {
    assert.ok(Math.hypot(pts[0].x - VOLCANO.x, pts[0].y - VOLCANO.y) <= VOLCANO.lakeRadius + 0.1, "starts at the lava lake");
    const end = pts[pts.length - 1];
    assert.ok(Math.hypot(end.x - VOLCANO.x, end.y - VOLCANO.y) > VOLCANO.radius * 0.7, "runs well down the flank");
    for (let i = 1; i < pts.length; i += 1) {
      assert.ok(pts[i].surface < pts[i - 1].surface, `downhill at ${i}`);
      assert.ok(Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y) <= 1.01, "continuous");
    }
    for (const p of pts) {
      assert.equal(waterAt(p.x, p.y), null);
      const nearest = Math.min(...water.map((w) => Math.hypot(w.x - p.x, w.y - p.y)));
      assert.ok(nearest > 60, `lava ${nearest} m from water`);
      assert.ok(lavaAt(field, p.x, p.y) > 0.5, "lava on its own path");
      assert.ok(Math.abs(duneHeight(p.x, p.y) - p.surface) < 0.35, "the channel is carved to the lava");
    }
  }
});

test("the eruption schedule is a pure function of the shared clock: two peers see the same bombs", async () => {
  const peer = await import("../src/sim/volcano.js?peer=b");
  const times = [];
  for (let t = 1.8e9; t < 1.8e9 + 120; t += 0.37) times.push(t);
  const mine = times.map((t) => eruptionAt(t));
  // The other peer: a separate module instance with its own caches, asked in the opposite order.
  const theirs = [...times].reverse().map((t) => peer.bombsAt(t, field.seedHash, duneHeight)).reverse();
  assert.deepEqual(theirs, mine);
  assert.deepEqual(peer.burst(300000123, field.seedHash), burst(300000123, field.seedHash));
  const flying = mine.flat().filter((b) => b.flying);
  assert.ok(flying.length > 50, "it erupts");
  for (const list of mine) assert.ok(list.length <= MAX_BOMBS);
  // Ballistic: a bomb in flight is on its parabola from the crater, and comes down on the ground.
  const e = Math.floor((1.8e9 + 40) / ERUPT_PERIOD);
  const [b] = burst(e, field.seedHash).length ? burst(e, field.seedHash) : burst(e + 1, field.seedHash);
  const t = b.t0 + 0.8;
  const seen = bombsAt(t, field.seedHash, duneHeight).find((x) => x.id === b.id);
  assert.ok(seen && seen.flying);
  assert.ok(Math.abs(seen.z - (b.z0 + b.vz * 0.8 - 0.5 * GRAVITY * 0.64)) < 1e-5);
  const later = bombsAt(b.t0 + 30, field.seedHash, duneHeight).find((x) => x.id === b.id);
  assert.equal(later, undefined, `gone after it lands and cools (${BOMB_COOL} s)`);
  // The clock: wall time, or pinned.
  assert.equal(volcanoClock(NaN, 0, 5000), 5);
  assert.equal(volcanoClock(100, 1000, 3000), 102);
});

test("the heat field is hot over lava and in the plume, and zero away from hot sources", () => {
  assert.ok(heatAt(field, VOLCANO.x, VOLCANO.y, LAVA_LEVEL + 1) > 0.6);
  assert.ok(heatAt(field, VOLCANO.x, VOLCANO.y, LAVA_LEVEL + 40) > 0.1, "the plume");
  const mid = field.flows[0][20];
  assert.ok(heatAt(field, mid.x, mid.y, mid.surface + 1) > 0.3, "over a lava flow");
  for (const [x, y] of SPAWNISH) assert.equal(heatAt(field, x, y, baseDune(x, y) + 1.7), 0);
  assert.equal(heatAt(field, MOUNTAIN.x, MOUNTAIN.y, 50), 0);
  assert.equal(heatAt(field, LAKE.x, LAKE.y, LAKE.level + 1), 0);
  // Cool flank, away from the flows and the crater.
  let cold = 0;
  for (let k = 0; k < 36; k += 1) {
    const a = (k / 36) * Math.PI * 2;
    const x = VOLCANO.x + Math.cos(a) * VOLCANO.radius * 0.9;
    const y = VOLCANO.y + Math.sin(a) * VOLCANO.radius * 0.9;
    if (heatAt(field, x, y, duneHeight(x, y) + 1.5) === 0) cold += 1;
  }
  assert.ok(cold > 20, `cold flank samples ${cold}`);
  // Ash drifts downwind only.
  assert.equal(ashDensity(0, -150, 2), 0);
  assert.ok(ashDensity(VOLCANO.x - 40, VOLCANO.y - 25, 20) > 0.1);
});

test("?volcano= and ?heat= parse; bots skip the effects", () => {
  assert.equal(volcanoLevel(null), 1);
  assert.equal(volcanoLevel(""), 1);
  assert.equal(volcanoLevel("0"), 0);
  assert.equal(volcanoLevel("1"), 1);
  assert.equal(volcanoLevel("x"), 1);
  assert.equal(volcanoLevel(null, true), 0);
  assert.equal(volcanoLevel("1", true), 1);
  assert.equal(heatLevel("0"), 0);
  assert.equal(heatLevel(null, true), 0);
  const main = readFileSync(new URL("../src/app/main.js", import.meta.url), "utf8");
  assert.match(main, /volcanoLevel\(params\.get\("volcano"\), Boolean\(params\.get\("bot"\)\)\)/);
  assert.match(main, /volcanoParam \? heatLevel\(params\.get\("heat"\)/);
  assert.match(main, /params\.get\("look"\) === "volcano" \? volcanoView\(volcano\(\)\)/);
  const gpu = readFileSync(new URL("../src/render/gpu.js", import.meta.url), "utf8");
  // The shader's plume and heat rules are the JS ones.
  assert.match(gpu, /float lean = max\(dz, 0\.0\) \* 0\.35;/);
  assert.match(gpu, /float w = 5\.0 \+ max\(dz, 0\.0\) \* 0\.22;/);
  assert.match(gpu, /h \+= V\.a \* exp\(-max\(up, 0\.0\) \/ 7\.0\)/);
  assert.match(gpu, /if \(uVolcano < 0\.5 \|\| uHeat < 0\.5\) return rd;/);
  assert.match(gpu, /rd = heatShimmer\(ro, rd\);\n  vec3 rd0 = rd;/);
});

test("?look=volcano stands dry, off the lava, facing the crater", () => {
  const v = volcanoView(field);
  assert.equal(waterAt(v.x, v.y), null);
  assert.ok(lavaAt(field, v.x, v.y) < 0.01);
  assert.ok(Math.hypot(v.x, v.y) < ISLAND_R - 10);
  assert.ok(Math.abs(Math.atan2(VOLCANO.x - v.x, VOLCANO.y - v.y) - v.yaw) < 1e-9);
});
