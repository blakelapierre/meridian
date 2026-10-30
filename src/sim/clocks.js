export function roundMaterials({ abandoned = false, phase, previous }) {
  if (abandoned) return 0;
  if (previous === "live" && phase === "gap") return 8;
  return 0;
}

export function defusePay({ defused = false, abandoned = false } = {}) {
  if (abandoned || !defused) return 0;
  return 8;
}

export function dominionFrame(seated, x, y) {
  if (!seated) return null;
  return overheadPoint(x, y);
}

export function overheadPoint(x, y) {
  return { x, y };
}
