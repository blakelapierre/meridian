import { cross, dot, length } from "./math.js";

export function sphereRayIntersection(origin, direction, center, radius) {
  const ocx = center[0] - origin[0];
  const ocy = center[1] - origin[1];
  const ocz = center[2] - origin[2];
  const a = direction[0] * direction[0] + direction[1] * direction[1] + direction[2] * direction[2];
  if (a === 0) return null;
  const b = direction[0] * ocx + direction[1] * ocy + direction[2] * ocz;
  const c = ocx * ocx + ocy * ocy + ocz * ocz - radius * radius;
  const delta = b * b - a * c;
  if (delta < 0) return null;
  const root = Math.sqrt(delta);
  let t = (b - root) / a;
  if (t < 0) t = (b + root) / a;
  if (t < 0) return null;
  return {
    t,
    point: [
      origin[0] + direction[0] * t,
      origin[1] + direction[1] * t,
      origin[2] + direction[2] * t,
    ],
  };
}

function normalize(vector) {
  const n = length(vector) || 1;
  return [vector[0] / n, vector[1] / n, vector[2] / n];
}

export function cameraBasis(camera) {
  const forward = normalize(camera.dir);
  let up = camera.up ? camera.up.slice() : [0, 0, 1];
  const along = dot(up, forward);
  const lifted = [up[0] - forward[0] * along, up[1] - forward[1] * along, up[2] - forward[2] * along];
  if (length(lifted) < 1e-6) {
    const fallback = Math.abs(forward[2]) > 0.9 ? [0, 1, 0] : [0, 0, 1];
    const lean = dot(fallback, forward);
    up = normalize([
      fallback[0] - forward[0] * lean,
      fallback[1] - forward[1] * lean,
      fallback[2] - forward[2] * lean,
    ]);
  } else {
    up = normalize(lifted);
  }
  const right = [0, 0, 0];
  cross(right, forward, up);
  return { forward, right, up };
}

export function worldToScreen(point, camera) {
  const { forward, right, up } = cameraBasis(camera);
  const dx = point[0] - camera.origin[0];
  const dy = point[1] - camera.origin[1];
  const dz = point[2] - camera.origin[2];
  const depth = dx * forward[0] + dy * forward[1] + dz * forward[2];
  if (depth <= 0.05) return null;
  const half = Math.tan((camera.fov * Math.PI / 180) / 2) * camera.planeDistance;
  const rx = dx * right[0] + dy * right[1] + dz * right[2];
  const uy = dx * up[0] + dy * up[1] + dz * up[2];
  const scale = camera.planeDistance / depth;
  return {
    x: (rx * scale / (camera.aspect * half) + 1) / 2,
    y: (1 - uy * scale / half) / 2,
  };
}

export function project(x, y, camera) {
  const half = Math.tan((camera.fov * Math.PI / 180) / 2) * camera.planeDistance;
  const px = (x * 2 - 1) * camera.aspect * half;
  const py = (1 - y * 2) * half;
  const { forward, right, up } = cameraBasis(camera);
  const depth = camera.planeDistance;
  return [
    right[0] * px + up[0] * py + forward[0] * depth,
    right[1] * px + up[1] * py + forward[1] * depth,
    right[2] * px + up[2] * py + forward[2] * depth,
  ];
}

export function intersect(origin, direction, object) {
  if (object.type === "sphere") {
    const hit = sphereRayIntersection(origin, direction, object.origin, object.radius);
    if (!hit) return null;
    return { ...hit, object, color: object.color };
  }
  if (object.type === "box") return boxRayIntersection(origin, direction, object);
  if (object.type === "crust") return crustMarch(origin, direction, object.field);
  return null;
}

export function boxRayIntersection(origin, direction, box) {
  let tMin = 0;
  let tMax = Infinity;
  const min = box.min;
  const max = box.max;
  for (let axis = 0; axis < 3; axis++) {
    const o = origin[axis];
    const d = direction[axis];
    if (Math.abs(d) < 1e-12) {
      if (o < min[axis] || o >= max[axis]) return null;
      continue;
    }
    let t1 = (min[axis] - o) / d;
    let t2 = (max[axis] - o) / d;
    if (t1 > t2) {
      const swap = t1;
      t1 = t2;
      t2 = swap;
    }
    tMin = Math.max(tMin, t1);
    tMax = Math.min(tMax, t2);
    if (tMin > tMax) return null;
  }
  if (tMax < 0) return null;
  const t = tMin >= 0 ? tMin : tMax;
  if (t < 0) return null;
  return {
    t,
    point: [
      origin[0] + direction[0] * t,
      origin[1] + direction[1] * t,
      origin[2] + direction[2] * t,
    ],
    object: box,
    color: box.color,
  };
}

export function crustMarch(origin, direction, field, maxDistance = 400) {
  let t = 0;
  for (let i = 0; i < 64; i++) {
    const p = [
      origin[0] + direction[0] * t,
      origin[1] + direction[1] * t,
      origin[2] + direction[2] * t,
    ];
    const sample = field.sampleMeters(p);
    if (sample <= 0) {
      return {
        t,
        point: p,
        object: { type: "crust" },
        color: p[2] < -0.3 ? [0.16, 0.13, 0.1, 1] : (field.color || [0.55, 0.48, 0.32, 1]),
      };
    }
    t += Math.max(sample, 0.05);
    if (t > maxDistance) return null;
  }
  return null;
}

export function cast(origin, direction, objects, miss = [0, 0, 0, 1]) {
  let best = null;
  for (let i = 0; i < objects.length; i++) {
    const hit = intersect(origin, direction, objects[i]);
    if (!hit) continue;
    if (!best || hit.t < best.t) best = hit;
  }
  if (!best) return { t: Infinity, color: miss, object: null, point: null };
  return best;
}

export function bodiesToObjects(bodies) {
  return bodies.map((body) => ({
    type: "sphere",
    origin: body.position,
    radius: body.size,
    color: [
      body.color[0] / 255,
      body.color[1] / 255,
      body.color[2] / 255,
      body.color[3] > 1 ? body.color[3] / 255 : body.color[3],
    ],
    body,
  }));
}
