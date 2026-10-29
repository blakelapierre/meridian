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

export function drainPool(pools, { x, y, floor }) {
  if (floor < -0.2) return false;
  const key = `${Math.round(x * 2) / 2},${Math.round(y * 2) / 2}`;
  const index = pools.findIndex((pool) => pool.key === key);
  if (index < 0) return false;
  pools.splice(index, 1);
  return true;
}

export function flowOnce(pool, floorHere, floorThere) {
  if (!pool || floorThere >= floorHere) return pool;
  return { ...pool, y: pool.y + 0.5, floor: floorThere, key: `${pool.x},${pool.y + 0.5}` };
}
