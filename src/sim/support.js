function faceAdjacent(a, b) {
  const dx = Math.abs(a.cell[0] - b.cell[0]);
  const dy = Math.abs(a.cell[1] - b.cell[1]);
  const dz = Math.abs(a.cell[2] - b.cell[2]);
  return dx + dy + dz === 1;
}

export function isGrounded(pieces, piece) {
  if (piece.collapsed) return false;
  const queue = [{ id: piece.id, depth: 0 }];
  const seen = new Set([piece.id]);
  while (queue.length) {
    const current = queue.shift();
    const node = pieces.find((item) => item.id === current.id);
    if (node.anchors && !node.collapsed && current.depth <= 8) return true;
    if (current.depth >= 8) continue;
    for (const other of pieces) {
      if (seen.has(other.id) || other.collapsed) continue;
      if (!faceAdjacent(node, other)) continue;
      seen.add(other.id);
      queue.push({ id: other.id, depth: current.depth + 1 });
    }
  }
  return false;
}

export function ageStructure(pieces, seconds) {
  const grounded = new Set(pieces.filter((piece) => isGrounded(pieces, piece)).map((piece) => piece.id));
  for (const piece of pieces) {
    if (grounded.has(piece.id) || piece.collapsed) continue;
    piece.integrity -= 20 * seconds;
    if (piece.integrity <= 0) {
      piece.integrity = 0;
      piece.collapsed = true;
      piece.spoil = Math.floor(piece.metal / 2);
    }
  }
}
