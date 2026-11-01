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
  if (pieces.some((other) => other !== origin && other.id === "floor" && sameCell(other.at, origin.at))) return true;
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

export function braceBonus(bracing = 0) {
  return Math.round(Math.max(0, Math.min(140, bracing)) / 140 * 24);
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
    const wall = yard.pieces[index];
    const line = wall.line || "";
    const by = wall.by || "";
    yard.pieces.splice(index, 1);
    yard.metal += 6;
    if (line) yard.pieces.push({ id: "slip", at: cell.slice(), anchors: true, text: line, by, sig: wall.sig || 0 });
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

export function tryPlacePost(yard, cell) {
  if (!cell) return { ok: false, reason: "aim" };
  if (yard.metal < 2) return { ok: false, reason: "metal" };
  const floored = yard.pieces.some((piece) => piece.id === "floor" && sameCell(piece.at, cell));
  if (yard.pieces.some((piece) => sameCell(piece.at, cell) && piece.id !== "floor")) return { ok: false, reason: "occupied" };
  if (!floored && !support(yard.pieces, cell)) return { ok: false, reason: "support" };
  yard.metal -= 2;
  yard.pieces.push({ id: "post", at: cell.slice(), anchors: false });
  return { ok: true, metal: yard.metal };
}

export function tryPlaceBeam(yard, cell) {
  if (!cell) return { ok: false, reason: "aim" };
  if (yard.metal < 2) return { ok: false, reason: "metal" };
  const west = yard.pieces.find((piece) => piece.id === "post" && piece.at[0] === cell[0] - 1 && piece.at[1] === cell[1]);
  const east = yard.pieces.find((piece) => piece.id === "post" && piece.at[0] === cell[0] + 1 && piece.at[1] === cell[1]);
  if (!west || !east) return { ok: false, reason: "posts" };
  if (yard.pieces.some((piece) => sameCell(piece.at, cell) && piece.id !== "floor")) return { ok: false, reason: "occupied" };
  yard.metal -= 2;
  yard.pieces.push({ id: "beam", at: cell.slice(), anchors: false, span: [west.at.slice(), east.at.slice()] });
  return { ok: true, metal: yard.metal };
}

export function tryPlaceRoad(yard, cell) {
  if (!cell) return { ok: false, reason: "aim" };
  if (yard.metal < 1) return { ok: false, reason: "metal" };
  if (yard.pieces.some((piece) => sameCell(piece.at, cell) && piece.id !== "footing")) return { ok: false, reason: "occupied" };
  yard.metal -= 1;
  yard.pieces.push({ id: "road", at: cell.slice(), anchors: true });
  return { ok: true, metal: yard.metal };
}

export function tryPlaceDoor(yard, cell) {
  if (!cell) return { ok: false, reason: "aim" };
  if (yard.metal < 3) return { ok: false, reason: "metal" };
  if (yard.pieces.some((piece) => sameCell(piece.at, cell) && piece.id !== "footing")) return { ok: false, reason: "occupied" };
  if (!support(yard.pieces, cell)) return { ok: false, reason: "support" };
  yard.metal -= 3;
  yard.pieces.push({ id: "door", at: cell.slice(), anchors: true, open: false });
  return { ok: true, metal: yard.metal };
}

export function turnWall(yard, cell) {
  const wall = yard.pieces.find((piece) => piece.id === "wall" && sameCell(piece.at, cell));
  if (!wall) return { ok: false, reason: "none" };
  wall.yaw = wall.yaw ? 0 : 1;
  return { ok: true, yaw: wall.yaw };
}

export function toggleDoor(yard, cell) {
  const door = yard.pieces.find((piece) => piece.id === "door" && sameCell(piece.at, cell));
  if (!door) return { ok: false, reason: "none" };
  door.open = !door.open;
  return { ok: true, open: door.open };
}

export function turnFin(yard, cell) {
  const fin = yard.pieces.find((piece) => piece.id === "fin" && sameCell(piece.at, cell));
  if (!fin) return { ok: false, reason: "none" };
  fin.yaw = fin.yaw ? 0 : 1;
  return { ok: true, yaw: fin.yaw };
}

export function repairFin(yard, cell) {
  const fin = yard.pieces.find((piece) => piece.id === "fin" && sameCell(piece.at, cell));
  if (!fin || !fin.broken) return { ok: false, reason: fin ? "whole" : "none" };
  if (yard.metal < 4) return { ok: false, reason: "metal" };
  yard.metal -= 4;
  fin.broken = false;
  return { ok: true, metal: yard.metal };
}

export function addFire(yard, cell, who) {
  const mark = yard.pieces.find((piece) => piece.id === "mission" && sameCell(piece.at, cell));
  if (!mark || !who) return false;
  mark.fires = mark.fires || [];
  if (mark.fires.includes(who)) return false;
  mark.fires.push(who);
  return true;
}

export function breakFin(yard, cell) {
  const fin = yard.pieces.find((piece) => piece.id === "fin" && sameCell(piece.at, cell));
  if (!fin || fin.broken) return { ok: false, reason: fin ? "broken" : "none" };
  fin.broken = true;
  return { ok: true };
}

export function toggleGate(yard, cell) {
  const road = yard.pieces.find((piece) => piece.id === "road" && sameCell(piece.at, cell));
  if (!road) return { ok: false, reason: "none" };
  road.gate = !road.gate;
  return { ok: true, gate: road.gate };
}

export function tryPlaceFloor(yard, cell) {
  if (!cell) return { ok: false, reason: "aim" };
  if ((yard.stone || 0) < 2) return { ok: false, reason: "stone" };
  const beam = yard.pieces.some((piece) => piece.id === "beam" && sameCell(piece.at, cell));
  if (yard.pieces.some((piece) => sameCell(piece.at, cell) && piece.id !== "footing" && piece.id !== "beam")) return { ok: false, reason: "occupied" };
  yard.stone -= 2;
  yard.pieces.push({ id: "floor", at: cell.slice(), anchors: true, held: beam });
  return { ok: true, stone: yard.stone, held: beam };
}

export function slipChecks(slip, sig) {
  if (!slip || slip.id !== "slip" || !(sig > 0)) return false;
  return slip.sig === sig;
}

export function tryPlaceCart(yard, cell) {
  if (!cell) return { ok: false, reason: "aim" };
  if (yard.metal < 1) return { ok: false, reason: "metal" };
  if (!yard.pieces.some((piece) => piece.id === "road" && sameCell(piece.at, cell))) return { ok: false, reason: "road" };
  yard.metal -= 1;
  yard.pieces.push({ id: "cart", at: cell.slice(), anchors: false, load: 1 });
  return { ok: true, metal: yard.metal };
}

export function rollCart(yard) {
  const cart = yard.pieces.find((piece) => piece.id === "cart" && piece.load > 0);
  if (!cart) return false;
  const next = [cart.at[0], cart.at[1] + 1];
  const road = yard.pieces.find((piece) => piece.id === "road" && sameCell(piece.at, next));
  if (!road) {
    cart.wait = (cart.wait || 0) + 1;
    if (cart.wait < 3) return false;
    const side = [cart.at[0] + 1, cart.at[1]];
    const other = yard.pieces.find((piece) => piece.id === "road" && sameCell(piece.at, side));
    if (other) {
      const from = cart.at.slice();
      cart.at = side.slice();
      cart.look = from;
      cart.wait = 0;
      return true;
    }
    yard.metal += cart.load;
    cart.load = 0;
    cart.wait = 0;
    return false;
  }
  cart.wait = 0;
  cart.at = next;
  return true;
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
      const turned = piece.yaw ? 0.45 : 0.05;
      const flat = piece.yaw ? 0.05 : 0.45;
      return {
        type: "box",
        min: [x - turned, y - flat, 0.7],
        max: [x + turned, y + flat, 1.8],
        color: [0.25, 0.32, 0.38, 1],
        reflectivity: 0.4,
        piece: piece.id,
      };
    }
    if (piece.id === "post") {
      return {
        type: "box",
        min: [x - 0.08, y - 0.08, 0],
        max: [x + 0.08, y + 0.08, 1.2],
        color: WOOD,
        reflectivity: 0.1,
        piece: piece.id,
      };
    }
    if (piece.id === "beam") {
      return {
        type: "box",
        min: [x - 0.55, y - 0.08, 1.05],
        max: [x + 0.55, y + 0.08, 1.2],
        color: WOOD,
        reflectivity: 0.1,
        piece: piece.id,
      };
    }
    if (piece.id === "road") {
      return {
        type: "box",
        min: [x - 0.45, y - 0.45, 0],
        max: [x + 0.45, y + 0.45, 0.05],
        color: [0.28, 0.26, 0.22, 1],
        reflectivity: 0.04,
        piece: piece.id,
      };
    }
    if (piece.id === "door") {
      const open = piece.open ? 0.08 : 0.45;
      return {
        type: "box",
        min: [x - 0.06, y - open, 0],
        max: [x + 0.06, y + open, 1.6],
        color: WOOD,
        reflectivity: 0.12,
        piece: piece.id,
      };
    }
    if (piece.id === "slip") {
      return {
        type: "box",
        min: [x - 0.12, y - 0.08, 0.02],
        max: [x + 0.12, y + 0.08, 0.06],
        color: [0.86, 0.82, 0.7, 1],
        reflectivity: 0.05,
        piece: piece.id,
      };
    }
    if (piece.id === "floor") {
      return {
        type: "box",
        min: [x - 0.5, y - 0.5, 0],
        max: [x + 0.5, y + 0.5, 0.08],
        color: STONE,
        reflectivity: 0.05,
        piece: piece.id,
      };
    }
    if (piece.id === "cart") {
      return {
        type: "box",
        min: [x - 0.25, y - 0.18, 0],
        max: [x + 0.25, y + 0.18, 0.4],
        color: WOOD,
        reflectivity: 0.1,
        piece: piece.id,
      };
    }
    if (piece.id === "mission" || piece.id === "trainer" || piece.id === "table") {
      const tall = piece.id === "table" ? 0.82 : 1.5;
      const wide = piece.id === "table" ? 0.6 : 0.2;
      return {
        type: "box",
        min: [x - wide, y - wide * 0.6, piece.id === "table" ? 0.7 : 0],
        max: [x + wide, y + wide * 0.6, tall],
        color: piece.id === "mission" ? [0.75, 0.2, 0.15, 1] : piece.id === "trainer" ? [0.35, 0.32, 0.48, 1] : WOOD,
        reflectivity: 0.08,
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
