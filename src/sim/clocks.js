export function roundMaterials({ abandoned = false, phase, previous }) {
  if (abandoned) return 0;
  if (previous === "live" && phase === "gap") return 8;
  return 0;
}

export function overheadPoint(x, y) {
  return { x, y };
}
