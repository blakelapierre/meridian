export function firstCrate(culture = "holds") {
  if (culture === "hosts") return { culture: "hosts", metal: 40, stone: 4 };
  if (culture === "veil") return { culture: "veil", metal: 16, stone: 4 };
  return { culture: "holds", metal: 20, stone: 12 };
}

// Leaving puts down the kit you woke with. Metal and stone earned after that stay.
export function shedKit(carried, woke) {
  if (!woke) return null;
  return {
    culture: "left",
    metal: Math.max(0, (carried?.metal || 0) - (woke.metal || 0)),
    stone: Math.max(0, (carried?.stone || 0) - (woke.stone || 0)),
    left: woke.culture || "",
  };
}
