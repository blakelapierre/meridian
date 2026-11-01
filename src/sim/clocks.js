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

// A second camera pose for the overhead point. The picture camera stays on the body.
export function overheadCamera(seated, x, y) {
  const point = dominionFrame(seated, x, y);
  if (!point) return null;
  return { x: point.x, y: point.y, camera: "overhead", pitch: -1.2, height: 18 };
}

export function payPurse(kind) {
  if (kind === "defuse") return { purse: "defuse", metal: 8 };
  if (kind === "round") return { purse: "round", metal: 8 };
  return { purse: "none", metal: 0 };
}

// The three clocks. Nothing here is a choice the player makes.
export function threeClocks() {
  return ["hands", "strike", "dominion"];
}

export function unpickedClock(now) {
  const names = threeClocks();
  if (!names.includes(now)) return null;
  return { names, now, picked: false };
}
