import { packetValid, packFrame, signBytes, unpackFrame } from "./identity.js";
import { decode, encode } from "../sim/cbor.js";

export function encodePiece(identity, { nonce, cell, id }) {
  return packFrame(13, signBytes(identity, encode({
    nonce: Math.floor(nonce),
    cell: [Math.floor(cell[0]), Math.floor(cell[1])],
    id,
  })));
}

export function acceptPiece(frame) {
  const unpacked = unpackFrame(frame);
  if (unpacked.kind !== 13) return { ok: false, reason: "kind" };
  const packet = { bytes: unpacked.bytes, sig: unpacked.sig, pubkey: unpacked.pubkey };
  if (!packetValid(packet)) return { ok: false, reason: "sig" };
  const body = decode(packet.bytes);
  if (body.id !== "hearth" && body.id !== "fin") return { ok: false, reason: "id" };
  return { ok: true, nonce: body.nonce, cell: body.cell, id: body.id };
}
