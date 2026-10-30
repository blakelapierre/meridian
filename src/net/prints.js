import { packetValid, packFrame, signBytes, unpackFrame } from "./identity.js";
import { decode, encode } from "../sim/cbor.js";

export function encodePrint(identity, { nonce, x, y, yaw = 0 }) {
  return packFrame(14, signBytes(identity, encode({
    nonce: Math.floor(nonce),
    x: Math.round(x * 100),
    y: Math.round(y * 100),
    yaw: Math.round(yaw * 100),
  })));
}

export function acceptPrint(frame) {
  const unpacked = unpackFrame(frame);
  if (unpacked.kind !== 14) return { ok: false, reason: "kind" };
  const packet = { bytes: unpacked.bytes, sig: unpacked.sig, pubkey: unpacked.pubkey };
  if (!packetValid(packet)) return { ok: false, reason: "sig" };
  const body = decode(packet.bytes);
  return {
    ok: true,
    nonce: body.nonce,
    x: body.x / 100,
    y: body.y / 100,
    yaw: (body.yaw || 0) / 100,
    who: [...unpacked.pubkey.slice(0, 8)].join("."),
  };
}
