import assert from "node:assert/strict";
import test from "node:test";
import { buyOffers, loadCatalog } from "../src/sim/catalog.js";
import { createEntry, entryLine, stepEntry, SMOKE } from "../src/sim/enter.js";

const { atoll, catalog } = loadCatalog();
const line = buyOffers(catalog).find((offer) => offer.id === "line");

test("the compound offers the strike, and smoke does not spend metal", () => {
  const entry = createEntry(atoll);
  const yard = { metal: 30 };
  let state = stepEntry(entry, { position: [0, -112, 0], yard });
  assert.equal(state.prompt, "");
  state = stepEntry(entry, { position: [0, -109, 0], yard });
  assert.equal(state.prompt, "atoll-skirmish");
  assert.equal(entryLine(state), "atoll-skirmish");
  state = stepEntry(entry, { position: [0, -109, 0], use: true, yard });
  assert.equal(state.side, "south");
  assert.equal(state.body, "strike");
  assert.equal(state.scrip, 800);
  assert.equal(state.phase, "buy");
  assert.equal(yard.metal, 30);
  state = stepEntry(entry, { position: [0, -109, 0], buy: true, yard, offer: line });
  assert.equal(state.notice, "short");
  assert.equal(state.scrip, 800);
  assert.equal(yard.metal, 30);
  state = stepEntry(entry, { position: [0, -109, 0], buy: true, yard, offer: SMOKE });
  assert.equal(state.notice, "smoke");
  assert.equal(state.scrip, 500);
  assert.deepEqual(state.loadout, ["smoke"]);
  assert.equal(yard.metal, 30);
  assert.match(entryLine(state), /strike south strike scrip 500 smoke buy/);
});

test("walking out for five seconds restores the beach body and pays nothing", () => {
  const entry = createEntry(atoll);
  const yard = { metal: 30 };
  stepEntry(entry, { position: [0, -109, 0], use: true, yard });
  let state = null;
  for (let tick = 0; tick < 5 * 30; tick += 1) {
    state = stepEntry(entry, { position: [0, -112, 0], yard });
  }
  assert.equal(state.body, "beach");
  assert.equal(state.scrip, 800);
  assert.equal(yard.metal, 30);
  assert.equal(entry.match.wins.south, 0);
});
