export function offerBond(bonds, id) {
  const now = bonds.get(id);
  bonds.set(id, now === "theirs" || now === "both" ? "both" : "ours");
  return bonds.get(id);
}

export function hearBond(bonds, id) {
  const now = bonds.get(id);
  bonds.set(id, now === "ours" || now === "both" ? "both" : "theirs");
  return bonds.get(id);
}

export function bondOpen(bonds, id, near) {
  return Boolean(near && bonds.get(id) === "both");
}

export function tithe(mastery = 0) {
  return mastery > 0 ? 0 : 0;
}

export function payTithe(purse, patron, amount) {
  if (!patron || !(amount > 0)) return purse;
  purse[patron] = (purse[patron] || 0) + amount;
  return purse;
}

export function spendPurse(purse, patron, cost) {
  if (!purse || !patron || !(cost > 0)) return false;
  if ((purse[patron] || 0) < cost) return false;
  purse[patron] -= cost;
  return true;
}

// The patron purse pays upkeep. It does not buy a wall.
export function buyFromPurse(purse, patron, kind) {
  if (kind === "wall") return false;
  return spendPurse(purse, patron, 1);
}

export function dragMessage(id) {
  if (!id) return "";
  return JSON.stringify({ t: "drag", id, walk: true });
}

export function readDragMessage(text) {
  try {
    const message = JSON.parse(typeof text === "string" ? text : new TextDecoder().decode(text));
    if (message?.t !== "drag" || !message.walk || !message.id) return null;
    return { id: String(message.id), walk: true };
  } catch {
    return null;
  }
}

export function stepDrag(feet, ask, yaw = 0, tick = 0) {
  if (!ask?.walk || !feet) return feet ? feet.slice() : null;
  const stride = Math.sin(tick * 0.8) * 0.15;
  return [
    feet[0] + Math.sin(yaw) * stride,
    feet[1] + Math.cos(yaw) * stride,
    feet[2] || 0,
  ];
}

export function dragAsk(downed) {
  return downed ? { walk: true, pace: 1.6 } : { walk: false, pace: 0 };
}

export function dragPace(downed) {
  return downed ? 1.6 : 0;
}
