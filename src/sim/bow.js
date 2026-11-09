// A planted crossbow. It watches a short reach and looses on its own.
export const BOW_REACH = 16;
export const BOW_COOL = 45;
export const BOW_BITE = 14;

export function bowAim(bow, targets) {
  if (!bow || bow.cool > 0) return null;
  const origin = [bow.at[0] * 0.5, bow.at[1] * 0.5, 0.95];
  let best = null;
  for (const target of targets || []) {
    if (!target) continue;
    const dx = target.x - origin[0];
    const dy = target.y - origin[1];
    const dist = Math.hypot(dx, dy);
    if (dist < 1.4 || dist > BOW_REACH) continue;
    if (!best || dist < best.dist) best = { dist, dx, dy, z: target.z ?? 0.7, id: target.id || "" };
  }
  if (!best) return null;
  const dz = best.z - origin[2];
  const len = Math.hypot(best.dx, best.dy, dz) || 1;
  return { origin, dir: [best.dx / len, best.dy / len, dz / len], id: best.id, bite: BOW_BITE };
}

export function stepBows(pieces, targets) {
  const shots = [];
  for (const piece of pieces || []) {
    if (piece.id !== "bow") continue;
    if (piece.cool > 0) {
      piece.cool -= 1;
      continue;
    }
    const shot = bowAim(piece, targets);
    if (!shot) continue;
    piece.cool = BOW_COOL;
    shots.push(shot);
  }
  return shots;
}
