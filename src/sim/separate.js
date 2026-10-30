export function separate(position, others, radius = 0.7) {
  const next = position.slice();
  for (const other of others) {
    let dx = next[0] - other[0];
    let dy = next[1] - other[1];
    let dist = Math.hypot(dx, dy);
    if (dist >= radius) continue;
    if (dist < 1e-4) {
      dx = radius;
      dy = 0;
      dist = radius;
    }
    const push = (radius - dist) / dist;
    next[0] += dx * push;
    next[1] += dy * push;
  }
  return next;
}
