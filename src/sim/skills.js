export const SKILL_NAMES = ["appraisal", "jump", "run", "mapping", "marksmanship", "mining", "building", "eyesight", "ranging"];

export function useGain(value, specialized = false) {
  return (1 / (1 + value / 20)) * (specialized ? 1.5 : 1);
}

export function createSkills() {
  const skills = {};
  for (const name of SKILL_NAMES) {
    skills[name] = { xp: 0, value: 0, specialized: false, ready: 0 };
  }
  return skills;
}

export function grantUse(skills, name, { success = true, tick = 0, gap = 0 } = {}) {
  const skill = skills[name];
  if (!skill || !success) return 0;
  if (gap > 0 && tick < skill.ready) return 0;
  const cap = skill.specialized ? 140 : 100;
  if (skill.value >= cap) return 0;
  const gain = useGain(skill.value, skill.specialized);
  const room = cap - skill.value;
  const applied = Math.min(gain, room);
  skill.xp += applied;
  skill.value += applied;
  if (gap > 0) skill.ready = tick + gap;
  return applied;
}
