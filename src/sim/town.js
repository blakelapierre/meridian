// Push a body out of town boxes marked halt. Roofs are not halted, so an eave does not stop a walk.
// The strike compound stays walk-through: its props do not set halt.
export function haltFeet(point, props, radius = 0.35) {
  let x = point[0];
  let y = point[1];
  const solids = [];
  for (const prop of props || []) {
    if (!prop?.halt || !prop.box) continue;
    solids.push(prop.box);
  }
  for (let pass = 0; pass < solids.length; pass += 1) {
    let hit = false;
    for (const box of solids) {
      const minX = box.min.x / 100 - radius;
      const maxX = box.max.x / 100 + radius;
      const minY = box.min.y / 100 - radius;
      const maxY = box.max.y / 100 + radius;
      if (x <= minX || x >= maxX || y <= minY || y >= maxY) continue;
      const left = x - minX;
      const right = maxX - x;
      const down = y - minY;
      const up = maxY - y;
      const m = Math.min(left, right, down, up);
      if (m === left) x = minX;
      else if (m === right) x = maxX;
      else if (m === down) y = minY;
      else y = maxY;
      hit = true;
    }
    if (!hit) break;
  }
  return [x, y, point[2]];
}
