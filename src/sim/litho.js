export function lithoTick(integrity, { beach = true, nearest = 0 } = {}) {
  if (beach || nearest < 24) return integrity;
  return Math.max(0, integrity - 1);
}

export function sporeMetal(metal, { beach = true, wood = false, nearest = 0 } = {}) {
  if (beach || !wood || nearest < 24) return metal;
  return Math.max(0, metal - 1);
}

export function swarmPoint(x, y, digs) {
  if (y >= -190 || digs < 20) return null;
  return [x + 1.6, y, 1.1];
}
