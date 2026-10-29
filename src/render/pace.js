export function nextScale(scale, averageMs, refreshMs) {
  const vsync = refreshMs > 0 ? refreshMs : 1000 / 60;
  if (averageMs > 1000 / 30) return Math.max(0.25, scale * 0.75);
  if (averageMs > vsync) return Math.max(0.25, scale * 0.85);
  if (averageMs < vsync * 0.55) return Math.min(1, scale * 1.12);
  return scale;
}

export function shouldPaint(active, elapsedMs) {
  return active || elapsedMs >= 1000;
}

export function createPacer() {
  let scale = 0.5;
  let lastNow = 0;
  let lastPaint = -1e9;
  let refresh = 1000 / 60;
  let paints = [];
  let checks = 0;
  let gap = 0;
  let seen = 0;
  let misses = 0;
  return {
    get scale() {
      return scale;
    },
    get refresh() {
      return refresh;
    },
    consider(now, active) {
      seen += 1;
      if (lastNow) {
        gap = now - lastNow;
        if (active && gap >= 8 && gap <= 40) refresh = refresh * 0.9 + gap * 0.1;
        if (active && seen > 15 && gap > 70) scale = Math.max(0.25, scale * 0.75);
      }
      lastNow = now;
      const paint = shouldPaint(active, now - lastPaint);
      const holding = active && (gap === 0 || gap <= refresh * 1.35);
      return { paint, scale, refresh, mode: active ? "vsync" : "1fps", gap, holding };
    },
    considerExtra(now, holding) {
      seen += 1;
      if (lastNow) gap = now - lastNow;
      lastNow = now;
      if (holding) misses = 0;
      else misses = Math.min(24, misses + 1);
      const stride = misses === 0 ? 1 : misses < 8 ? 2 : 4;
      if (!holding) scale = Math.max(0.25, scale * 0.98);
      return {
        paint: seen % stride === 0,
        scale: Math.min(scale, 0.6),
        refresh,
        mode: holding ? "free" : "yield",
        gap,
        holding,
      };
    },
    note(ms, active) {
      lastPaint = lastNow;
      if (!active) return scale;
      paints.push(gap > refresh * 1.25 ? gap : ms);
      checks += 1;
      if (checks < 30) return scale;
      const average = paints.reduce((sum, value) => sum + value, 0) / paints.length;
      paints = [];
      checks = 0;
      scale = nextScale(scale, average, refresh);
      return scale;
    },
  };
}
