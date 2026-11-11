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
    nonce: Math.floor(nonce),
    origin: origin.map((value) => Math.round(value * 100)),
    dir: unit(dir).map((value) => Math.round(value * 32767)),
    hitbox: hitbox || "miss",
  };
  return packFrame(7, signBytes(identity, encode(body)));
}

// Batch 19 (P2): a witness that knows where the shooter stands rejects a shot fired from
// somewhere else. Without this, a cheater could sign a "hit" from a made-up origin beside the
// target and every witness's re-cast would agree. Slack covers interpolation lag (100-250 ms).
export const SHOT_ORIGIN_SLACK_M = 2;

export function acceptShot(frame, objects, { shooterAt = null } = {}) {
  const unpacked = unpackFrame(frame);
  if (unpacked.kind !== 7) return { ok: false, reason: "kind" };
  const packet = { bytes: unpacked.bytes, sig: unpacked.sig, pubkey: unpacked.pubkey };
  if (!packetValid(packet)) return { ok: false, reason: "sig" };
  const body = decode(packet.bytes);
  if (shooterAt) {
    const off = Math.hypot(body.origin[0] / 100 - shooterAt[0], body.origin[1] / 100 - shooterAt[1]);
    if (!(off <= SHOT_ORIGIN_SLACK_M)) return { ok: false, reason: "origin", nonce: body.nonce };
  }
  const hit = cast(
    body.origin.map((value) => value / 100),
    unit(body.dir),
    objects,
  );
  const hitbox = classifyDummy(hit) || "miss";
  if (hitbox !== body.hitbox) return { ok: false, reason: "split", hitbox, nonce: body.nonce };
  return { ok: true, nonce: body.nonce, hitbox };
}
