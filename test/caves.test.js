import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { Crust } from "../src/sim/crust.js";
import { MOUNTAIN } from "../src/sim/land.js";
import { baseDune, blockedAt, duneHeight, inCave, standAt, standHeight, under, volcano } from "../src/sim/life.js";
import { VOLCANO, lavaAt } from "../src/sim/volcano.js";
import { GEMS, MAGMA, bakeUnder, castleAir, castleSDF, caveAt, cavesLevel, solidAt, underDigest, underView } from "../src/sim/under.js";
import { ATLAS_H, ATLAS_W, GEM_U0, LAVA_U0, underAtlas, underGlsl } from "../src/render/caves.js";

const world = under();
const SPAWNISH = [[0, -150], [5, -150], [-20, -156], [0, -125], [36, -96], [0, 10]];

// Walk a route in 20 cm steps the way the player does: stand on standAt, never inside rock.
function walk(route, z0) {
  let [x, y] = [route[0].x ?? route[0][0], route[0].y ?? route[0][1]];
  let z = z0 ?? duneHeight(x, y);
  let up = 0;
  let blocked = 0;
  for (const p of route.slice(1)) {
    const px = p.x ?? p[0];
    const py = p.y ?? p[1];
    const steps = Math.max(1, Math.ceil(Math.hypot(px - x, py - y) / 0.2));
    for (let k = 1; k <= steps; k += 1) {
      const nx = x + ((px - x) * k) / steps;
      const ny = y + ((py - y) * k) / steps;
      const g = standAt(nx, ny, z);
      if (blockedAt(nx, ny, g)) blocked += 1;
      up = Math.max(up, g - z);
      z = g;
    }
    x = px;
    y = py;
  }
  return { up, blocked, x, y, z };
}

test("the castle and caves bake the same every time from the seed, and differently for another seed", () => {
  const again = bakeUnder(duneHeight, volcano(), "atoll-slice-1");
  assert.equal(underDigest(again), underDigest(world));
  const fresh = bakeUnder((x, y) => duneHeight(x, y), volcano(), "atoll-slice-1");
  assert.equal(underDigest(fresh), underDigest(world));
  assert.equal(fresh.gem.spikes.length, world.gem.spikes.length);
  const other = bakeUnder((x, y) => duneHeight(x, y), volcano(), "another-world");
  assert.notEqual(underDigest(other), underDigest(world));
});

test("the ice castle stands on the mountain's summit: solid walls, an open courtyard, a passable gate", () => {
  const c = world.castle;
  assert.ok(Math.hypot(c.x - MOUNTAIN.x, c.y - MOUNTAIN.y) < 16, "near the peak");
  assert.ok(c.summit > MOUNTAIN.height * 0.9, `summit ${c.summit}`);
  assert.ok(c.z < c.summit && c.z > c.summit - 3, "the floor sits just under the summit");
  // Walls, towers and spires are ice; the courtyard is air over a snow floor.
  assert.equal(castleSDF(c, c.x + c.half - 0.5, c.y, c.z + 3).kind, 1);
  assert.ok(castleSDF(c, c.x + c.half - 0.5, c.y, c.z + 3).d < 0);
  assert.ok(castleSDF(c, c.x + c.half, c.y + c.half, c.z + c.towerH + 2).d < 0, "a spire over the corner tower");
  assert.equal(castleSDF(c, c.x + c.half, c.y + c.half, c.z + c.towerH + 2).kind, 2);
  assert.equal(solidAt(world, duneHeight, c.x, c.y + 3, c.z + 1), false);
  assert.equal(solidAt(world, duneHeight, c.x, c.y + 3, c.z - 0.2), true);
  assert.equal(solidAt(world, duneHeight, c.x + c.half - 0.5, c.y, c.z + 1), true);
  assert.ok(castleAir(c, c.x, c.y + c.half - 0.2, c.z + 1), "the gate passage is open");
  // Battlements: merlons on alternate meters.
  const wallTop = (s) => castleSDF(c, c.x + s, c.y + c.half - 0.7, c.z + c.wallH + 0.5).d < 0;
  assert.notEqual(wallTop(3.5), wallTop(4.5));
  // From below the ramp, up through the gate, into the courtyard: walkable, never in the ice.
  const route = [[c.x + 5, c.y + 37], [c.x, c.y + c.half + c.rampL + 1], [c.x, c.y + c.half + 0.5], [c.x, c.y + 3], [c.x + 6, c.y + 3]];
  const w = walk(route);
  assert.equal(w.blocked, 0);
  assert.ok(w.up < 0.5, `step ${w.up}`);
  assert.ok(Math.abs(w.z - c.z) < 0.05, `stands on the courtyard floor ${w.z}`);
  // The walls stop a body; the ?look=castle stand is dry ground facing the castle.
  assert.equal(blockedAt(c.x + c.half - 0.5, c.y, c.z), true);
  assert.equal(blockedAt(c.x, c.y, c.z), false);
  const v = underView(world, "castle");
  assert.ok(Math.abs(Math.atan2(c.x - v.x, c.y - v.y) - v.yaw) < 1e-9);
});

