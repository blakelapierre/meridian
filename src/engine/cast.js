import { cross, dot, length } from "./math.js";

const qScratch = [0, 0, 0];

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

function qFromUnitVectors(u, v) {
  const real = 1 + dot(u, v);
  if (real < 1e-6) {
    if (Math.abs(u[0]) > Math.abs(u[2])) return unit4([0, -u[1], u[0], 0]);
    return unit4([0, 0, -u[2], u[1]]);
  }
  cross(qScratch, u, v);
  return unit4([real, qScratch[0], qScratch[1], qScratch[2]]);
}

function unit4(q) {
  const n = Math.hypot(q[0], q[1], q[2], q[3]);
  return [q[0] / n, q[1] / n, q[2] / n, q[3] / n];
}

function rotateByQ(vector, q) {
  const [a, b, c, d] = q;
  const qv = [b, c, d];
  const dota = 2 * dot(qv, vector);
  const qvDot = dot(qv, qv);
  const cx = qv[1] * vector[2] - qv[2] * vector[1];
  const cy = qv[2] * vector[0] - qv[0] * vector[2];
  const cz = qv[0] * vector[1] - qv[1] * vector[0];
  const s = a * a - qvDot;
  return [
    qv[0] * dota + vector[0] * s + cx * 2 * a,
    qv[1] * dota + vector[1] * s + cy * 2 * a,
    qv[2] * dota + vector[2] * s + cz * 2 * a,
  ];
}

export function project(x, y, camera) {
  const half = Math.tan((camera.fov * Math.PI / 180) / 2) * camera.planeDistance;
  const px = (x * 2 - 1) * camera.aspect * half;
  const py = (1 - y * 2) * half;
  const dir = camera.dir;
  const len = length(dir) || 1;
  return rotateByQ(
    [px, py, camera.planeDistance],
    qFromUnitVectors([0, 0, 1], [dir[0] / len, dir[1] / len, dir[2] / len]),
  );
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
        color: field.color || [0.45, 0.42, 0.32, 1],
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
