import { decode, encode } from "../sim/cbor.js";
import { canonical } from "../sim/chain.js";
import { pubkeyHex } from "../sim/keeper.js";
import { packFrame, packetValid, signBytes, unpackFrame } from "./identity.js";

export function encodeBlock(identity, block) {
  return packFrame(11, signBytes(identity, encode(canonical(block))));
}

export function decodeBlock(frame) {
  const unpacked = unpackFrame(frame);
  if (unpacked.kind !== 11) return { ok: false, reason: "kind" };
  const packet = { bytes: unpacked.bytes, sig: unpacked.sig, pubkey: unpacked.pubkey };
  if (!packetValid(packet)) return { ok: false, reason: "sig" };
  const record = decode(packet.bytes);
  const block = {
    ...record,
    prev: record.prev instanceof Uint8Array ? record.prev : new Uint8Array(record.prev),
    state: record.state instanceof Uint8Array ? record.state : new Uint8Array(record.state),
    ops: record.ops.map((op) => ({
      ...op,
      before: op.before instanceof Uint8Array ? op.before : new Uint8Array(op.before),
    })),
  };
  if (block.miner !== pubkeyHex(packet.pubkey)) return { ok: false, reason: "miner" };
  return { ok: true, block };
}
