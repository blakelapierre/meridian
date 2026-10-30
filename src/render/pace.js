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

export function cameraSpeed(previous, next, dt) {
  if (!previous || !next || !(dt > 0)) return 0;
  const travel = Math.hypot((next.x || 0) - (previous.x || 0), (next.y || 0) - (previous.y || 0)) / dt;
  const turn = Math.hypot((next.yaw || 0) - (previous.yaw || 0), (next.pitch || 0) - (previous.pitch || 0)) / dt;
  return travel + turn * 4;
}

export function motionLimit(speed, refreshMs) {
  const refresh = Math.min(Math.max(refreshMs || 0, 1000 / 120), 1000 / 20);
  const pace = Math.min(1, Math.max(0, speed / 4.4)) ** 2;
  return (1000 / 12) * (1 - pace) + refresh * pace;
}

export function visualThroughput(pixels, frameMs, refreshMs, speed = 1) {
  if (!(pixels > 0) || !(frameMs > 0)) return 0;
  const refresh = Math.min(Math.max(refreshMs || 0, 1000 / 120), 1000 / 20);
  const fps = Math.min(1000 / frameMs, 1000 / refresh);
  return pixels * fps * Math.max(speed, 0) ** 2;
}

export function createPicturePace() {
  let scale = 0.4;
  let period = 1000 / 60;
  let periodSamples = 0;
  let bucket = [];
  let skip = true;
  let direction = 1;
  let lastScore = 0;
  let wasStill = false;
  return {
    get scale() {
      return scale;
    },
    step({ gap = 0, displayW = 960, displayH = 540, still = false, speed = 0 } = {}) {
      if (gap >= 8 && gap <= 50) {
        period = periodSamples ? period * 0.85 + gap * 0.15 : gap;
        periodSamples += 1;
      }
      const refresh = periodSamples < 4 ? Math.max(period, 1000 / 30) : period;
      const sized = () => pictureSize(scale, displayW, displayH);
      const pack = (info) => {
        const size = sized();
        return { scale, refresh, info, width: size.width, height: size.height };
      };
      if (!(gap > 0)) return pack(0);
      if (wasStill && !still && gap > refresh) {
        scale = Math.max(0.08, Math.min(1, scale * Math.sqrt(refresh / gap)));
        bucket = [];
        skip = true;
        direction = 1;
        lastScore = 0;
        wasStill = false;
        return pack(0);
      }
      wasStill = still;
      if (skip) {
        skip = false;
        return pack(0);
      }
      bucket.push(gap);
      if (bucket.length < 4) return pack(visualThroughput(sized().width * sized().height, gap, refresh, still ? 1 : speed));
      const ordered = [...bucket].sort((a, b) => a - b);
      const ms = ordered[ordered.length >> 1];
      bucket = [];
      const size = sized();
      const score = visualThroughput(size.width * size.height, ms, refresh, still ? 1 : Math.max(speed, 0.05));
      const limit = still ? Infinity : motionLimit(speed, refresh);
      const ease = Math.min(1, Math.max(0, speed / 4.4)) ** 2;
      const growBy = 1.04 + (1 - ease) * 0.14;
      if (!still && ms > limit) {
        scale = Math.max(0.08, Math.min(1, scale * Math.sqrt(limit / ms)));
        direction = 0;
        lastScore = 0;
      } else {
        if (!still && ms > limit * 0.85) direction = 0;
        else if (lastScore > 0 && score < lastScore * 0.98) direction = -direction;
        else if (!still) direction = 1;
        lastScore = score;
        if (direction > 0) scale = Math.max(0.08, Math.min(1, scale * growBy));
        else if (direction < 0) scale = Math.max(0.08, Math.min(1, scale * 0.96));
      }
      skip = true;
      const next = pictureSize(scale, displayW, displayH);
      return { scale, refresh, info: score, width: next.width, height: next.height };
    },
  };
}

export function pictureSize(scale, displayW, displayH) {
  const span = Math.max(0.05, Math.min(1, scale || 0));
  let width = Math.max(2, Math.round(displayW * span));
  let height = Math.max(2, Math.round(displayH * span));
  const long = Math.max(displayW, displayH);
  const edge = Math.max(width, height);
  if (long >= 160 && edge < 64) {
    const lift = 64 / edge;
    width = Math.round(width * lift);
    height = Math.round(height * lift);
  }
  width = Math.max(2, Math.min(displayW, Math.round(width / 4) * 4));
  height = Math.max(2, Math.min(displayH, Math.round(height / 4) * 4));
  return { width, height };
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
  if (Math.abs((next.distance || 0) - (previous.distance || 0)) > 0.02) return false;
  if (Math.abs((next.orbit || 0) - (previous.orbit || 0)) > 0.004) return false;
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
