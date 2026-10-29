export function createVein(at, metal = 6) {
  return { at: at.slice(), metal };
}

export function tapVein(vein, x, y) {
  if (!vein || vein.metal <= 0) return 0;
  if (Math.hypot(x - vein.at[0], y - vein.at[1]) > 1.2) return 0;
  const taken = Math.min(2, vein.metal);
  vein.metal -= taken;
  return taken;
}