// A small seeded wander controller for test clients. It only decides which keys a player
// would hold (W, Shift, A/D, Space), so it drives the normal input path: movement prediction,
// interest tiers and footprints see a real player. Stuck recovery picks a new waypoint.

export function rng(seed) {
  let s = (Number(seed) >>> 0) || 0x9e3779b9;
  return () => {
    s ^= s << 13; s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5; s >>>= 0;
    return s / 4294967296;
  };
}

const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));

export function createWander(seed, { radius = 30, center = [0, -150] } = {}) {
  const rand = rng(seed);
  const pick = () => {
    const r = radius * Math.sqrt(rand());
    const t = rand() * Math.PI * 2;
    return [center[0] + Math.cos(t) * r, center[1] + Math.sin(t) * r];
  };
  return {
    goal: pick(),
    mode: "walk",
    modeLeft: 0,
    stuckFor: 0,
    last: null,
    moved: 0,
    picks: 1,
    rescues: 0,
    rand,
    pick,
  };
}

// state: { x, y, yaw }. Returns the set of held key codes for this step.
export function stepWander(bot, state, dt) {
  const held = new Set();
  if (bot.last) {
    const step = Math.hypot(state.x - bot.last[0], state.y - bot.last[1]);
    bot.moved += step;
    bot.stuckFor = bot.mode !== "idle" && step < 0.15 * dt ? bot.stuckFor + dt : 0;
  }
  bot.last = [state.x, state.y];
  bot.modeLeft -= dt;
  if (bot.modeLeft <= 0) {
    const r = bot.rand();
    bot.mode = r < 0.12 ? "idle" : r < 0.42 ? "run" : "walk";
    bot.modeLeft = bot.mode === "idle" ? 0.6 + bot.rand() * 1.4 : 2 + bot.rand() * 4;
  }
  const dx = bot.goal[0] - state.x;
  const dy = bot.goal[1] - state.y;
  if (Math.hypot(dx, dy) < 1.5 || bot.stuckFor > 1.5) {
    if (bot.stuckFor > 1.5) {
      bot.rescues += 1;
      held.add("Space");
    }
    bot.goal = bot.pick();
    bot.picks += 1;
    bot.stuckFor = 0;
  }
  // Yaw 0 faces +y (north); turning right (D) raises yaw toward +x.
  const want = Math.atan2(dx, dy);
  const off = wrap(want - state.yaw);
  if (off > 0.12) held.add("KeyD");
  else if (off < -0.12) held.add("KeyA");
  if (bot.mode === "idle") return held;
  if (Math.abs(off) < 1.2) held.add("KeyW");
  if (bot.mode === "run") held.add("ShiftLeft");
  if (bot.rand() < 0.4 * dt) held.add("Space");
  return held;
}

export const BOT_KEYS = ["KeyW", "KeyA", "KeyD", "ShiftLeft", "Space"];
