// Analytic parts from the raytracer pin: capsule, cylinder, triangle.
// origin and radius are the bounding sphere. The picture uses a, b, c, r.

function metaOf(meta, origin, at, radius) {
  const part = {
    type: "shape",
    color: meta.color,
    reflectivity: meta.reflectivity ?? 0.04,
    origin,
    at,
    radius,
    self: Boolean(meta.self),
  };
  if (meta.tile) part.tile = meta.tile;
  if (meta.body) part.body = meta.body;
  else if (meta.self) part.body = "self";
  if (meta.id) {
    part.id = meta.id;
    part.name = meta.name || "";
    part.detail = meta.detail || "";
    part.speech = meta.speech || "";
  }
  return part;
}

export function spanShape(kind, a, b, r, color, meta = {}) {
  const origin = [(a[0] + b[0]) * 0.5, (a[1] + b[1]) * 0.5, (a[2] + b[2]) * 0.5];
  const reach = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]) * 0.5 + r;
  const at = meta.at || origin;
  return {
    ...metaOf({ ...meta, color }, origin, [at[0], at[1], at[2]], reach),
    kind,
    a: [a[0], a[1], a[2]],
    b: [b[0], b[1], b[2]],
    c: [0, 0, 0],
    r,
  };
}

export function boxShape(center, half, color, meta = {}) {
  const radius = Math.hypot(half[0], half[1], half[2]) || 0.05;
  return {
    ...metaOf({ ...meta, color }, [center[0], center[1], center[2]], [center[0], center[1], center[2]], radius),
    kind: "box",
    a: [center[0], center[1], center[2]],
    b: [half[0], half[1], half[2]],
    c: [0, 0, 0],
    r: 0,
  };
}

export function triShape(a, b, c, color, meta = {}) {
  const origin = [
    (a[0] + b[0] + c[0]) / 3,
    (a[1] + b[1] + c[1]) / 3,
    (a[2] + b[2] + c[2]) / 3,
  ];
  const tip = meta.at || c;
  const radius = Math.max(
    Math.hypot(a[0] - origin[0], a[1] - origin[1], a[2] - origin[2]),
    Math.hypot(b[0] - origin[0], b[1] - origin[1], b[2] - origin[2]),
    Math.hypot(c[0] - origin[0], c[1] - origin[1], c[2] - origin[2]),
  );
  return {
    ...metaOf({ ...meta, color }, origin, [tip[0], tip[1], tip[2]], radius || 0.05),
    kind: "triangle",
    a: [a[0], a[1], a[2]],
    b: [b[0], b[1], b[2]],
    c: [c[0], c[1], c[2]],
    r: 0,
  };
}
