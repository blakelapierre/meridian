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
  paper: {
    name: "Paper",
    material: "a note in the crate",
    action: "read it",
    detail: "the compound is north, the bit digs, a hearth binds, the fin drinks the sun",
    difficulty: 0,
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
  if (object.body === "stone") {
    return {
      name: "Stone",
      material: "a thrown rock",
      action: "nothing, it is loose",
      detail: "the pairwise step is holding it",
      difficulty: 0,
      kind: "stone",
      point: hit.point,
    };
  }
  if (object.body === "person") {
    return {
      name: object.name || "Someone",
      material: "a living body",
      action: "speak",
      detail: object.detail || "",
      speech: object.speech || "",
      difficulty: 0,
      kind: "person",
      id: object.id,
      point: hit.point,
    };
  }
  if (object.body === "player") return { ...SUBJECTS.player, kind: "player", point: hit.point };
  if (object.type === "box" || object.type === "crust") {
    if (object.kind === "hearth") {
      return {
        name: object.name || "Hearth stone",
        material: "public stone",
        action: object.action || "bind with E",
        detail: object.detail || "a public stone",
        difficulty: object.difficulty ?? 0,
        kind: "hearth",
        public: true,
        cell: object.cell || null,
        point: hit.point,
      };
    }
    if (object.name) {
      const surface = object.surface;
      const material = surface === "water"
        ? "standing water"
        : surface === "stone"
          ? "cut stone"
          : surface === "thatch"
            ? "reed thatch"
            : surface === "hearth"
              ? "public stone"
              : "raw wood";
      return {
        name: object.name,
        material,
        action: object.action || "nothing, it is scenery",
        detail: object.detail || "part of the yard",
        difficulty: object.difficulty ?? 0,
        kind: object.kind || "prop",
        point: hit.point,
      };
    }
    const cell = [Math.round(hit.point[0] / 0.5), Math.round(hit.point[1] / 0.5)];
    const piece = pieces.find((item) => item.at[0] === cell[0] && item.at[1] === cell[1]);
    if (piece?.id === "wall") {
      return {
        ...SUBJECTS.wall,
        detail: `integrity ${Math.round(piece.integrity ?? 80)}`,
        kind: "wall",
        cell,
        point: hit.point,
      };
    }
    if (piece?.id === "table") {
      return {
        name: "Table",
        material: "timber",
        action: "sit",
        detail: piece.voucher || "unsigned",
        difficulty: 12,
        kind: "table",
        cell,
        point: hit.point,
      };
    }
    if (piece?.id === "footing") return { ...SUBJECTS.footing, kind: "footing", cell, point: hit.point };
    if (piece?.id === "slip") {
      return { ...SUBJECTS.paper, name: "Slip", detail: piece.text || "blank", kind: "slip", cell, point: hit.point };
    }
    if (object.id === "paper.atoll") return { ...SUBJECTS.paper, id: "paper.atoll", kind: "paper", point: hit.point };
    if (object.type === "box") return { ...SUBJECTS.prop, kind: "prop", point: hit.point };
    return { ...SUBJECTS.sand, kind: "sand", cell, point: hit.point };
  }
  return null;
}
