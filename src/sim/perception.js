// Perception: what the character notices, how sharply, and how fast.
//
// One attention point (the focus) plus a set of senses. Each sense has
//   acuity   0..1, how much detail it delivers at the focus
//   fovea    half-angle in radians that gets full detail and refreshes every tick
//   falloff  angle past the fovea over which detail and refresh fall to the periphery
//   period   ticks between refreshes at the far periphery (1 = every tick)
//   block    log2 of the coarsest peripheral sample cell (sight only; 0 = full res)
//   range    metres past which the sense delivers nothing
//   tickMs   how long one refresh tick lasts for this sense
// Abilities (skills today, gear or progression later) only change these numbers;
// the renderer, labels, and net code read the result through the helpers below.

function unit(value, top = 140) {
  return Math.max(0, Math.min(top, Number(value) || 0)) / top;
}

const DEG = Math.PI / 180;

export const SENSE_DEFAULTS = {
  sight: { acuity: 0.55, fovea: 6 * DEG, falloff: 45 * DEG, period: 6, block: 2, range: 160, tickMs: 1000 / 30 },
  hearing: { acuity: 0.5, fovea: 40 * DEG, falloff: 120 * DEG, period: 4, block: 0, range: 45, tickMs: 50 },
};

// abilities: { eyesight, focus, hearing } skill values (0..140) plus optional per-sense overrides,
// e.g. { sight: { range: 400 } } for binoculars or a future perk.
export function perceptionFrom(abilities = {}, overrides = {}) {
  const eye = unit(abilities.eyesight);
  const aim = unit(abilities.focus);
  const ear = unit(abilities.hearing);
  const base = SENSE_DEFAULTS;
  const sight = {
    acuity: Math.min(1, base.sight.acuity + eye * 0.35 + aim * 0.1),
    fovea: base.sight.fovea + (eye * 6 + aim * 3) * DEG,
    falloff: base.sight.falloff + eye * 20 * DEG,
    period: Math.max(2, Math.round(base.sight.period - eye * 3 - aim)),
    block: eye >= 0.6 ? 1 : base.sight.block,
    range: base.sight.range + eye * 400,
    tickMs: base.sight.tickMs,
  };
  const hearing = {
    acuity: Math.min(1, base.hearing.acuity + ear * 0.45),
    fovea: base.hearing.fovea,
    falloff: base.hearing.falloff,
    period: Math.max(1, Math.round(base.hearing.period - ear * 3)),
    block: 0,
    range: base.hearing.range + ear * 80,
    tickMs: base.hearing.tickMs,
    localization: unit(abilities.localization),
  };
  sight.dark = unit(abilities.dark);
  return {
    focus: { x: 0.5, y: 0.5, dir: [0, 1, 0] },
    senses: { sight: { ...sight, ...(overrides.sight || {}) }, hearing: { ...hearing, ...(overrides.hearing || {}) } },
  };
}

// Point attention somewhere: screen position (0..1, y down) and/or a world direction.
export function withFocus(perception, { x, y, dir } = {}) {
  const focus = { ...perception.focus };
  if (Number.isFinite(x)) focus.x = Math.min(1, Math.max(0, x));
  if (Number.isFinite(y)) focus.y = Math.min(1, Math.max(0, y));
  if (dir) focus.dir = dir;
  return { ...perception, focus };
}

export function angleBetween(a, b) {
  const la = Math.hypot(a[0], a[1], a[2]) || 1;
  const lb = Math.hypot(b[0], b[1], b[2]) || 1;
  const c = (a[0] * b[0] + a[1] * b[1] + a[2] * b[2]) / (la * lb);
  return Math.acos(Math.max(-1, Math.min(1, c)));
}

function smooth(e0, e1, x) {
  const t = Math.max(0, Math.min(1, (x - e0) / Math.max(1e-6, e1 - e0)));
  return t * t * (3 - 2 * t);
}

// 0 inside the fovea, 1 in the far periphery. Matches fovT in src/render/gpu.js.
export function falloff(sense, angle) {
  return smooth(sense.fovea, sense.fovea + sense.falloff, Math.abs(angle));
}

