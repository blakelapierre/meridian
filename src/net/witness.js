// Batch 19 (P2 witnessed hits): each witness re-casts a signed shot from the shooter's known pose
// and casts a ballot; a hit counts only when two distinct witnesses (never the shooter) agree.
import { unpackFrame } from "./identity.js";
import { acceptShot } from "./shots.js";
import { certifyShot } from "../sim/cert.js";

const hex = (bytes) => [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");

export function witnessBallot(frame, objects, shooterAt) {
  const shooter = hex(unpackFrame(frame).pubkey);
  const seen = acceptShot(frame, objects, { shooterAt });
  const ballot = seen.ok && seen.hitbox !== "miss" ? "hit" : "miss";
  return { shooter, nonce: seen.nonce ?? null, ballot, hitbox: ballot === "hit" ? seen.hitbox : "miss", reason: seen.ok ? "" : seen.reason };
}

export function createShotTally() {
  const shots = new Map();
  return {
    add(shooter, nonce, witness, ballot) {
      if (witness === shooter) return null; // a shooter never witnesses itself
      const key = `${shooter}:${nonce}`;
      if (!shots.has(key)) shots.set(key, new Map());
      shots.get(key).set(witness, ballot); // one ballot per witness, last one wins
      return this.result(shooter, nonce);
    },
    result(shooter, nonce) {
      const votes = shots.get(`${shooter}:${nonce}`);
      return votes ? certifyShot([...votes.values()]) : null;
    },
  };
}
