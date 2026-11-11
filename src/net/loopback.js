// Loopback channel pair (Batch 16): two in-process objects shaped like an RTCDataChannel, with
// optional simulated latency, jitter and loss. Torque runs single player through a "local
// connection" so solo and multiplayer share one code path; Meridian's solo mode uses this pair
// the same way (and tests use it to simulate bad links). `rand` can be seeded for tests.
// `ordered` (default true, like RTCDataChannel) keeps jittered delivery in send order; the game's
// channels are ordered, and the terrain vote handshake (frame 1 before frame 4) relies on it.
export function createLoopbackPair({ latencyMs = 0, jitterMs = 0, loss = 0, rand = Math.random, schedule, ordered = true } = {}) {
  const later = schedule || ((fn, ms) => (ms > 0 ? setTimeout(fn, ms) : queueMicrotask(fn)));
  const make = () => ({ readyState: "open", bufferedAmount: 0, binaryType: "arraybuffer", onmessage: null, sent: 0, dropped: 0, bytes: 0, other: null, send(data) {
    if (this.readyState !== "open") throw new Error("closed");
    const bytes = data instanceof Uint8Array ? data.slice() : typeof data === "string" ? data : new Uint8Array(data);
    this.sent += 1;
    this.bytes += bytes.length;
    if (loss > 0 && rand() < loss) { this.dropped += 1; return; }
    const far = this.other;
    const now = Date.now();
    let wait = latencyMs + (jitterMs ? rand() * jitterMs : 0);
    if (ordered) { wait = Math.max(wait, (this.due || 0) - now); this.due = now + wait; }
    later(() => { if (far.readyState === "open" && far.onmessage) far.onmessage({ data: typeof bytes === "string" ? bytes : bytes.buffer }); }, wait);
  }, close() { this.readyState = "closed"; this.other.readyState = "closed"; } });
  const a = make();
  const b = make();
  a.other = b;
  b.other = a;
  return [a, b];
}
