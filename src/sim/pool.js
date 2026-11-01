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

export function lowerPool(pools, open) {
  if (!open || !pools?.length) return null;
  const pool = pools[0];
  pool.floor = Math.min(pool.floor, -0.45);
  return pool;
}

export function spillPool(pool) {
  if (!pool || pool.floor > -0.4) return pool;
  return { ...pool, y: pool.y + 0.5, key: `${pool.x},${pool.y + 0.5}` };
}

// A spill fills the cell it enters.
export function fillCell(pool) {
  const spilled = spillPool(pool);
  if (!spilled || spilled === pool || spilled.y === pool.y) return pool || null;
  return { ...spilled, filled: Math.round(spilled.y * 2) / 2 };
}

export function flowOnce(pool, floorHere, floorThere) {
  if (!pool || floorThere >= floorHere) return pool;
  return { ...pool, y: pool.y + 0.5, floor: floorThere, key: `${pool.x},${pool.y + 0.5}` };
}

// Upward lift from standing in a pool. Lift applies only below the water
// surface and fades toward it, so a swimmer floats at the surface. Before
// this fix a flat +14 m/s² (more than gravity) applied at any height,
// which made a player near a dug pool rise without limit (batch-4 fly-away).
export const POOL_SURFACE = -0.1;
export function poolLift(pools, position, reach = 0.7) {
  if (!pools?.some((pool) => Math.hypot(pool.x - position[0], pool.y - position[1]) < reach)) return 0;
  const under = POOL_SURFACE - position[2];
  if (under <= 0) return 0;
  return 9.81 + Math.min(4.19, under * 20);
}