test("each cave's entrance opens to the sky and walks through to its deepest room", () => {
  for (const sys of world.caves) {
    const m = sys.entrance.mouth;
    const cell = caveAt(sys, m.x, m.y);
    assert.ok(cell.ceil > duneHeight(m.x, m.y) + 1, `${sys.name} mouth open to the sky`);
    const w = walk(sys.route);
    assert.equal(w.blocked, 0, `${sys.name} never walks into rock`);
    assert.ok(w.up < 0.5, `${sys.name} step ${w.up}`);
    assert.ok(inCave(w.x, w.y, w.z), `${sys.name} ends under the roof`);
    assert.ok(Math.abs(w.z - sys.entrance.deep.z) < 0.6, `${sys.name} ends on the deep floor ${w.z}`);
    // Underground the hill above is rock, and it has a roof away from the mouth.
    const d = sys.entrance.deep;
    assert.equal(solidAt(world, duneHeight, d.x, d.y, d.z + 1), false);
    assert.equal(solidAt(world, duneHeight, d.x, d.y, duneHeight(d.x, d.y) - 0.5), true);
  }
});

test("the gem caverns: stalactites hang, stalagmites rise, columns join; all four gems glow", () => {
  const gem = world.gem;
  const kinds = { stalactite: 0, stalagmite: 0, column: 0 };
  for (const s of gem.spikes) kinds[s.kind] += 1;
  assert.ok(kinds.stalactite >= 8 && kinds.stalagmite >= 8 && kinds.column >= 4, JSON.stringify(kinds));
  for (const s of gem.spikes) {
    const at = caveAt(gem, s.x, s.y);
    const near = Math.min(...gem.route.map((p) => Math.hypot((p.x ?? p[0]) - s.x, (p.y ?? p[1]) - s.y)));
    assert.ok(near > 1.0, `kept off the walkway (${near.toFixed(2)})`);
    if (s.kind === "column") assert.ok(at.ceil - at.floor < 0.35, "a column closes floor to ceiling");
    if (s.kind === "stalactite") assert.ok(at.ceil < s.top - s.len * 0.5, "hangs down from the ceiling");
    if (s.kind === "stalagmite") assert.ok(at.floor > s.base + s.len * 0.5, "rises from the floor");
  }
  const seen = new Set(gem.gems.map((g) => g.kind));
  for (const k of GEMS) assert.ok(seen.has(k), k);
  for (const g of gem.gems) {
    const at = caveAt(gem, g.x, g.y);
    assert.ok(at.ceil > at.floor + 0.5, "in the air of a room");
    assert.ok(g.z < duneHeight(g.x, g.y) - 1, "under the roof");
  }
  assert.equal(world.lights.filter((l) => l.kind >= 1 && l.kind <= 4).length, gem.gems.length);
  // Away from spawn, the volcano and the mountain.
  const c = { x: gem.x0 + gem.size / 2, y: gem.y0 + gem.size / 2 };
  assert.ok(Math.hypot(c.x, c.y + 150) > 100);
  assert.ok(Math.hypot(c.x - VOLCANO.x, c.y - VOLCANO.y) > VOLCANO.radius + 100);
  assert.ok(Math.hypot(c.x - MOUNTAIN.x, c.y - MOUNTAIN.y) > MOUNTAIN.radius + 60);
});

