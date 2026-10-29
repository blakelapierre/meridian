export function createDetail() {
  let level = 0;
  let key = "";
  return {
    get level() {
      return level;
    },
    sample(signature, frameMs = 16) {
      const moved = signature !== key;
      key = signature;
      if (moved) level = 0;
      else if (frameMs > 34) level = Math.max(0, level - 0.2);
      else if (frameMs < 22) level = Math.min(1, level + 1 / 20);
      return {
        level,
        coarse: 0.32 + level * 0.68,
        radius: 0.13 + level * 0.6,
        near: 4 + level * 60,
      };
    },
  };
}
