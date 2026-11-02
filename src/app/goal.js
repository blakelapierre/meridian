// The first goal after the tour: two small objectives that point at skills and unlocks.
// Pure helpers so node tests can drive them without a page.
import { tierOf } from "./skill-text.js";

export const GOAL_KEY = "meridian-goal-1";
export const GOALS = [
  { id: "pit", desktop: "Goal: dig another pit with the bit (3). Mining rises with each dig.",
    touch: "Goal: dig another pit (3 Tool, hold Fire). Mining rises with each dig.", done: "Mining is on its way" },
  { id: "sight", desktop: "Goal: look around the island. Eyesight grows and the blurry edges sharpen.",
    touch: "Goal: drag to look around the island. Eyesight grows and the blurry edges sharpen.", done: "Your eyes are sharper" },
];

export function createGoal(done = []) {
  return { index: GOALS.findIndex((g) => !done.includes(g.id)), base: null, confirm: "", confirmUntil: 0 };
}

// facts: { digs, eyesight }. Returns true when a goal just finished.
export function stepGoal(goal, facts, now) {
  if (goal.index < 0) return false;
  const g = GOALS[goal.index];
  if (goal.base === null) goal.base = g.id === "pit" ? facts.digs : tierOf(facts.eyesight);
  const met = g.id === "pit" ? facts.digs > goal.base : tierOf(facts.eyesight) > goal.base;
  if (!met) return false;
  goal.confirm = g.done;
  goal.confirmUntil = now + 3000;
  goal.base = null;
  goal.index += 1;
  if (goal.index >= GOALS.length) goal.index = -1;
  return true;
}

export function goalLine(goal, touch, now) {
  const tick = goal.confirmUntil > now && goal.confirm ? `✓ ${goal.confirm}. ` : "";
  if (goal.index < 0) return tick ? `${tick}Skills unlock new abilities as they rise: press L for the log.` : "";
  const g = GOALS[goal.index];
  return `${tick}${touch ? g.touch : g.desktop}`;
}

export function goalDone(goal) {
  return GOALS.slice(0, goal.index < 0 ? GOALS.length : goal.index).map((g) => g.id);
}
