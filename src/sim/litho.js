export function lithoTick(integrity, { beach = true, nearest = 0 } = {}) {
  if (beach || nearest < 24) return integrity;
  return Math.max(0, integrity - 1);
}
