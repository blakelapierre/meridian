import { useGain } from "./skills.js";

export const SUBJECTS = {
  sand: {
    name: "Sand",
    material: "loose crust",
    action: "dig with the bit",
    detail: "a floor you can stand in",
    difficulty: 0,
  },
  footing: {
    name: "Foundation stone",
    material: "cut stone",
    action: "build on it with the hammer",
    detail: "the yard footing",
    difficulty: 8,
  },
  wall: {
    name: "Stone wall",
    material: "fitted stone",
    action: "salvage with the hammer",
    detail: "integrity 80",
    difficulty: 10,
  },
  prop: {
    name: "Timber",
    material: "raw wood",
    action: "nothing, it is scenery",
    detail: "part of the yard",
    difficulty: 5,
  },
  dummy: {
    name: "Practice dummy",
    material: "padded linen",
    action: "attack with the line",
    detail: "health 100",
    difficulty: 20,
  },
  player: {
    name: "Another player",
    material: "a living body",
    action: "no offense from this distance",
    detail: "wilderness body",
    difficulty: 40,
  },
};

export function appraise(skill, subject) {
  const gap = skill - subject.difficulty;
  if (gap < 0) return { known: false, canAct: false, line: "You cannot tell what that is." };
  const facts = [subject.name];
  if (gap >= 15) facts.push(subject.material);
  const canAct = gap >= 35;
  if (canAct) facts.push(subject.action);
  if (gap >= 70) facts.push(subject.detail);
  return { known: true, canAct, line: facts.join(" · ") };
}

export function appraisalGain(skill) {
  return useGain(skill, false);
}

export function subjectFromHit(hit, pieces = []) {
  if (!hit?.object || hit.t === Infinity) return null;
  const object = hit.object;
  if (object.body === "self") return null;
  if (object.body === "dummy") return { ...SUBJECTS.dummy, kind: "dummy", point: hit.point };
  if (object.body === "player") return { ...SUBJECTS.player, kind: "player", point: hit.point };
  if (object.type === "box" || object.type === "crust") {
    const cell = [Math.round(hit.point[0] / 0.5), Math.round(hit.point[1] / 0.5)];
    const piece = pieces.find((item) => item.at[0] === cell[0] && item.at[1] === cell[1]);
    if (piece?.id === "wall") return { ...SUBJECTS.wall, kind: "wall", cell, point: hit.point };
    if (piece?.id === "footing") return { ...SUBJECTS.footing, kind: "footing", cell, point: hit.point };
    if (object.type === "box") return { ...SUBJECTS.prop, kind: "prop", point: hit.point };
    return { ...SUBJECTS.sand, kind: "sand", cell, point: hit.point };
  }
  return null;
}
