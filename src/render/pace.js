export function nextScale(scale, averageMs, refreshMs, still = false) {
  const vsync = refreshMs > 0 ? refreshMs : 1000 / 60;
  if (averageMs > 1000 / 30) return Math.max(0.25, scale * 0.75);
  if (averageMs > vsync) return Math.max(0.25, scale * 0.85);
  if (still && averageMs <= vsync) return Math.min(1, scale * 1.06);
  if (averageMs < vsync * 0.55) return Math.min(1, scale * 1.12);
  return scale;
}

export function sizeAt(level, targetW, targetH) {
  const scale = 1 / 2 ** Math.max(0, level);
  let width = Math.max(2, Math.round(targetW * scale));
  let height = Math.max(2, Math.round(targetH * scale));
  if (width % 2) width -= 1;
  if (height % 2) height -= 1;
  return { width: Math.max(2, width), height: Math.max(2, height) };
}

export function coverLevel(targetW, targetH, rays) {
  const budget = Math.max(80, rays);
  let level = 0;
  while (level < 8) {
    const size = sizeAt(level, targetW, targetH);
    if (size.width * size.height <= budget) return level;
    level += 1;
  }
  return 8;
}

export function visualThroughput(pixels, frameMs, refreshMs) {
  if (!(pixels > 0) || !(frameMs > 0)) return 0;
  const refresh = Math.min(Math.max(refreshMs || 0, 1000 / 120), 1000 / 20);
  const shown = Math.min(1000 / frameMs, 1000 / refresh);
  // 12 fps is barely playable, 20 fps is the preferred floor. Under 12 the weight collapses.
  let motion;
  if (shown < 12) motion = 12 * (shown / 12) ** 4;
  else if (shown < 20) motion = 12 + (shown - 12) * 2;
  else motion = shown + 8;
  return pixels * motion * motion;
}

export function createPicturePace() {
  let octave = 2;
  let period = 1000 / 60;
  let periodSamples = 0;
  let bucket = [];
  let dwell = 0;
  let history = [];
  let hold = 0;
  const dwellFrames = 5;
  function predict(pixels) {
    if (!history.length) return null;
    const distinct = new Set(history.map((sample) => sample.pixels)).size;
    const last = history[history.length - 1];
    if (distinct < 2) return last.ms * (pixels / last.pixels);
    let count = 0;
    let sx = 0;
    let sy = 0;
    let sxx = 0;
    let sxy = 0;
    for (const sample of history) {
      count += 1;
      sx += sample.pixels;
      sy += sample.ms;
      sxx += sample.pixels * sample.pixels;
      sxy += sample.pixels * sample.ms;
    }
    const den = count * sxx - sx * sx;
    if (Math.abs(den) < 1) return last.ms * (pixels / last.pixels);
    const slope = Math.max(0, (count * sxy - sx * sy) / den);
    const overhead = Math.max(0, (sy - slope * sx) / count);
    return Math.max(1, overhead + slope * pixels);
  }
  return {
    get octave() {
      return octave;
    },
    step({ gap = 0, displayW = 960, displayH = 540 } = {}) {
      const size = sizeAt(octave, displayW, displayH);
      const pixels = Math.max(1, size.width * size.height);
      if (gap >= 8 && gap <= 50) {
        period = periodSamples ? period * 0.85 + gap * 0.15 : gap;
        periodSamples += 1;
      }
      const refresh = periodSamples < 4 ? Math.max(period, 1000 / 30) : period;
      if (!(gap > 0)) return { octave, detail: 0, refresh, info: 0 };
      if (dwell === 0) {
        dwell = 1;
        return { octave, detail: 0, refresh, info: 0 };
      }
      bucket.push(gap);
      dwell += 1;
      if (dwell <= dwellFrames) {
        return { octave, detail: 0, refresh, info: visualThroughput(pixels, gap, refresh) };
      }
      const ordered = [...bucket].sort((a, b) => a - b);
      const ms = ordered[ordered.length >> 1];
      bucket = [];
      dwell = 0;
      history.push({ pixels, ms });
      if (history.length > 8) history.shift();
      const info = visualThroughput(pixels, ms, refresh);
      if (ms > 1000 / 12 && octave < 8) {
        octave = Math.min(8, octave + (ms > 1000 / 6 ? 2 : 1));
        hold = 0;
        return { octave, detail: 0, refresh, info };
      }
      if (hold > 0) {
        hold -= 1;
        return { octave, detail: 0, refresh, info };
      }
      const distinct = new Set(history.map((sample) => sample.pixels)).size;
      let best = octave;
      let bestInfo = -1;
      if (distinct < 2) best = octave > 0 ? octave - 1 : Math.min(8, octave + 1);
      else {
        let slowest = octave;
        for (let step = -1; step <= 1; step += 1) {
          const candidate = octave + step;
          if (candidate < 0 || candidate > 8) continue;
          const box = sizeAt(candidate, displayW, displayH);
          const guess = predict(box.width * box.height);
          if (guess > 1000 / 12) {
            if (candidate > slowest) slowest = candidate;
            continue;
          }
          const score = visualThroughput(box.width * box.height, guess, refresh);
          if (score > bestInfo) {
            bestInfo = score;
            best = candidate;
          }
        }
        if (bestInfo < 0) best = slowest;
      }
      if (best === octave) hold = 4;
      octave = best;
      return { octave, detail: 0, refresh, info };
    },
  };
}

