import { hashes, sign, verify } from "@noble/ed25519";
import { blake3 } from "@noble/hashes/blake3.js";
import { sha512 } from "@noble/hashes/sha2.js";
import { decode, encode } from "./cbor.js";
import { Crust } from "./crust.js";
import { acceptEdit } from "./edit.js";

hashes.sha512 = sha512;

function same(a, b) {
  if (!a || !b || a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

function compareBytes(a, b) {
  const count = Math.min(a.length, b.length);
  for (let i = 0; i < count; i++) if (a[i] !== b[i]) return a[i] - b[i];
  return a.length - b.length;
}

export function createLog(worldSeed, cellId) {
  return { crust: new Crust(worldSeed, cellId), seq: 0, ops: [] };
}

export function terrainBody(edit) {
  return {
    t: "TerrainEdit",
    cell: edit.cell,
    chunk: edit.chunk,
    before: edit.before instanceof Uint8Array ? edit.before : new Uint8Array(edit.before),
    mode: edit.mode,
    eye: edit.eye,
    aim: edit.aim,
    writes: edit.writes.map((write) => [write.i, write.j, write.k, write.sdf_mm]),
  };
}

export function signProposal(identity, { cell, nonce, body }) {
  const bytes = encode({ proposer: identity.pubkey, cell, nonce, body });
  return { bytes, sig: sign(bytes, identity.secret), pubkey: identity.pubkey };
}

export function signVote(identity, seq, accept) {
  const bytes = encode({ seq, accept: accept ? 1 : 0 });
  return { bytes, sig: sign(bytes, identity.secret), pubkey: identity.pubkey, accept: Boolean(accept) };
}

export function sealOp({ leader, proposal, seq, tick, solo = false, votes = [] }) {
  const commit = encode({
    cell: decode(proposal.bytes).cell,
    seq,
    phash: blake3(proposal.bytes),
    tick,
    solo: solo ? 1 : 0,
  });
  return {
    seq,
    proposal: proposal.bytes,
    proposalSig: proposal.sig,
    proposer: proposal.pubkey,
    commit,
    commitSig: sign(commit, leader.secret),
    leader: leader.pubkey,
    votes,
  };
}

function votesFor(op, seq) {
  const seen = new Set();
  let accepts = 0;
  for (const vote of op.votes || []) {
    const id = [...vote.pubkey].map((byte) => byte.toString(16).padStart(2, "0")).join("");
    if (seen.has(id) || !verify(vote.sig, vote.bytes, vote.pubkey)) continue;
    seen.add(id);
    const body = decode(vote.bytes);
    if (body.seq !== seq) continue;
    if (body.accept === 1) accepts += 1;
  }
  return accepts;
}

export function inspect(op) {
  if (!verify(op.proposalSig, op.proposal, op.proposer)) return null;
  if (!verify(op.commitSig, op.commit, op.leader)) return null;
  const commit = decode(op.commit);
  const proposal = decode(op.proposal);
  if (commit.seq !== op.seq || !same(commit.phash, blake3(op.proposal))) return null;
  return { commit, proposal, accepts: votesFor(op, commit.seq), solo: commit.solo === 1 };
}

export function certComplete(op, quorum) {
  const open = inspect(op);
  if (!open) return false;
  if (quorum <= 1) return open.solo;
  return !open.solo && open.accepts >= 1;
}

function asEdit(proposal) {
  const body = proposal.body;
  return {
    eye: body.eye,
    aim: body.aim,
    chunk: body.chunk,
    before: body.before,
    mode: body.mode,
    spoilRoom: body.writes.length,
    writes: body.writes.map(([i, j, k, sdf_mm]) => ({ i, j, k, sdf_mm })),
  };
}

export function appendOp(log, op, quorum) {
  if (!certComplete(op, quorum)) return { ok: false, reason: "cert" };
  const open = inspect(op);
  if (open.commit.seq !== log.seq + 1) return { ok: false, reason: "seq" };
  const applied = acceptEdit(log.crust, asEdit(open.proposal), { certified: true });
  if (!applied.ok) return applied;
  log.seq = open.commit.seq;
  log.ops.push(op);
  return { ok: true };
}

export function signCheckpoint(identity, log, { cell, chunk, solo, archives = 0 }) {
  const hash = new Uint8Array(log.crust.hash(chunk[0], chunk[1], chunk[2]));
  const bytes = encode({ cell, seq: log.seq, chunk, hash, solo: solo ? 1 : 0 });
  return {
    bytes,
    sig: sign(bytes, identity.secret),
    pubkey: identity.pubkey,
    seq: log.seq,
    chunk,
    hash,
    solo: Boolean(solo),
    archives,
  };
}

export function catchUp(checkpoint, ops, worldSeed, cellId) {
  if (!verify(checkpoint.sig, checkpoint.bytes, checkpoint.pubkey)) return { ok: false, reason: "sig" };
  const claimed = decode(checkpoint.bytes);
  if (claimed.seq !== checkpoint.seq || !same(claimed.hash, checkpoint.hash)) return { ok: false, reason: "sig" };
  const log = createLog(worldSeed, cellId);
  const ordered = [...ops].sort((a, b) => a.seq - b.seq);
  for (const op of ordered) {
    if (op.seq > claimed.seq) continue;
    const applied = appendOp(log, op, inspect(op)?.solo ? 1 : 3);
    if (!applied.ok) return applied;
  }
  if (log.seq !== claimed.seq) return { ok: false, reason: "seq" };
  const hash = log.crust.hash(claimed.chunk[0], claimed.chunk[1], claimed.chunk[2]);
  if (!same(hash, claimed.hash)) return { ok: false, reason: "hash" };
  for (const op of ordered) {
    if (op.seq <= claimed.seq) continue;
    const applied = appendOp(log, op, inspect(op)?.solo ? 1 : 3);
    if (!applied.ok) return applied;
  }
  return { ok: true, crust: log.crust, seq: log.seq };
}

export function chooseFork(left, right) {
  const full = (chain) => !chain.checkpoint.solo;
  if (full(left) !== full(right)) return full(left) ? left : right;
  if (full(left) && left.checkpoint.seq !== right.checkpoint.seq) {
    return left.checkpoint.seq > right.checkpoint.seq ? left : right;
  }
  const archives = (left.checkpoint.archives || 0) - (right.checkpoint.archives || 0);
  if (archives !== 0) return archives > 0 ? left : right;
  return compareBytes(left.checkpoint.hash, right.checkpoint.hash) <= 0 ? left : right;
}
