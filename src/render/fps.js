export function createFps() {
  let frames = 0;
  let stamp = null;
  let value = 0;
  return {
    get value() {
      return value;
    },
    paint(now) {
      if (stamp === null) {
        stamp = now;
        return value;
      }
      frames += 1;
      const elapsed = now - stamp;
      if (elapsed < 500) return value;
      value = Math.round((frames * 1000) / elapsed);
      frames = 0;
      stamp = now;
      return value;
    },
  };
}
