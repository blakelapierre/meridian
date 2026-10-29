import { packetValid, packFrame, signBytes, unpackFrame } from "./identity.js";
import { decode, encode } from "../sim/cbor.js";

export function encodeWall(identity, { nonce, cell }) {
  return packFrame(9, signBytes(identity, encode({ nonce, cell })));
}

export function acceptWall(frame) {
  const unpacked = unpackFrame(frame);
  if (unpacked.kind !== 9) return { ok: false, reason: "kind" };
  const packet = { bytes: unpacked.bytes, sig: unpacked.sig, pubkey: unpacked.pubkey };
  if (!packetValid(packet)) return { ok: false, reason: "sig" };
  const body = decode(packet.bytes);
  return { ok: true, nonce: body.nonce, cell: body.cell };
}
