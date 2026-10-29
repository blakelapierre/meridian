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
  let scale = 1;
  let lastNow = 0;
  let lastPaint = -1e9;
  let refresh = 1000 / 60;
  let paints = [];
  let checks = 0;
  return {
    get scale() {
      return scale;
    },
    get refresh() {
      return refresh;
    },
    consider(now, active) {
      if (lastNow) {
        const delta = now - lastNow;
        if (active && delta >= 8 && delta <= 40) refresh = refresh * 0.9 + delta * 0.1;
      }
      lastNow = now;
      const paint = shouldPaint(active, now - lastPaint);
      return { paint, scale, refresh, mode: active ? "vsync" : "1fps" };
    },
    note(ms, active) {
      lastPaint = lastNow;
      if (!active) return scale;
      paints.push(ms);
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
