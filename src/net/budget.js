// Per-peer send budget with priority accumulation (Batch 16).
//
// After the Tribes/Torque ghost manager (Frohnmayer & Gift, GDC 2000; Torque3D, MIT): each tick a
// link gets a byte allowance, candidate updates are ranked, and they are packed until the
// allowance runs out. An update that misses its turn keeps its accumulated priority and adds to it
// the next tick, so nothing starves. The allowance shrinks on loss or a backed-up channel and grows
// back slowly when the link is clean. Fresh JS for Meridian.
export const TIER_WEIGHT = [8, 4, 1.5, 0.5]; // near-visible, mid-visible, unseen, beyond
export const BUDGET = { start: 1200, min: 160, max: 4000, burst: 4 }; // bytes per tick (30 Hz)

export function createBudget(opts = {}) {
  const b = { ...BUDGET, ...opts };
  return { perTick: b.start, min: b.min, max: b.max, burst: b.burst, tokens: b.start, acc: new Map(), spent: 0, skipped: 0 };
}

// Importance of one candidate this tick. inView: inside the receiver's frustum; speed in m/s.
export function weightOf({ tier = 3, inView = false, speed = 0, base = 1 } = {}) {
  const t = TIER_WEIGHT[Math.max(0, Math.min(3, tier))];
  return base * t * (inView ? 2 : 1) * (1 + Math.min(speed, 10) / 5);
}

// candidates: [{ key, bytes (size), weight, must? }]. Returns the ones to send, in priority order.
// `must` items (a mode change, a fresh tier) still need the budget but jump the queue.
export function pick(b, candidates) {
  b.tokens = Math.min(b.perTick * b.burst, b.tokens + b.perTick);
  for (const c of candidates) b.acc.set(c.key, (b.acc.get(c.key) || 0) + c.weight);
  const ranked = [...candidates].sort((x, y) => (y.must ? 1e9 : 0) + b.acc.get(y.key) - ((x.must ? 1e9 : 0) + b.acc.get(x.key)));
  const out = [];
  for (const c of ranked) {
    if (c.must || c.bytes <= b.tokens) { // must (mode/tier change, keepalive) may borrow against next tick
      b.tokens -= c.bytes;
      b.spent += c.bytes;
      b.acc.set(c.key, 0);
      out.push(c);
    } else b.skipped += 1;
  }
  // Keys that are no longer candidates stop accumulating.
  const live = new Set(candidates.map((c) => c.key));
  for (const key of b.acc.keys()) if (!live.has(key)) b.acc.delete(key);
  return out;
}

// Adapt to the link: loss fraction (0..1) from the notify layer and the channel's bufferedAmount.
export function adapt(b, loss = 0, buffered = 0) {
  if (loss > 0.05 || buffered > 64 * 1024) b.perTick = Math.max(b.min, Math.floor(b.perTick * 0.85));
  else if (loss < 0.02 && buffered < 16 * 1024) b.perTick = Math.min(b.max, Math.ceil(b.perTick * 1.02));
  return b.perTick;
}
