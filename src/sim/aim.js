import { cast } from "../engine/cast.js";
import { VOXEL_M } from "./crust.js";

export const BIT_REACH_M = 4;
export const BIT_BRUSH_M = 1;
export const HAMMER_REACH_M = 4;
export const HAMMER_PROPOSE_M = 2;
// The footing is one 0.5 m cell, so a hearth was nearly impossible to start. A hammer aimed at a
// neighbouring cell selects a piece that has work waiting (`snap`: the footing before the hearth,
// the hearth while a fin is held). Pieces with no work waiting do not snap, so walls still go
// next to them.
export function snapCell(cell, pieces = [], snap = []) {
  for (const id of snap) {
    const piece = pieces.find((item) => item.id === id && Math.abs(item.at[0] - cell[0]) <= 1 && Math.abs(item.at[1] - cell[1]) <= 1);
    if (piece) return piece.at.slice();
  }
  return cell;
}

function nearestSolid(field, eye, aim) {
  const reach2 = BIT_REACH_M * BIT_REACH_M;
  const brush2 = BIT_BRUSH_M * BIT_BRUSH_M;
  let best = null;
  let bestD = Infinity;
  const minI = Math.floor((aim[0] - BIT_BRUSH_M) / VOXEL_M);
  const maxI = Math.floor((aim[0] + BIT_BRUSH_M) / VOXEL_M);
  const minJ = Math.floor((aim[1] - BIT_BRUSH_M) / VOXEL_M);
  const maxJ = Math.floor((aim[1] + BIT_BRUSH_M) / VOXEL_M);
  const minK = Math.floor((aim[2] - BIT_BRUSH_M) / VOXEL_M);
  const maxK = Math.floor((aim[2] + BIT_BRUSH_M) / VOXEL_M);
  for (let i = minI; i <= maxI; i++) {
    for (let j = minJ; j <= maxJ; j++) {
      for (let k = minK; k <= maxK; k++) {
        const center = [(i + 0.5) * VOXEL_M, (j + 0.5) * VOXEL_M, (k + 0.5) * VOXEL_M];
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

export function toolAim(slot, eye, dir, objects, pieces = [], snap = []) {
  if (slot !== "bit" && slot !== "hammer") return { inRange: false, kind: "far" };
  if (slot === "bit") {
    const field = objects.find((object) => object.type === "crust")?.field;
    const aim = eye.map((value, index) => value + dir[index] * 1.5);
    const solid = field ? nearestSolid(field, eye, aim) : null;
    if (!solid) return { inRange: false, kind: "far" };
    return { inRange: true, kind: "ground", cell: [solid.i, solid.j], x: solid.x, y: solid.y };
  }
  const hit = cast(eye, dir, objects);
  let point = hit && hit.t <= HAMMER_REACH_M ? hit.point : null;
  let distance = point ? hit.t : 0;
  if (!point) {
    // Batch 18: at a normal walking pitch the ray from a dune-height eye lands past reach (or on
    // nothing), so the hammer was dead unless you stared at your feet. Like the #25 dig fix,
    // propose the ground HAMMER_PROPOSE_M ahead along the look, when not looking up.
    const flat = Math.hypot(dir[0], dir[1]);
    if (dir[2] > 0.35 || flat < 1e-6) return { inRange: false, kind: "far" };
    point = [eye[0] + (dir[0] / flat) * HAMMER_PROPOSE_M, eye[1] + (dir[1] / flat) * HAMMER_PROPOSE_M, 0];
    distance = HAMMER_PROPOSE_M;
  }
  const cell = snapCell([Math.round(point[0] / 0.5), Math.round(point[1] / 0.5)], pieces, snap);
  // The hearth stands on the footing (same cell): report the top piece, not the first in the
  // list, or a hammer on the hearth read as "footing" and the fin could never start.
  const here = pieces.filter((item) => item.at[0] === cell[0] && item.at[1] === cell[1]);
  const piece = here.find((item) => item.id !== "footing" && item.id !== "floor") || here[0];
  let kind = "ground";
  if (piece) kind = piece.id;
  else if (hit?.object?.body === "dummy") kind = "dummy";
  return { inRange: true, kind, cell, x: cell[0] * 0.5, y: cell[1] * 0.5, distance };
}
