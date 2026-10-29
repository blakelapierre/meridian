import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { WEAPONS } from "../src/sim/damage.js";
import {
  acceptHello,
  buyOffers,
  catalogHash,
  kitMassKg,
  loadCatalog,
  spawnablePieces,
} from "../src/sim/catalog.js";

test("the buy list is strike scrip and never the bit or the hearth", () => {
  const { catalog } = loadCatalog();
  const ids = buyOffers(catalog).map((offer) => offer.id);
  assert.equal(ids.includes("bit"), false);
  assert.equal(ids.includes("hearth-stone"), false);
  assert.ok(ids.includes("line"));
  assert.ok(ids.includes("smoke"));
  assert.equal(spawnablePieces(catalog).some((piece) => piece.id === "fabber"), false);
  assert.equal(spawnablePieces(catalog).some((piece) => piece.id === "footing"), true);
});

test("a changed atoll file changes the catalog hash", () => {
  const loaded = loadCatalog();
  const atoll = readFileSync(new URL("../content/atoll.json", import.meta.url));
  const catalog = readFileSync(new URL("../content/catalog.json", import.meta.url));
  assert.equal(catalogHash([atoll, catalog]), loaded.hash);
  const tweaked = Buffer.from(atoll.toString("utf8").replace("atoll-slice-1", "atoll-slice-2"));
  assert.equal(acceptHello(loaded.hash, catalogHash([tweaked, catalog])), false);
});

test("line record matches the damage table and the first kicks are vertical", () => {
  const { catalog } = loadCatalog();
  const line = catalog.weapons.find((weapon) => weapon.id === "line");
  assert.equal(line.chest, WEAPONS.line.chest);
  assert.equal(line.headMul, WEAPONS.line.headMul);
  assert.equal(line.pen, WEAPONS.line.pen);
  for (const kick of line.recoil.slice(0, 3)) assert.ok(Math.abs(kick.pitch) > Math.abs(kick.yaw));
  assert.ok(Math.abs(line.recoil[4].yaw) > Math.abs(line.recoil[4].pitch));
  const mass = kitMassKg(catalog, { bit: 1, mallet: 1, stone: 1, metal: 30 });
  assert.ok(mass <= 25, mass);
});
