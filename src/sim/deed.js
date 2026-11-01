export function graceMark(deed, grace) {
  if (!deed) return null;
  return { ...deed, grace: Boolean(grace) };
}

// The deed a peer checks, grace included.
export function peerDeed(deed, grace) {
  const marked = graceMark(deed, grace);
  if (!marked) return null;
  return { cell: marked.cell, holder: marked.holder || null, radius: marked.radius, grace: marked.grace };
}

export function lapseMessage(cell) {
  if (!cell) return "";
  return JSON.stringify({ t: "lapse", cell: [cell[0], cell[1]] });
}

export function readLapse(text) {
  try {
    const message = JSON.parse(typeof text === "string" ? text : new TextDecoder().decode(text));
    if (message?.t !== "lapse" || !message.cell) return null;
    return { cell: [message.cell[0], message.cell[1]] };
  } catch {
    return null;
  }
}

export function deedVolume(cell, holder, radius = 6) {
  if (!cell || !holder) return null;
  return { cell: cell.slice(), holder, radius };
}

export function insideDeed(deed, x, y) {
  if (!deed) return false;
  const dx = x - deed.cell[0] * 0.5;
  const dy = y - deed.cell[1] * 0.5;
  return Math.hypot(dx, dy) <= deed.radius;
}

export function grantKey(keys, id) {
  if (!id) return keys;
  keys.add(id);
  return keys;
}

export function mayEdit(deed, x, y, who, keys = null) {
  if (!insideDeed(deed, x, y)) return true;
  if (who === deed.holder) return true;
  return Boolean(keys && keys.has(who));
}
