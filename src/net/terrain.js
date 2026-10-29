import { packFrame, signBytes, unpackFrame, packetValid } from "./identity.js";
import { decode, encode } from "../sim/cbor.js";
import { CHUNK_VOXELS, Crust, brushWrites } from "../sim/crust.js";
import { acceptEdit } from "../sim/edit.js";
import { adoptOp, createLog, sealOp, signProposal, signVote, terrainBody } from "../sim/oplog.js";

function chunkOf(write) {
  const axis = (value) => Math.floor(value / CHUNK_VOXELS);
  return [axis(write.i), axis(write.j), axis(write.k)];
}

function editOf(body) {
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

function cloneCrust(crust) {
  const copy = new Crust(crust.worldSeed, crust.cellId);
  copy.overrides = new Map(crust.overrides);
  return copy;
}

export function createTerrain({ identity, leader }) {
  const log = createLog();
  const outbound = [];
  const waiting = [];
  let nonce = 1;
  let proposed = null;
  let remote = null;
  let last = null;

  function take() {
    return outbound.splice(0);
  }

  function hex(bytes) {
    return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  }

  function remember(writes) {
    last = writes[writes.length - 1];
  }

  function seal(proposal, vote, solo) {
    const op = sealOp({
      leader: identity,
      proposal,
      seq: log.seq + 1,
      tick: log.seq + 1,
      solo,
      votes: vote ? [vote] : [],
    });
    const adopted = adoptOp(log, op, solo ? 1 : 2);
    if (!adopted.ok) return adopted;
    remember(editOf(decode(proposal.bytes).body).writes);
    if (!solo) {
      outbound.push(packFrame(3, signBytes(identity, encode({
        seq: op.seq,
        proposal: op.proposal,
        proposalSig: op.proposalSig,
        proposer: op.proposer,
        commit: op.commit,
        commitSig: op.commitSig,
        leader: op.leader,
        solo: 0,
        voteBytes: vote.bytes,
        voteSig: vote.sig,
        votePub: vote.pubkey,
      }))));
    }
    return adopted;
  }

  function dig(eye, aim, { peer }) {
    const saved = new Map(log.crust.overrides);
    const writes = brushWrites(log.crust, { eye, aim, ticks: 1 });
    if (!writes.length) return;
    const chunk = chunkOf(writes[0]);
    const budget = log.crust.budgetCm3;
    log.crust.overrides = saved;
    const before = log.crust.hash(chunk[0], chunk[1], chunk[2]);
    for (const write of writes) log.crust.write(write.i, write.j, write.k, write.sdf_mm);
    log.crust.budgetCm3 = budget;
    remember(writes);
    const proposal = signProposal(identity, {
      cell: "atoll-0",
      nonce: nonce++,
      body: terrainBody({
        cell: "atoll-0",
        eye,
        aim,
        chunk,
        before,
        mode: "dig",
        writes,
      }),
    });
    if (!peer) {
      seal(proposal, null, true);
      return;
    }
    waiting.push(proposal);
    flush();
  }

  function flush() {
    if (proposed || !waiting.length) return;
    proposed = waiting.shift();
    outbound.push(packFrame(1, proposed));
    if (leader) outbound.push(packFrame(4, signBytes(identity, encode({ seq: log.seq + 1 }))));
  }

  function receive(frameBytes) {
    const frame = unpackFrame(frameBytes);
    const packet = { bytes: frame.bytes, sig: frame.sig, pubkey: frame.pubkey };
    if (!packetValid(packet)) return { ok: false, reason: "sig" };
    if (frame.kind === 1) {
      remote = packet;
      if (leader) outbound.push(packFrame(4, signBytes(identity, encode({ seq: log.seq + 1 }))));
      return { ok: true };
    }
    if (frame.kind === 4) {
      const proposal = remote || proposed;
      if (!proposal) return { ok: false, reason: "proposal" };
      const seq = decode(frame.bytes).seq;
      const body = decode(proposal.bytes).body;
      const scratch = cloneCrust(log.crust);
      const preview = acceptEdit(scratch, editOf(body), { certified: true });
      const already = editOf(body).writes.every((write) => log.crust.sampleIndex(write.i, write.j, write.k) === write.sdf_mm);
      if (!preview.ok && !already) return preview;
      outbound.push(packFrame(2, signVote(identity, seq, true)));
      return { ok: true };
    }
    if (frame.kind === 2) {
      const proposal = remote || proposed;
      if (!leader || !proposal) return { ok: false, reason: "proposal" };
      const voteBody = decode(frame.bytes);
      if (voteBody.seq !== log.seq + 1) return { ok: false, reason: "seq" };
      const vote = { bytes: frame.bytes, sig: frame.sig, pubkey: frame.pubkey };
      const sealed = seal(proposal, vote, false);
      if (!sealed.ok) return sealed;
      if (proposal === proposed) proposed = null;
      if (proposal === remote) remote = null;
      flush();
      return sealed;
    }
    if (frame.kind === 3) {
      const record = decode(frame.bytes);
      const op = {
        seq: record.seq,
        proposal: record.proposal,
        proposalSig: record.proposalSig,
        proposer: record.proposer,
        commit: record.commit,
        commitSig: record.commitSig,
        leader: record.leader,
        votes: [{ bytes: record.voteBytes, sig: record.voteSig, pubkey: record.votePub }],
      };
      const adopted = adoptOp(log, op, record.solo ? 1 : 2);
      if (adopted.ok) {
        remember(editOf(decode(op.proposal).body).writes);
        if (proposed && sameBytes(proposed.bytes, op.proposal)) proposed = null;
        flush();
      }
      return adopted;
    }
    return { ok: false, reason: "kind" };
  }

  return {
    log,
    dig,
    receive,
    take,
    voxel: () => (last ? log.crust.sampleIndex(last.i, last.j, last.k) : null),
    write: () => last,
    hash: () => (last ? hex(log.crust.hash(...chunkOf(last))) : ""),
  };
}

function sameBytes(a, b) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}
