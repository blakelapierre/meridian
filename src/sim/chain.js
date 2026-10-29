import { blake3 } from "@noble/hashes/blake3.js";
import { encode } from "./cbor.js";
import { Crust } from "./crust.js";
import { acceptEdit } from "./edit.js";

export const MIN_BITS = 8;
export const LIVE_BITS = 16;
export const BLOCK_WORK_SHIFT = 8;

export function hex(bytes) {
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function leadingZeros(hash) {
  let count = 0;
  for (const byte of hash) {
    if (byte === 0) {
      count += 8;
      continue;
    }
    for (let bit = 7; bit >= 0; bit -= 1) {
      if ((byte >> bit) & 1) return count;
      count += 1;
    }
  }
  return count;
}

export function canonical(block) {
  return {
    bits: block.bits,
    chunk: block.chunk,
    height: block.height,
    miner: block.miner,
    nonce: block.nonce,
    ops: block.ops.map((op) => ({
      aim: op.aim,
      before: op.before instanceof Uint8Array ? op.before : new Uint8Array(op.before),
      chunk: op.chunk,
      eye: op.eye,
      mode: op.mode,
      seq: op.seq,
      writes: op.writes,
    })),
    prev: block.prev instanceof Uint8Array ? block.prev : new Uint8Array(block.prev),
    seq: block.seq,
    state: block.state instanceof Uint8Array ? block.state : new Uint8Array(block.state),
    time: block.time,
  };
}

export function blockId(block) {
  return blake3(encode(canonical(block)));
}

export function workOf(bits) {
  return 2 ** (bits - BLOCK_WORK_SHIFT);
}

function cloneCrust(crust) {
  const copy = new Crust(crust.worldSeed, crust.cellId);
  copy.overrides = new Map(crust.overrides);
  return copy;
}

function asEdit(op) {
  return {
    eye: op.eye,
    aim: op.aim,
    chunk: op.chunk,
    before: op.before instanceof Uint8Array ? op.before : new Uint8Array(op.before),
    mode: op.mode,
    spoilRoom: op.writes.length,
    writes: op.writes.map(([i, j, k, sdf_mm]) => ({ i, j, k, sdf_mm })),
  };
}

export function applyEdits(crust, ops) {
  for (const op of ops) {
    const applied = acceptEdit(crust, asEdit(op), { certified: true });
    if (!applied.ok) return applied;
  }
  return { ok: true };
}

export function genesisBlock() {
  const crust = new Crust();
  return {
    height: 0,
    time: 0,
    bits: 0,
    nonce: 0,
    miner: "",
    prev: new Uint8Array(32),
    state: new Uint8Array(crust.hash(0, 0, 0)),
    chunk: [0, 0, 0],
    seq: 0,
    ops: [],
  };
}

export function createChain() {
  const block = genesisBlock();
  const id = blockId(block);
  const key = hex(id);
  return {
    blocks: new Map([[key, { block, id, parent: null, work: 0, total: 0 }]]),
    crusts: new Map([[key, new Crust()]]),
    tip: key,
  };
}

export function tipOf(chain) {
  return chain.blocks.get(chain.tip);
}

export function prepareBlock({ parent, crust, ops, miner, time, bits }) {
  if (!ops.length) return { ok: false, reason: "empty" };
  if (bits < MIN_BITS || bits > 24) return { ok: false, reason: "bits" };
  const chunk = ops[0].chunk;
  if (ops.some((op) => op.chunk[0] !== chunk[0] || op.chunk[1] !== chunk[1] || op.chunk[2] !== chunk[2])) {
    return { ok: false, reason: "chunk" };
  }
  let seq = parent.seq;
  for (const op of ops) {
    seq += 1;
    if (op.seq !== seq) return { ok: false, reason: "seq" };
  }
  const next = cloneCrust(crust);
  const applied = applyEdits(next, ops);
  if (!applied.ok) return applied;
  return {
    ok: true,
    crust: next,
    block: {
      height: parent.height + 1,
      time,
      bits,
      nonce: 0,
      miner,
      prev: blockId(parent),
      state: new Uint8Array(next.hash(chunk[0], chunk[1], chunk[2])),
      chunk,
      seq,
      ops,
    },
  };
}

export function mine(block, { limit = 100000 } = {}) {
  for (let step = 0; step < limit; step += 1) {
    block.nonce += 1;
    const id = blockId(block);
    if (leadingZeros(id) >= block.bits) return { block, id };
  }
  return null;
}

function sameBytes(left, right) {
  if (!left || !right || left.length !== right.length) return false;
  for (let i = 0; i < left.length; i += 1) if (left[i] !== right[i]) return false;
  return true;
}

export function acceptBlock(chain, block) {
  if (!block || block.height === 0) return { ok: false, reason: "genesis" };
  if (!block.ops?.length) return { ok: false, reason: "empty" };
  if (!block.miner) return { ok: false, reason: "miner" };
  if (block.bits < MIN_BITS || block.bits > 24) return { ok: false, reason: "bits" };
  const id = blockId(block);
  const key = hex(id);
  if (chain.blocks.has(key)) return { ok: true, duplicate: true };
  if (leadingZeros(id) < block.bits) return { ok: false, reason: "work" };
  const parent = chain.blocks.get(hex(block.prev));
  if (!parent) return { ok: false, reason: "parent" };
  if (block.height !== parent.block.height + 1) return { ok: false, reason: "height" };
  if (block.time < parent.block.time) return { ok: false, reason: "time" };
  const prepared = prepareBlock({
    parent: parent.block,
    crust: chain.crusts.get(hex(block.prev)),
    ops: block.ops,
    miner: block.miner,
    time: block.time,
    bits: block.bits,
  });
  if (!prepared.ok) return prepared;
  if (!sameBytes(prepared.block.state, block.state instanceof Uint8Array ? block.state : new Uint8Array(block.state))) {
    return { ok: false, reason: "state" };
  }
  if (prepared.block.seq !== block.seq) return { ok: false, reason: "seq" };
  const work = workOf(block.bits);
  chain.blocks.set(key, { block, id, parent: hex(block.prev), work, total: parent.total + work });
  chain.crusts.set(key, prepared.crust);
  const tip = chain.blocks.get(chain.tip);
  const node = chain.blocks.get(key);
  if (node.total > tip.total || (node.total === tip.total && key < chain.tip)) chain.tip = key;
  return { ok: true, tip: chain.tip === key };
}

export function blocksByMiner(chain, miner) {
  let count = 0;
  let cursor = chain.tip;
  while (cursor) {
    const node = chain.blocks.get(cursor);
    if (!node || node.block.height === 0) break;
    if (node.block.miner === miner) count += 1;
    cursor = node.parent;
  }
  return count;
}

export function coveredWrites(chain) {
  const keys = new Set();
  let cursor = chain.tip;
  while (cursor) {
    const node = chain.blocks.get(cursor);
    if (!node || node.block.height === 0) break;
    for (const op of node.block.ops) {
      for (const write of op.writes) keys.add(`${write[0]},${write[1]},${write[2]}`);
    }
    cursor = node.parent;
  }
  return keys;
}

export function chainEdits(chain, edits) {
  const covered = coveredWrites(chain);
  const next = [];
  let seq = tipOf(chain).block.seq;
  for (const edit of edits) {
    const fresh = edit.writes.every((write) => !covered.has(`${write[0]},${write[1]},${write[2]}`));
    if (!fresh) continue;
    seq += 1;
    next.push({ ...edit, seq });
    for (const write of edit.writes) covered.add(`${write[0]},${write[1]},${write[2]}`);
  }
  return next;
}

export function installTip(crust, chain, fromChain, ownKeys = new Set()) {
  const tip = chain.crusts.get(chain.tip);
  const kept = new Map();
  for (const [key, sample] of crust.overrides) {
    if (!fromChain.has(key) || ownKeys.has(key)) kept.set(key, sample);
  }
  for (const key of fromChain) {
    if (!tip.overrides.has(key) && !ownKeys.has(key)) crust.overrides.delete(key);
  }
  fromChain.clear();
  for (const [key, sample] of tip.overrides) {
    crust.overrides.set(key, sample);
    fromChain.add(key);
  }
  for (const [key, sample] of kept) {
    if (!fromChain.has(key)) crust.overrides.set(key, sample);
  }
  return tipOf(chain).block;
}
