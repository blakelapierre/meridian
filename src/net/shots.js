import { packetValid, packFrame, signBytes, unpackFrame } from "./identity.js";
import { decode, encode } from "../sim/cbor.js";
import { classifyDummy } from "../sim/fire.js";
import { cast } from "../engine/cast.js";

function unit(values) {
  const length = Math.hypot(values[0], values[1], values[2]) || 1;
  return values.map((value) => value / length);
}

export function encodeShot(identity, { nonce, origin, dir, hitbox }) {
  const body = {
    nonce,
    origin: origin.map((value) => Math.round(value * 100)),
    dir: unit(dir).map((value) => Math.round(value * 32767)),
    hitbox: hitbox || "miss",
  };
  return packFrame(7, signBytes(identity, encode(body)));
}

export function acceptShot(frame, objects) {
  const unpacked = unpackFrame(frame);
  if (unpacked.kind !== 7) return { ok: false, reason: "kind" };
  const packet = { bytes: unpacked.bytes, sig: unpacked.sig, pubkey: unpacked.pubkey };
  if (!packetValid(packet)) return { ok: false, reason: "sig" };
  const body = decode(packet.bytes);
  const hit = cast(
    body.origin.map((value) => value / 100),
    unit(body.dir),
    objects,
  );
  const hitbox = classifyDummy(hit) || "miss";
  if (hitbox !== body.hitbox) return { ok: false, reason: "split", hitbox };
  return { ok: true, nonce: body.nonce, hitbox };
}
