// Agility: one trained body skill that scales run speed, jump height and turn speed.
// Each factor is linear in skill/140 and reaches its cap only at 140 (specialized);
// an unspecialized skill tops out at 100, about 1.36x run, 1.29x jump, 1.36x turn.
export const AGILITY_CAPS = { run: 1.5, jump: 1.4, turn: 1.5 };

export function agilityFactor(kind, skill = 0) {
  const cap = AGILITY_CAPS[kind];
  if (!cap) return 1;
  const trained = Math.max(0, Math.min(140, Number(skill) || 0));
  return 1 + (cap - 1) * trained / 140;
}
