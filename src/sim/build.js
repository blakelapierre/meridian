const WOOD = [0.42, 0.3, 0.18, 1];
const STONE = [0.42, 0.4, 0.36, 1];

export function footingCell(placement) {
  return [Math.round(placement.x / 50), Math.round(placement.y / 50)];
}

export function createYard(footing, metal = 30) {
  return {
    metal,
    stone: 8,
    fins: 1,
    bound: null,
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

export function placeTicks(skill = 0) {
  const trained = Math.max(0, Math.min(140, skill));
  return Math.max(1, Math.round(12 * 30 * (1 - 0.4 * trained / 140)));
}

export function pieceIntegrity(skill = 0) {
  const trained = Math.max(0, Math.min(140, skill));
  return Math.round(80 + (trained / 140) * 40);
}

export function tryPlaceWall(yard, cell, skill = 0) {
  if (!cell) return { ok: false, reason: "aim" };
  if (yard.metal < 6) return { ok: false, reason: "metal" };
  if (yard.pieces.some((piece) => sameCell(piece.at, cell))) return { ok: false, reason: "occupied" };
  if (!support(yard.pieces, cell)) return { ok: false, reason: "support" };
  yard.metal -= 6;
  yard.pieces.push({ id: "wall", at: cell.slice(), anchors: false, integrity: pieceIntegrity(skill) });
  return { ok: true, metal: yard.metal };
}

function collapse(yard) {
  let fallen = 0;
  const dropped = [];
  for (let i = yard.pieces.length - 1; i >= 0; i--) {
    if (yard.pieces[i].anchors) continue;
    if (yard.pieces[i].id === "crate" || yard.pieces[i].id === "wreck") continue;
    if (grounded(yard.pieces, i)) continue;
    dropped.push(yard.pieces[i].at.slice());
    yard.pieces.splice(i, 1);
    fallen += 1;
  }
  for (const at of dropped) {
    if (yard.pieces.some((piece) => piece.id === "crate" && sameCell(piece.at, at))) continue;
    yard.pieces.push({ id: "crate", at, anchors: false });
  }
  if (fallen) yard.spoil = (yard.spoil || 0) + fallen * 3;
  return fallen;
}

export function trySalvage(yard, cell) {
  if (!cell) return { ok: false, reason: "aim" };
  const index = yard.pieces.findIndex((piece) => piece.id === "wall" && sameCell(piece.at, cell));
  if (index >= 0) {
    yard.pieces.splice(index, 1);
    yard.metal += 6;
    const fallen = collapse(yard);
    return { ok: true, metal: yard.metal, fallen };
  }
  const crate = yard.pieces.findIndex((piece) => piece.id === "crate" && sameCell(piece.at, cell));
  if (crate >= 0) {
    yard.pieces.splice(crate, 1);
    yard.metal += 3;
    yard.spoil = Math.max(0, (yard.spoil || 0) - 3);
    return { ok: true, metal: yard.metal, fallen: 0 };
  }
  const wreck = yard.pieces.findIndex((piece) => piece.id === "wreck" && sameCell(piece.at, cell));
  if (wreck < 0) return { ok: false, reason: "none" };
  yard.pieces.splice(wreck, 1);
  yard.metal += 12;
  return { ok: true, metal: yard.metal, fallen: 0 };
}

export function adoptSalvage(yard, cell) {
  const index = yard.pieces.findIndex((piece) => piece.id === "wall" && sameCell(piece.at, cell));
  if (index < 0) return { ok: true, metal: yard.metal, fallen: 0 };
  yard.pieces.splice(index, 1);
  const fallen = collapse(yard);
  return { ok: true, metal: yard.metal, fallen };
}

export function adoptWall(yard, cell, integrity = 80, yaw = 0) {
  const existing = yard.pieces.find((piece) => piece.id === "wall" && sameCell(piece.at, cell));
  if (existing) {
    if (yaw) existing.yaw = 1;
    return { ok: true, metal: yard.metal };
  }
  if (yard.pieces.some((piece) => sameCell(piece.at, cell))) return { ok: true, metal: yard.metal };
  if (!support(yard.pieces, cell)) return { ok: false, reason: "support" };
  yard.pieces.push({ id: "wall", at: cell.slice(), anchors: false, integrity, yaw: yaw ? 1 : 0 });
  return { ok: true, metal: yard.metal };
}

export function turnWall(yard, cell) {
  const wall = yard.pieces.find((piece) => piece.id === "wall" && sameCell(piece.at, cell));
  if (!wall) return { ok: false, reason: "none" };
  wall.yaw = wall.yaw ? 0 : 1;
  return { ok: true, yaw: wall.yaw };
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
        piece: piece.id,
      };
    }
    if (piece.id === "hearth") {
      return {
        type: "box",
        min: [x - 0.28, y - 0.28, 0.2],
        max: [x + 0.28, y + 0.28, 0.7],
        color: [0.55, 0.28, 0.18, 1],
        reflectivity: 0.08,
        piece: piece.id,
      };
    }
    if (piece.id === "fin") {
      return {
        type: "box",
        min: [x - 0.05, y - 0.45, 0.7],
        max: [x + 0.05, y + 0.45, 1.8],
        color: [0.25, 0.32, 0.38, 1],
        reflectivity: 0.4,
        piece: piece.id,
      };
    }
    if (piece.id === "wreck") {
      return {
        type: "box",
        min: [x - 0.3, y - 0.3, 0],
        max: [x + 0.3, y + 0.3, 0.45],
        color: [0.25, 0.18, 0.16, 1],
        reflectivity: 0.1,
        piece: piece.id,
      };
    }
    if (piece.id === "crate") {
      return {
        type: "box",
        min: [x - 0.22, y - 0.22, 0],
        max: [x + 0.22, y + 0.22, 0.35],
        color: [0.34, 0.24, 0.14, 1],
        reflectivity: 0.1,
        piece: piece.id,
      };
    }
    const thin = piece.yaw ? 0.25 : 0.08;
    const wide = piece.yaw ? 0.08 : 0.25;
    return {
      type: "box",
      min: [x - wide, y - thin, 0],
      max: [x + wide, y + thin, 2.2],
      color: WOOD,
      reflectivity: 0.12,
      piece: piece.id,
    };
  });
}
