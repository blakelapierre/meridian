export const SKILL_NAMES = ["appraisal", "jump", "run", "mapping", "tracking", "marksmanship", "mining", "building", "eyesight", "ranging"];

export const SUBSKILLS = { mapping: ["topography"] };

export function skillRows() {
  const rows = [];
  for (const name of SKILL_NAMES) {
    rows.push({ name, child: false });
    for (const child of SUBSKILLS[name] || []) rows.push({ name: child, child: true });
  }
  return rows;
}

export function useGain(value, specialized = false) {
  return (1 / (1 + value / 20)) * (specialized ? 1.5 : 1);
}

export function createSkills() {
  const skills = {};
  for (const name of SKILL_NAMES) {
    skills[name] = { xp: 0, value: 0, specialized: false, ready: 0 };
  }
  for (const [parent, children] of Object.entries(SUBSKILLS)) {
    for (const name of children) {
      skills[name] = { xp: 0, value: 0, specialized: false, ready: 0, parent };
    }
  }
  return skills;
}

export function grantUse(skills, name, { success = true, tick = 0, gap = 0 } = {}) {
  const skill = skills[name];
  if (!skill || !success) return 0;
  if (gap > 0 && tick < skill.ready) return 0;
  let cap = skill.specialized ? 140 : 100;
  if (skill.parent) cap = Math.min(cap, skills[skill.parent]?.value || 0);
  if (skill.value >= cap) return 0;
  const gain = useGain(skill.value, skill.specialized);
  const room = cap - skill.value;
  const applied = Math.min(gain, room);
  skill.xp += applied;
  skill.value += applied;
  if (gap > 0) skill.ready = tick + gap;
  return applied;
}

export function claimSpecialty(skills, cap = 2) {
  const marked = SKILL_NAMES.filter((name) => skills[name]?.specialized).length;
  if (marked >= cap) return null;
  let best = null;
  for (const name of SKILL_NAMES) {
    const skill = skills[name];
    if (!skill || skill.specialized || skill.value < 40) continue;
    if (!best || skill.value > skills[best].value) best = name;
  }
  if (!best) return null;
  skills[best].specialized = true;
  return best;
}