// Ticks between refreshes at this angle. Matches fovPeriod in gpu.js.
export function refreshPeriod(sense, angle) {
  return Math.floor(1 + (Math.max(1, sense.period) - 1) * falloff(sense, angle) + 0.5);
}

// log2 of the sample cell at this angle; each `refine` level of a stable view halves it. Matches fovBlock.
export function blockLevel(sense, angle, refine = 0) {
  return Math.max(0, Math.floor((sense.block || 0) * falloff(sense, angle) + 0.5) - Math.max(0, refine | 0));
}

// Share of pixels traced per tick at this angle: refreshed 1/period of ticks, one pixel per cell.
export function tracePriority(sense, angle, refine = 0) {
  const cell = 2 ** blockLevel(sense, angle, refine);
  return 1 / (refreshPeriod(sense, angle) * cell * cell);
}

// Expected traced share of the whole picture, by sampling a grid over the screen.
export function tracedFraction(sense, { fovDeg = 70, aspect = 16 / 9, gaze = { x: 0.5, y: 0.5 }, refine = 0, grid = 48 } = {}) {
  const tanHalf = Math.tan((fovDeg * DEG) / 2);
  const dir = (u, v) => [(u * 2 - 1) * aspect * tanHalf, (1 - v * 2) * tanHalf, 1];
  const g = dir(gaze.x, gaze.y);
  let sum = 0;
  for (let j = 0; j < grid; j += 1) {
    for (let i = 0; i < grid; i += 1) {
      sum += tracePriority(sense, angleBetween(dir((i + 0.5) / grid, (j + 0.5) / grid), g), refine);
    }
  }
  return sum / (grid * grid);
}

// How much detail a thing at `angle` from the focus and `distance` metres gets: 0..1.
export function perceivedDetail(perception, senseName, angle, distance = 0) {
  const sense = perception?.senses?.[senseName];
  if (!sense) return 0;
  const reach = Math.max(1e-3, sense.range);
  if (distance > reach) return 0;
  const near = 1 - smooth(reach * 0.5, reach, distance);
  return sense.acuity * (1 - 0.75 * falloff(sense, angle)) * near;
}

// Whether a thing should be refreshed again (net update, label, LOD swap) after `sinceMs`.
export function refreshDue(perception, senseName, angle, sinceMs) {
  const sense = perception?.senses?.[senseName];
  if (!sense) return true;
  return sinceMs >= (refreshPeriod(sense, angle) - 0.5) * sense.tickMs;
}

// Uniform pack for the foveated renderer.
export function foveaUniforms(perception, refine = 0) {
  const sight = perception.senses.sight;
  return {
    x: perception.focus.x,
    y: perception.focus.y,
    fovea: sight.fovea,
    falloff: sight.falloff,
    period: Math.max(1, sight.period),
    block: sight.block || 0,
    refine: Math.max(0, refine | 0),
  };
}

// Where a sound lands for this listener: gain falls off linearly to the hearing range and
// scales with acuity; pan is the source's side relative to the facing yaw (-1 left, 1 right).
export function hearAt(listener, yaw, source, hearing = SENSE_DEFAULTS.hearing) {
  const dx = source[0] - listener[0];
  const dy = source[1] - listener[1];
  const dist = Math.hypot(dx, dy);
  const range = hearing.range || SENSE_DEFAULTS.hearing.range;
  if (dist > range) return null;
  const near = 1 - dist / range;
  const gain = near * (0.4 + 0.6 * (hearing.acuity ?? SENSE_DEFAULTS.hearing.acuity));
  const pan = dist < 0.5 ? 0 : Math.max(-1, Math.min(1, (dx * Math.cos(yaw) - dy * Math.sin(yaw)) / dist));
  return { gain, pan, dist };
}

// Continuous version of blockLevel: the GPU blends between the two nearest cell sizes with the
// fraction, so the fade from sharp to soft has no ring where a level steps up.
export function fadeLevel(sense, angle, refine = 0) {
  return Math.max(0, sense.block * falloff(sense, angle) - refine);
}
