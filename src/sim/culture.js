export function firstCrate(culture = "holds") {
  if (culture === "hosts") return { culture: "hosts", metal: 40, stone: 4 };
  if (culture === "veil") return { culture: "veil", metal: 16, stone: 4 };
  return { culture: "holds", metal: 20, stone: 12 };
}
