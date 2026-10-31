import { packetValid, packFrame, signBytes, unpackFrame } from "./identity.js";
import { decode, encode } from "../sim/cbor.js";
import { WEAR_KIND } from "../sim/wear.js";

// One signed op carries a batch of quantized [i, j, level] triples.
export function encodeWear(identity, { nonce, cells }) {
  return packFrame(WEAR_KIND, signBytes(identity, encode({ nonce: Math.floor(nonce), cells: cells.map((v) => v | 0) })));
}

export function acceptWear(frame) {
  const unpacked = unpackFrame(frame);
  if (unpacked.kind !== WEAR_KIND) return { ok: false, reason: "kind" };
  const packet = { bytes: unpacked.bytes, sig: unpacked.sig, pubkey: unpacked.pubkey };
  if (!packetValid(packet)) return { ok: false, reason: "sig" };
  const body = decode(packet.bytes);
  if (!Array.isArray(body.cells) || body.cells.length % 3) return { ok: false, reason: "shape" };
  return { ok: true, nonce: body.nonce, cells: body.cells };
}
