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

export function mayEdit(deed, x, y, who) {
  if (!insideDeed(deed, x, y)) return true;
  return who === deed.holder;
}
