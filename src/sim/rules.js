export function bandage(vitals, fiber) {
  if (fiber < 1) return false;
  const legs = ["left", "right"].filter((name) => (vitals[name] ?? 100) < 100);
  const hurt = (vitals.blood ?? 100) < 100 || vitals.integrity < 100 || legs.length > 0;
  if (!hurt) return false;
  vitals.blood = Math.min(100, (vitals.blood ?? 100) + 15);
  vitals.integrity = Math.min(100, vitals.integrity + 8);
  if (legs.length) {
    const worse = legs.reduce((a, b) => (vitals[a] <= vitals[b] ? a : b));
    vitals[worse] = Math.min(100, vitals[worse] + 20);
  }
  return true;
}

export function spoilCap(mining = 0) {
  return 4 + Math.floor(mining / 20);
}

export function blastPush(from, at, power = 4) {
  const dx = at[0] - from[0];
  const dy = at[1] - from[1];
  const dist = Math.hypot(dx, dy);
  if (dist > 4 || dist < 0.05) return [0, 0, 0];
  const scale = (power * (1 - dist / 4)) / dist;
  return [dx * scale, dy * scale, 1.5];
}

export function crackGain(distance) {
  if (distance == null || distance <= 40) return 1;
  if (distance >= 80) return 0.25;
  return 1 - ((distance - 40) / 40) * 0.75;
}

// A shot cracks inside its range and is silent past it. The old falloff is unchanged inside.
export function crackInside(distance, range = 80) {
  if (distance == null) return 1;
  if (distance > range) return 0;
  return crackGain(distance);
}

export function finGain(yaw = 0) {
  return yaw ? 0.6 : 1;
}

export function charterReady(bondCount, bound) {
  return Boolean(bound) && bondCount >= 2;
}

export function charterObject(ready, at) {
  if (!ready || !at) return null;
  return { id: "charter", at: [at[0], at[1]], anchors: true, text: "charter" };
}

export function companyWallet() {
  return 0;
}

export function spendLogistics(wallet, cost) {
  return wallet >= cost && cost > 0;
}

export function authority(ids, tick) {
  if (!ids?.length) return "";
  return ids[Math.abs(Math.floor(tick)) % ids.length];
}

export function clockName(joined, seated = false) {
  if (seated && !joined) return "dominion";
  return joined ? "strike" : "hands";
}

export function resonanceWord(digs) {
  return digs >= 20 ? "resonance" : "";
}

export function socketOf(kind) {
  if (kind === "pose") return "snap";
  if (kind === "lore") return "lore";
  if (kind === "harm") return "harm";
  return "ops";
}

export function dominionOpen() {
  return false;
}

export function soldierTarget(still, native, play) {
  return still ? native : play;
}

export function storeWind(cells, id, x, y) {
  const wind = windAt(x, y);
  cells.set(id, wind);
  return wind;
}

export function windAt(x, y) {
  return [0.6 + Math.sin(x / 30) * 0.4, 0.1 + Math.cos(y / 40) * 0.2, 0];
}

export function windPush(wind) {
  if (!wind) return [0, 0, 0];
  return [wind[0] * 0.004, (wind[1] || 0) * 0.004, 0];
}

// Status-line note for the wind push on a drifting body; empty when there is none.
export function pushNote(wind) {
  const push = windPush(wind);
  const strength = Math.hypot(push[0], push[1]);
  if (strength < 1e-4) return "";
  return ` · wind push ${(strength * 1000).toFixed(1)}`;
}

// A moving body leans into the push. A still body stays upright. Radians, small.
export function bodyLean(wind, moving) {
  if (!moving || !wind) return 0;
  const push = windPush(wind);
  return Math.max(-0.15, Math.min(0.15, push[0] * 40));
}

// An open sail multiplies the push. A furled sail, or no sail, adds nothing.
export function fillSail(wind, open) {
  if (!open || !wind) return [0, 0, 0];
  const push = windPush(wind);
  return [push[0] * 8, push[1] * 8, 0];
}

export function frontGain(dot) {
  return dot < 0 ? 0.5 : 1;
}

export function refuseSlump(mode) {
  return mode === "slump";
}

export function titheDue(patron) {
  return patron ? 1 : 0;
}
