// Net graph lines for the I-key debug panel (Batch 16), after Torque's Net Graph:
// per link bytes in/out per second, loss, round trip, ghosts (peers we draw from that link) and
// the current send budget.
export function rateTracker() { return { lastMs: 0, lastIn: 0, lastOut: 0, inRate: 0, outRate: 0 }; }

export function sampleRate(t, bytesIn, bytesOut, nowMs) {
  const dt = (nowMs - t.lastMs) / 1000;
  if (t.lastMs && dt >= 0.5) {
    t.inRate = (bytesIn - t.lastIn) / dt;
    t.outRate = (bytesOut - t.lastOut) / dt;
  }
  if (!t.lastMs || dt >= 0.5) { t.lastMs = nowMs; t.lastIn = bytesIn; t.lastOut = bytesOut; }
  return t;
}

const kb = (x) => (x >= 1024 ? `${(x / 1024).toFixed(1)}k` : `${Math.round(x)}`);

// rows: [{ name, inRate, outRate, loss (0..1), rtt (ms), ghosts, budget }]
export function netGraphLines(rows) {
  if (!rows.length) return [];
  return ["net graph  in/s  out/s  loss  rtt  ghosts  budget", ...rows.map((r) =>
    `${String(r.name).slice(0, 8).padEnd(8)} ${kb(r.inRate).padStart(5)} ${kb(r.outRate).padStart(6)} ${(r.loss * 100).toFixed(1).padStart(4)}% ${String(Math.round(r.rtt || 0)).padStart(4)} ${String(r.ghosts ?? 0).padStart(6)} ${String(r.budget ?? "-").padStart(7)}`)];
}
