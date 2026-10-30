export function lithoTick(integrity, { beach = true, nearest = 0 } = {}) {
  if (beach || nearest < 24) return integrity;
  return Math.max(0, integrity - 1);
}

export function sporeMetal(metal, { beach = true, wood = false, nearest = 0 } = {}) {
  if (beach || !wood || nearest < 24) return metal;
  return Math.max(0, metal - 1);
}

export function stepSwarm(at, feet) {
  if (!at || !feet) return null;
  const dx = at[0] - feet[0];
  const dy = at[1] - feet[1];
  const dist = Math.hypot(dx, dy) || 1;
  if (dist < 1.8) return { at, bite: true };
  const step = dist < 6 ? 0.4 : -0.08;
  return { at: [at[0] + (dx / dist) * step, at[1] + (dy / dist) * step, at[2]], bite: false };
}

export function raiseSpore(bite, at) {
  if (!bite || !at) return null;
  return { at: [at[0], at[1], (at[2] || 1) + 0.4], spore: true };
}

export function swarmPoint(x, y, digs) {
  if (y >= -190 || digs < 20) return null;
  return [x + 1.6, y, 1.1];
}
