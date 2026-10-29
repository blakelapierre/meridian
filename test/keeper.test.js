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

test("keep counts votes, presence, and checkpoints, and the crate is capped", () => {
  const ledger = createLedger("aa");
  assert.equal(keepOf(ledger), 0);
  assert.equal(crateFor(ledger), null);
  for (let vote = 0; vote < 29; vote++) noteVote(ledger);
  assert.equal(keepOf(ledger), 29);
  assert.equal(crateFor(ledger), null);
  noteVote(ledger);
  assert.deepEqual(crateFor(ledger), { metal: 2, fiber: 1 });
  assert.deepEqual(claimCrate(ledger), { metal: 2, fiber: 1 });
  assert.equal(crateFor(ledger), null);
  notePresence(ledger, 10 * 60 * 1000);
  noteCheckpoint(ledger);
  assert.equal(keepOf(ledger), 36);
  assert.equal(claimCrate(ledger), null);
  for (let vote = 0; vote < 24; vote++) noteVote(ledger);
  assert.equal(keepOf(ledger), 60);
  assert.deepEqual(claimCrate(ledger), { metal: 2, fiber: 1 });
  assert.equal(ledger.crates, 2);
  assert.equal(bountyCents(ledger), 120);
});

test("a receipt is signed by the archive key", () => {
  const identity = createIdentity();
  const ledger = createLedger("archive");
  noteVote(ledger);
  const receipt = signReceipt(identity, ledger, 1000);
  assert.equal(receipt.body.keep, 1);
  assert.equal(receipt.body.at, 1000);
  assert.equal(packetValid({
    sig: fromHex(receipt.sig),
    bytes: encode(receipt.body),
    pubkey: fromHex(receipt.pubkey),
  }), true);
});
