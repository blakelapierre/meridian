import { cast } from "../engine/cast.js";

export const BIT_REACH_M = 4;
export const BIT_BRUSH_M = 1;
export const HAMMER_REACH_M = 4;

function nearestSolid(field, eye, aim) {
  const reach2 = BIT_REACH_M * BIT_REACH_M;
  const brush2 = BIT_BRUSH_M * BIT_BRUSH_M;
  let best = null;
  let bestD = Infinity;
  const minI = Math.floor((aim[0] - BIT_BRUSH_M) * 2);
  const maxI = Math.floor((aim[0] + BIT_BRUSH_M) * 2);
  const minJ = Math.floor((aim[1] - BIT_BRUSH_M) * 2);
  const maxJ = Math.floor((aim[1] + BIT_BRUSH_M) * 2);
  const minK = Math.floor((aim[2] - BIT_BRUSH_M) * 2);
  const maxK = Math.floor((aim[2] + BIT_BRUSH_M) * 2);
  for (let i = minI; i <= maxI; i++) {
    for (let j = minJ; j <= maxJ; j++) {
      for (let k = minK; k <= maxK; k++) {
        const center = [i * 0.5 + 0.25, j * 0.5 + 0.25, k * 0.5 + 0.25];
        const fromAim = (center[0] - aim[0]) ** 2 + (center[1] - aim[1]) ** 2 + (center[2] - aim[2]) ** 2;
        const fromEye = (center[0] - eye[0]) ** 2 + (center[1] - eye[1]) ** 2 + (center[2] - eye[2]) ** 2;
        if (fromAim > brush2 || fromEye > reach2) continue;
        if (field.sampleMeters(center) > 0) continue;
        if (fromAim < bestD) {
          bestD = fromAim;
          best = { i, j, k, x: center[0], y: center[1] };
        }
      }
    }
  }
  return best;
}

export function toolAim(slot, eye, dir, objects, pieces = []) {
  if (slot !== "bit" && slot !== "hammer") return { inRange: false, kind: "far" };
  if (slot === "bit") {
    const field = objects.find((object) => object.type === "crust")?.field;
    const aim = eye.map((value, index) => value + dir[index] * 1.5);
    const solid = field ? nearestSolid(field, eye, aim) : null;
    if (!solid) return { inRange: false, kind: "far" };
    return { inRange: true, kind: "ground", cell: [solid.i, solid.j], x: solid.x, y: solid.y };
  }
  const hit = cast(eye, dir, objects);
  if (!hit || hit.t > HAMMER_REACH_M) return { inRange: false, kind: "far" };
  const cell = [Math.round(hit.point[0] / 0.5), Math.round(hit.point[1] / 0.5)];
  const piece = pieces.find((item) => item.at[0] === cell[0] && item.at[1] === cell[1]);
  let kind = "ground";
  if (piece) kind = piece.id;
  else if (hit.object?.body === "dummy") kind = "dummy";
  return { inRange: true, kind, cell, x: cell[0] * 0.5, y: cell[1] * 0.5, distance: hit.t };
}