export function stepOctave(level, covered) {
  if (covered < level) return Math.max(0, level - 1);
  if (covered > level) return Math.min(8, level + 1);
  return Math.max(0, Math.min(8, level));
}

export function noteRayRate(previous, rays, ms) {
  if (!(rays > 0) || !(ms > 0.05)) return previous || 0;
  const rate = rays / (ms / 1000);
  return previous ? previous * 0.4 + rate * 0.6 : rate;
}

export function fitPixels(raysPerSec, refreshMs, nativePx) {
  const vsync = Math.min(refreshMs > 8 ? refreshMs : 1000 / 60, 1000 / 60);
  const affordable = raysPerSec > 0 ? raysPerSec * (vsync / 1000) : Math.min(nativePx, 140000);
  return Math.round(Math.max(16000, Math.min(nativePx, affordable)));
}

export function tuneRays(rays, { missed = false, paintMs = 0, refresh = 1000 / 60, cap = 2000000 } = {}) {
  const budget = Math.max(8, refresh * 0.9);
  if (missed || paintMs > budget) return Math.max(800, rays * 0.65);
  if (paintMs < budget * 0.75) return Math.min(cap, rays * 1.3 + 200, rays + 30000);
  return rays;
}

export function viewStill(previous, next) {
  if (!previous || !next) return false;
  if (next.busy) return false;
  if (Math.abs(next.yaw - previous.yaw) > 0.004) return false;
  if (Math.abs(next.pitch - previous.pitch) > 0.004) return false;
  return Math.hypot(next.x - previous.x, next.y - previous.y) <= 0.03;
}

export function playPixels(boxW, boxH) {
  return {
    width: Math.min(960, Math.max(1, Math.floor(boxW))),
    height: Math.min(540, Math.max(1, Math.floor(boxH))),
  };
}

export function nativePixels(boxW, boxH, dpr = 1) {
  const ratio = Math.max(1, Math.min(dpr || 1, 2));
  return {
    width: Math.max(1, Math.floor(boxW * ratio)),
    height: Math.max(1, Math.floor(boxH * ratio)),
  };
}

export function soldierTarget(still, native, play) {
  return still ? native : play;
}

export function easePixels(current, target, dt) {
  const shrinking = target.width < current.width || target.height < current.height;
  const step = Math.min(1, Math.max(0, dt) * (shrinking ? 4 : 1.2));
  return {
    width: current.width + (target.width - current.width) * step,
    height: current.height + (target.height - current.height) * step,
  };
}

export function paceWord(mode, { still = false, arrived = false, holding = true } = {}) {
  if (still && !holding) return `${mode} recover`;
  if (still && arrived) return `${mode} native`;
  if (still) return `${mode} still`;
  return mode;
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
  let extraGap = 1000;
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
      if (holding) extraGap = Math.max(refresh, extraGap * 0.92);
      else extraGap = Math.min(1000, Math.max(refresh, extraGap * 1.6));
      const paint = now - lastPaint >= extraGap;
      const mode = extraGap >= 900 ? "1fps" : holding ? "ease" : "yield";
      return {
        paint,
        scale: Math.min(scale, 0.45),
        refresh,
        mode,
        gap,
        holding,
        interval: extraGap,
      };
    },
    note(ms, active, still = false) {
      lastPaint = lastNow;
      if (!active) return scale;
      paints.push(gap > refresh * 1.25 ? gap : ms);
      checks += 1;
      if (checks < 30) return scale;
      const average = paints.reduce((sum, value) => sum + value, 0) / paints.length;
      paints = [];
      checks = 0;
      scale = nextScale(scale, average, refresh, still);
      return scale;
    },
  };
}