test("the lava tubes open between the lava flows and reach a magma chamber", () => {
  const lava = world.lava;
  const field = volcano();
  for (const p of lava.route) assert.ok(lavaAt(field, p.x ?? p[0], p.y ?? p[1]) < 0.01, "no lava over the walk");
  assert.ok(lava.pools.length >= 3);
  for (const pool of lava.pools) {
    const k = Math.floor((pool.y - lava.y0) / lava.cell) * lava.n + Math.floor((pool.x - lava.x0) / lava.cell);
    assert.equal(lava.cells[k * 4 + 2], MAGMA);
  }
  assert.ok(Math.hypot(lava.entrance.deep.x - VOLCANO.x, lava.entrance.deep.y - VOLCANO.y) < VOLCANO.radius * 0.3, "under the cone");
  const view = underView(world, "lavacave");
  assert.ok(inCave(view.x, view.y, view.z));
  assert.ok(!blockedAt(view.x, view.y, view.z));
  const gemView = underView(world, "gemcave");
  assert.ok(inCave(gemView.x, gemView.y, gemView.z));
  assert.ok(!blockedAt(gemView.x, gemView.y, gemView.z));
});

test("spawn, the open island and chunk hashes are unchanged", () => {
  const a = new Crust("atoll-slice-1", "atoll-0");
  const b = new Crust("atoll-slice-1", "atoll-0");
  a.write(1, 2, -1, 250);
  b.write(1, 2, -1, 250);
  assert.deepEqual([...a.hash(0, 0, -1)], [...b.hash(0, 0, -1)]);
  for (const [x, y] of SPAWNISH) {
    assert.equal(duneHeight(x, y), baseDune(x, y));
    assert.equal(standAt(x, y, 5), standHeight(x, y, 0));
    assert.equal(blockedAt(x, y, 0), false);
    assert.equal(inCave(x, y, 0), false);
  }
});

test("?caves=0 and bots drop the heavy effects; the shader and the page are wired", () => {
  assert.equal(cavesLevel(null), 1);
  assert.equal(cavesLevel(""), 1);
  assert.equal(cavesLevel("0"), 0);
  assert.equal(cavesLevel("1"), 1);
  assert.equal(cavesLevel("x"), 1);
  assert.equal(cavesLevel(null, true), 0);
  assert.equal(cavesLevel("1", true), 1);
  const atlas = underAtlas(world, new Float32Array(320 * 320 * 4).fill(7), 320);
  assert.equal(atlas.length, ATLAS_W * ATLAS_H * 4);
  assert.equal(atlas[0], 7);
  const k = (5 * world.gem.n + 9) * 4;
  assert.equal(atlas[(5 * ATLAS_W + GEM_U0 + 9) * 4], world.gem.cells[k]);
  assert.equal(atlas[(3 * ATLAS_W + LAVA_U0 + 2) * 4 + 1], world.lava.cells[(3 * world.lava.n + 2) * 4 + 1]);
  const glsl = underGlsl(world);
  assert.match(glsl, new RegExp(`const float C_HALF = ${world.castle.half.toFixed(4)};`));
  assert.match(glsl, /float castleSDF\(vec3 w, out float kind\)/);
  assert.match(glsl, /const int CAVE_LIGHTS = \d+;/);
  const main = readFileSync(new URL("../src/app/main.js", import.meta.url), "utf8");
  assert.match(main, /cavesLevel\(params\.get\("caves"\), Boolean\(params\.get\("bot"\)\)\)/);
  assert.match(main, /underView\(under\(\), params\.get\("look"\)\)/);
  assert.match(main, /const ground = standAt\(player\.position\[0\], player\.position\[1\], player\.position\[2\]/);
  assert.match(main, /if \(blockedAt\(player\.position\[0\], player\.position\[1\]/);
  const gpu = readFileSync(new URL("../src/render/gpu.js", import.meta.url), "utf8");
  assert.match(gpu, /uniform float uCaves;/);
  assert.match(gpu, /if \(!LITE && uCaves > 0\.5\) \{\n    for \(int k = 0; k < CAVE_LIGHTS; k\+\+\)/);
  assert.match(gpu, /vec3 tr = refract\(rd, n, 1\.0 \/ 1\.31\);/);
  assert.match(gpu, /float dist = anySpan \? marchDist\(q\) : q\.z - duneHeight\(q\.xy\);/);
  const stage = readFileSync(new URL("../src/render/stage.js", import.meta.url), "utf8");
  assert.match(stage, /scene\.caves = stage\.caves \|\| null;/);
});
