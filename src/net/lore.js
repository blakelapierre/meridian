import { packetValid, packFrame, signBytes, unpackFrame } from "./identity.js";
import { decode, encode } from "../sim/cbor.js";

export function encodeLore(identity, { nonce, friend = 0, ground = [], places = [] }) {
  return packFrame(12, signBytes(identity, encode({
    nonce: Math.floor(nonce),
    friend: Math.max(0, Math.floor(friend)),
    ground,
    places,
  })));
}

export function acceptLore(frame) {
  const unpacked = unpackFrame(frame);
  if (unpacked.kind !== 12) return { ok: false, reason: "kind" };
  const packet = { bytes: unpacked.bytes, sig: unpacked.sig, pubkey: unpacked.pubkey };
  if (!packetValid(packet)) return { ok: false, reason: "sig" };
  const body = decode(packet.bytes);
  return { ok: true, nonce: body.nonce, friend: body.friend, ground: body.ground, places: body.places };
}
