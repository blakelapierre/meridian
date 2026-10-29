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

export function dragPace(downed) {
  return downed ? 1.6 : 0;
}
