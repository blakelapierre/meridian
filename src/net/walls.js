import { packetValid, packFrame, signBytes, unpackFrame } from "./identity.js";
import { decode, encode } from "../sim/cbor.js";

export function encodeWall(identity, { nonce, cell, integrity = null, yaw = 0 }) {
  const body = { nonce: Math.floor(nonce), cell: [Math.floor(cell[0]), Math.floor(cell[1])] };
  if (integrity != null) body.integrity = Math.round(integrity);
  if (yaw) body.yaw = 1;
  return packFrame(9, signBytes(identity, encode(body)));
}

export function encodeSalvage(identity, { nonce, cell }) {
  return packFrame(10, signBytes(identity, encode({ nonce: Math.floor(nonce), cell })));
}

export function acceptSalvage(frame) {
  const unpacked = unpackFrame(frame);
  if (unpacked.kind !== 10) return { ok: false, reason: "kind" };
  const packet = { bytes: unpacked.bytes, sig: unpacked.sig, pubkey: unpacked.pubkey };
  if (!packetValid(packet)) return { ok: false, reason: "sig" };
  const body = decode(packet.bytes);
  return { ok: true, nonce: body.nonce, cell: body.cell };
}

export function acceptWall(frame) {
  const unpacked = unpackFrame(frame);
  if (unpacked.kind !== 9) return { ok: false, reason: "kind" };
  const packet = { bytes: unpacked.bytes, sig: unpacked.sig, pubkey: unpacked.pubkey };
  if (!packetValid(packet)) return { ok: false, reason: "sig" };
  const body = decode(packet.bytes);
  return { ok: true, nonce: body.nonce, cell: body.cell, integrity: body.integrity ?? 80, yaw: body.yaw === 1 ? 1 : 0 };
}
