export function createPools() {
  return [];
}

export function notePool(pools, { x, y, floor }) {
  if (floor >= -0.2) return null;
  const key = `${Math.round(x * 2) / 2},${Math.round(y * 2) / 2}`;
  if (pools.some((pool) => pool.key === key)) return null;
  const pool = { key, x, y, floor };
  pools.push(pool);
  return pool;
}
