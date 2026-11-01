// Townsfolk. They stand. They are not other clients, and they do not walk.
export const PEOPLE = [
  {
    id: "pell",
    name: "Pell",
    detail: "at the hearth",
    speech: "I bound to this stone before the roofs went up. It is still open.",
    at: [-20.2, -156.8, 0],
    yaw: 0,
    color: [0.62, 0.4, 0.28, 1],
  },
  {
    id: "hask",
    name: "Hask",
    detail: "at the forge shed",
    speech: "The shed takes no metal. A wall does.",
    at: [-53.4, -166.5, 0],
    yaw: -Math.PI / 2,
    color: [0.34, 0.32, 0.3, 1],
  },
  {
    id: "nim",
    name: "Nim",
    detail: "at the ration house",
    speech: "Grain sits better under thatch than in the crate.",
    at: [-48, -171.2, 0],
    yaw: Math.PI,
    color: [0.28, 0.42, 0.3, 1],
  },
];

export const SPEAK_REACH = 3;

export function speakTo(person, feet) {
  if (!person?.speech) return { ok: false, reason: "silent" };
  const at = person.point || person.at;
  if (!at || !feet) return { ok: false, reason: "far" };
  const dist = Math.hypot(at[0] - feet[0], at[1] - feet[1]);
  if (dist > SPEAK_REACH) return { ok: false, reason: "too far" };
  return { ok: true, line: person.speech };
}

// The plate names the thing you have selected, even when appraisal has not.
export function targetPlate(selection) {
  if (!selection) return null;
  const title = selection.name || selection.kind || "Target";
  const bits = [];
  if (selection.kind === "person" && selection.detail) bits.push(selection.detail);
  const line = selection.line || "";
  if (line && line !== title && line !== "You cannot tell what that is.") bits.push(line);
  if (selection.kind === "person") bits.push("U speaks");
  else if (selection.canAct) bits.push("U acts");
  bits.push("Esc or ⌫ clears");
  return { title, line: bits.join(" · ") };
}
