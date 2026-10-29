import assert from "node:assert/strict";
import test from "node:test";
import { buyOffers, loadCatalog } from "../src/sim/catalog.js";
import { buyOffer, createMatch, joinMatch, setChannel, setInside, stepMatch, strikeHit } from "../src/sim/strike.js";

const { atoll, catalog } = loadCatalog();
const line = buyOffers(catalog).find((offer) => offer.id === "line");
const smoke = buyOffers(catalog).find((offer) => offer.id === "smoke");

function beach() {
  return { metal: 30, items: ["bit"] };
}

test("buying smoke spends scrip and does not spend metal", () => {
  const match = createMatch(atoll.contract);
  assert.equal(joinMatch(match, "s", "south", beach()), true);
  assert.equal(buyOffer(match, "s", line), false);
  assert.equal(buyOffer(match, "s", { id: "bit", scrip: 0 }), false);
  assert.equal(buyOffer(match, "s", smoke), true);
  const player = match.roster.get("s");
  assert.equal(player.scrip, 500);
  assert.equal(player.beach.metal, 30);
  assert.deepEqual(player.beach.items, ["bit"]);
  for (let i = 0; i < 5; i++) assert.equal(joinMatch(match, `n${i}`, "north", beach()), true);
  assert.equal(joinMatch(match, "n6", "north", beach()), false);
});

test("planting and winning a round pays scrip", () => {
  const match = createMatch(atoll.contract);
  joinMatch(match, "s", "south", beach());
  joinMatch(match, "n", "north", beach());
  stepMatch(match, atoll.contract.buySec * 30);
  assert.equal(match.phase, "live");
  assert.equal(buyOffer(match, "s", smoke), false);
  setChannel(match, "s", "plant");
  stepMatch(match, 3.5 * 30);
  assert.equal(match.core.side, "south");
  assert.equal(match.roster.get("s").scrip, 1100);
  stepMatch(match, 35 * 30);
  assert.equal(match.wins.south, 1);
  assert.equal(match.roster.get("s").scrip, 4350);
  assert.equal(match.roster.get("s").beach.metal, 30);
  assert.equal(match.phase, "gap");
});

test("leaving the volume restores the beach body and does not pay", () => {
  const match = createMatch(atoll.contract);
  joinMatch(match, "s", "south", beach());
  stepMatch(match, 10);
  setInside(match, "s", false);
  stepMatch(match, 5 * 30);
  const player = match.roster.get("s");
  assert.equal(player.body, "beach");
  assert.equal(player.scrip, 800);
  assert.equal(player.beach.metal, 30);
  assert.equal(match.wins.south, 0);
  assert.deepEqual(player.beach.items, ["bit"]);
});

test("friendly fire is off and a wiped side loses the round", () => {
  const match = createMatch(atoll.contract);
  joinMatch(match, "s", "south", beach());
  joinMatch(match, "n", "north", beach());
  assert.equal(strikeHit(match, "s", "n", 28), 72);
  joinMatch(match, "s2", "south", beach());
  assert.equal(strikeHit(match, "s", "s2", 100), 100);
  assert.equal(match.roster.get("s2").alive, true);
  strikeHit(match, "s", "n", 80);
  stepMatch(match, 1);
  assert.equal(match.wins.south, 1);
  assert.equal(match.roster.get("n").scrip, 800 + 1400);
});
