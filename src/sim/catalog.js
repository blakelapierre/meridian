import { readFileSync } from "node:fs";
import { blake3 } from "@noble/hashes/blake3.js";

const atollUrl = new URL("../../content/atoll.json", import.meta.url);
const catalogUrl = new URL("../../content/catalog.json", import.meta.url);

export function catalogHash(parts) {
  return Buffer.from(blake3(Buffer.concat(parts))).toString("hex");
}

export function loadCatalog() {
  const atollBytes = readFileSync(atollUrl);
  const catalogBytes = readFileSync(catalogUrl);
  return {
    atoll: JSON.parse(atollBytes.toString("utf8")),
    catalog: JSON.parse(catalogBytes.toString("utf8")),
    hash: catalogHash([atollBytes, catalogBytes]),
  };
}

export function acceptHello(localHash, remoteHash) {
  return localHash === remoteHash;
}

const hidden = new Set(["bit", "hearth-stone", "hearth"]);

export function buyOffers(catalog) {
  const offers = [];
  for (const weapon of catalog.weapons) {
    offers.push({ id: weapon.id, scrip: weapon.scrip, kind: "weapon" });
  }
  for (const armor of catalog.armor) {
    offers.push({ id: armor.id, scrip: armor.scrip, kind: "armor" });
  }
  for (const utility of catalog.utilities) {
    offers.push({ id: utility.id, scrip: utility.scrip, kind: "utility" });
  }
  return offers.filter((offer) => !hidden.has(offer.id));
}

export function spawnablePieces(catalog) {
  return catalog.pieces.filter((piece) => piece.enabled !== false);
}

export function kitMassKg(catalog, counts) {
  let mass = 0;
  for (const [id, n] of Object.entries(counts)) {
    const item = catalog.items.find((entry) => entry.id === id)
      || catalog.weapons.find((entry) => entry.id === id);
    mass += item.massKg * n;
  }
  return mass;
}
