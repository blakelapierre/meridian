import assert from "node:assert/strict";
import test from "node:test";
import { encode } from "../src/sim/cbor.js";
import { createIdentity, packetValid } from "../src/net/identity.js";
import { signReceipt } from "../src/net/receipt.js";
import {
  bountyCents,
  claimCrate,
  crateFor,
  createLedger,
  keepOf,
  noteCheckpoint,
  notePresence,
  noteVote,
} from "../src/sim/keeper.js";

function fromHex(hex) {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) bytes[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return bytes;
}

test("keep is paid for blocks on the chain, and the crate stays capped", () => {
  const ledger = createLedger("aa");
  assert.equal(keepOf(ledger), 0);
  assert.equal(crateFor(ledger), null);
  noteVote(ledger);
  notePresence(ledger, 10 * 60 * 1000);
  noteCheckpoint(ledger);
  assert.equal(keepOf(ledger), 0);
  ledger.blocks = 2;
  assert.equal(keepOf(ledger), 20);
  assert.equal(crateFor(ledger), null);
  ledger.blocks = 3;
  assert.deepEqual(crateFor(ledger), { metal: 2, fiber: 1 });
  assert.deepEqual(claimCrate(ledger), { metal: 2, fiber: 1 });
  assert.equal(crateFor(ledger), null);
  ledger.blocks = 6;
  assert.equal(keepOf(ledger), 60);
  assert.deepEqual(claimCrate(ledger), { metal: 2, fiber: 1 });
  assert.equal(ledger.crates, 2);
  assert.equal(bountyCents(ledger), 120);
});

test("a receipt is signed by the archive key", () => {
  const identity = createIdentity();
  const ledger = createLedger("archive");
  ledger.blocks = 1;
  const receipt = signReceipt(identity, ledger, 1000);
  assert.equal(receipt.body.keep, 10);
  assert.equal(receipt.body.at, 1000);
  assert.equal(packetValid({
    sig: fromHex(receipt.sig),
    bytes: encode(receipt.body),
    pubkey: fromHex(receipt.pubkey),
  }), true);
});
