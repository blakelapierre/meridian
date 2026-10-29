const WOOD = [0.42, 0.3, 0.18, 1];
const STONE = [0.42, 0.4, 0.36, 1];

export function footingCell(placement) {
  return [Math.round(placement.x / 50), Math.round(placement.y / 50)];
}

export function createYard(footing, metal = 30) {
  return {
    metal,
    pieces: [{ id: "footing", at: footingCell(footing), anchors: true }],
  };
}

export function cellOnGround(eye, dir) {
  if (dir[2] >= -0.05) return null;
  const t = (0 - eye[2]) / dir[2];
  if (t < 0 || t > 4) return null;
  return [
    Math.round((eye[0] + dir[0] * t) / 0.5),
    Math.round((eye[1] + dir[1] * t) / 0.5),
  ];
}

function sameCell(a, b) {
  return a[0] === b[0] && a[1] === b[1];
}

export function grounded(pieces, index) {
  const origin = pieces[index];
  if (!origin) return false;
  const seen = new Set([index]);
  let edge = [index];
  for (let step = 0; step < 8 && edge.length; step++) {
    const next = [];
    for (const at of edge) {
      const piece = pieces[at];
      if (piece.anchors) return true;
      for (let other = 0; other < pieces.length; other++) {
        if (seen.has(other)) continue;
        const dx = Math.abs(pieces[other].at[0] - piece.at[0]);
        const dy = Math.abs(pieces[other].at[1] - piece.at[1]);
        if (dx + dy !== 1) continue;
        seen.add(other);
        next.push(other);
      }
    }
    edge = next;
  }
  return edge.some((at) => pieces[at].anchors);
}

function support(pieces, cell) {
  const piecesWith = [...pieces, { id: "wall", at: cell, anchors: false }];
  return grounded(piecesWith, piecesWith.length - 1);
}

export function tryPlaceWall(yard, cell) {
  if (!cell) return { ok: false, reason: "aim" };
  if (yard.metal < 6) return { ok: false, reason: "metal" };
  if (yard.pieces.some((piece) => sameCell(piece.at, cell))) return { ok: false, reason: "occupied" };
  if (!support(yard.pieces, cell)) return { ok: false, reason: "support" };
  yard.metal -= 6;
  yard.pieces.push({ id: "wall", at: cell.slice(), anchors: false });
  return { ok: true, metal: yard.metal };
}

function collapse(yard) {
  let fallen = 0;
  for (let i = yard.pieces.length - 1; i >= 0; i--) {
    if (yard.pieces[i].anchors) continue;
    if (grounded(yard.pieces, i)) continue;
    yard.pieces.splice(i, 1);
    fallen += 1;
  }
  return fallen;
}

export function trySalvage(yard, cell) {
  if (!cell) return { ok: false, reason: "aim" };
  const index = yard.pieces.findIndex((piece) => piece.id === "wall" && sameCell(piece.at, cell));
  if (index < 0) return { ok: false, reason: "none" };
  yard.pieces.splice(index, 1);
  yard.metal += 6;
  const fallen = collapse(yard);
  return { ok: true, metal: yard.metal, fallen };
}

export function adoptSalvage(yard, cell) {
  const index = yard.pieces.findIndex((piece) => piece.id === "wall" && sameCell(piece.at, cell));
  if (index < 0) return { ok: true, metal: yard.metal, fallen: 0 };
  yard.pieces.splice(index, 1);
  const fallen = collapse(yard);
  return { ok: true, metal: yard.metal, fallen };
}

export function adoptWall(yard, cell) {
  if (yard.pieces.some((piece) => sameCell(piece.at, cell))) return { ok: true, metal: yard.metal };
  if (!support(yard.pieces, cell)) return { ok: false, reason: "support" };
  yard.pieces.push({ id: "wall", at: cell.slice(), anchors: false });
  return { ok: true, metal: yard.metal };
}

export function pieceBoxes(pieces) {
  return pieces.map((piece) => {
    const x = piece.at[0] * 0.5;
    const y = piece.at[1] * 0.5;
    if (piece.id === "footing") {
      return {
        type: "box",
        min: [x - 0.4, y - 0.4, 0],
        max: [x + 0.4, y + 0.4, 0.2],
        color: STONE,
        reflectivity: 0.16,
      };
    }
    return {
      type: "box",
      min: [x - 0.25, y - 0.08, 0],
      max: [x + 0.25, y + 0.08, 2.2],
      color: WOOD,
      reflectivity: 0.12,
    };
  });
}
