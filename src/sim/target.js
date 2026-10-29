import { SUBJECTS } from "./appraise.js";

function pointDistance(point, feet) {
  return (point[0] - feet[0]) ** 2 + (point[1] - feet[1]) ** 2;
}

export function listTargets({ dummy = null, others = [], pieces = [], props = [], feet = [0, 0, 0] } = {}) {
  const list = [];
  if (dummy) {
    list.push({
      id: "dummy",
      ...SUBJECTS.dummy,
      kind: "dummy",
      point: [dummy.x / 100, dummy.y / 100, 0.9],
    });
  }
  for (const other of others) {
    const point = [other.feet[0], other.feet[1], other.feet[2] + 1];
    list.push({
      id: other.id || `player:${point[0].toFixed(1)}:${point[1].toFixed(1)}`,
      ...SUBJECTS.player,
      kind: "player",
      point,
    });
  }
  for (const piece of pieces) {
    if (piece.id !== "wall" && piece.id !== "footing" && piece.id !== "hearth" && piece.id !== "fin") continue;
    const subject = piece.id === "wall"
      ? SUBJECTS.wall
      : piece.id === "footing"
        ? SUBJECTS.footing
        : { name: piece.id === "hearth" ? "Hearth stone" : "Solar fin", material: "placed", action: piece.id === "hearth" ? "bind with E" : "it drinks the sun", detail: "yard work", difficulty: 4 };
    list.push({
      id: `${piece.id}:${piece.at[0]}:${piece.at[1]}`,
      ...subject,
      kind: piece.id,
      cell: piece.at.slice(),
      point: [piece.at[0] * 0.5, piece.at[1] * 0.5, 1],
    });
  }
  for (const prop of props) {
    const box = prop.box;
    list.push({
      id: prop.id,
      ...SUBJECTS.prop,
      name: prop.id,
      kind: "prop",
      point: [
        (box.min.x + box.max.x) / 200,
        (box.min.y + box.max.y) / 200,
        (box.min.z + box.max.z) / 200,
      ],
    });
  }
  list.sort((a, b) => pointDistance(a.point, feet) - pointDistance(b.point, feet) || (a.id < b.id ? -1 : 1));
  return list;
}

export function listPlayers(options) {
  return listTargets(options).filter((item) => item.kind === "player");
}

export function listObjects(options) {
  return listTargets({ ...options, others: [] });
}

export function cycleTarget(list, currentId, step = 1) {
  if (!list.length) return null;
  const index = list.findIndex((item) => item.id === currentId);
  if (index < 0) return list[0];
  return list[(index + step + list.length) % list.length];
}
