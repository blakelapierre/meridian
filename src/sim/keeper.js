export const BLOCK_KEEP = 10;
export const CRATE_KEEP = 30;
export const CRATE = { metal: 2, fiber: 1 };
export const BOUNTY_CENTS_PER_KEEP = 2;
export const BOUNTY_CAP_CENTS = 4000;

export function bountyCents(ledger) {
  return Math.min(BOUNTY_CAP_CENTS, keepOf(ledger) * BOUNTY_CENTS_PER_KEEP);
}

export function pubkeyHex(pubkey) {
  return [...pubkey].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function createLedger(pubkey) {
  return {
    pubkey,
    votes: 0,
    checkpoints: 0,
    presenceMs: 0,
    ops: 0,
    blocks: 0,
    height: 0,
    crates: 0,
  };
}

export function keepOf(ledger) {
  return (ledger.blocks || 0) * BLOCK_KEEP;
}

export function crateFor(ledger) {
  const earned = Math.floor(keepOf(ledger) / CRATE_KEEP);
  if (earned <= ledger.crates) return null;
  return { metal: CRATE.metal, fiber: CRATE.fiber };
}

export function claimCrate(ledger) {
  const crate = crateFor(ledger);
  if (!crate) return null;
  ledger.crates += 1;
  return crate;
}

export function receiptBody(ledger, now) {
  return {
    v: 1,
    pubkey: ledger.pubkey,
    votes: ledger.votes,
    checkpoints: ledger.checkpoints,
    presenceMs: ledger.presenceMs,
    ops: ledger.ops,
    blocks: ledger.blocks,
    height: ledger.height,
    crates: ledger.crates,
    keep: keepOf(ledger),
    at: now,
  };
}

export function noteVote(ledger) {
  ledger.votes += 1;
}

export function notePresence(ledger, ms) {
  if (ms > 0) ledger.presenceMs += ms;
}

export function noteCheckpoint(ledger) {
  ledger.checkpoints += 1;
}

export function noteOps(ledger, count) {
  ledger.ops = count;
}
