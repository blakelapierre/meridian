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

export function finGain(yaw = 0) {
  return yaw ? 0.6 : 1;
}

export function charterReady(bondCount, bound) {
  return Boolean(bound) && bondCount >= 2;
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

export function clockName(joined) {
  return joined ? "strike" : "hands";
}

export function resonanceWord(digs) {
  return digs >= 20 ? "resonance" : "";
}

export function socketOf(kind) {
  return kind === "pose" ? "snap" : "ops";
}

export function dominionOpen() {
  return false;
}

export function soldierTarget(still, native, play) {
  return still ? native : play;
}
