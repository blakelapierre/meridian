export const PLANET_RADIUS_M = 320000;

export function shellDrop(x, y, radius = PLANET_RADIUS_M) {
  const flat = x * x + y * y;
  if (flat <= 0) return 0;
  if (flat >= radius * radius) return radius;
  return radius - Math.sqrt(radius * radius - flat);
}

export function radialDown(x, y, z = 0, radius = PLANET_RADIUS_M) {
  const len = Math.hypot(x, y, z + radius) || 1;
  return [-x / len, -y / len, -(z + radius) / len];
}
