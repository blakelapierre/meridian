export const DAY_TICKS = 72 * 60 * 30;
export const SUN_MULTIPLIER = 1;

export function sunDirection(tick, multiplier = SUN_MULTIPLIER) {
  const phase = ((tick * multiplier) / DAY_TICKS) * Math.PI * 2;
  return [Math.cos(phase), 0, Math.sin(phase)];
}

export function dayWord(tick, multiplier = SUN_MULTIPLIER) {
  const height = sunDirection(tick, multiplier)[2];
  if (height >= 0.5) return "noon";
  if (height > 0) return "day";
  if (height > -0.5) return "low";
  return "night";
}

export function finFluxPerMin(normal, sun) {
  let dot = 0;
  for (let i = 0; i < 3; i++) dot += normal[i] * sun[i];
  return Math.floor(10 * Math.max(0, dot));
}
