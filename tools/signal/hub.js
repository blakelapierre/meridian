// Transport-free lighthouse core (Batch 20): the same wire protocol as tools/signal/server.js
// (announce / subscribe / list / signal, roster pushes), over any socket with send(text),
// close() and an `open` flag. The Cloudflare Worker's Durable Object runs this; node tests
// drive it with fake sockets. server.js stays as-is for local and self-hosted play.
export const MAX_BLOB = 64 * 1024;
const TTL_MS = 15_000;
const TTL_V2_MS = 30_000;
const ttlOf = (peer) => (peer.proto >= 2 ? TTL_V2_MS : TTL_MS);
const entry = (key, peer) => ({ pubkey: key, cell: peer.cell, role: peer.role, catalog: peer.catalog || "", proto: peer.proto, exp: peer.at + ttlOf(peer) });
export const HUB_LIMITS = { maxSockets: 512, maxPeers: 1024, perSecond: 40 };

export function createHub({ limits = {}, now = () => Date.now() } = {}) {
  const limit = { ...HUB_LIMITS, ...limits };
  const peers = new Map();
  const subs = new Map();
  const sockets = new Map(); // socket -> { pubkey, window, count }
  const live = (s) => s.open !== false;
  function push(cell, add, drop) {
    if (!add.length && !drop.length) return;
    const text = JSON.stringify({ type: "roster", cell, add, drop });
    for (const [socket, wanted] of subs) if (wanted === cell && live(socket)) socket.send(text);
  }
  function forget(key) {
    const peer = peers.get(key);
    if (!peer) return;
    peers.delete(key);
    push(peer.cell, [], [key]);
  }
  function sweep() {
    const t = now();
    for (const [key, peer] of peers) if (t - peer.at > ttlOf(peer)) forget(key);
  }
  function accept(socket) {
    if (sockets.size >= limit.maxSockets) return false;
    sockets.set(socket, { pubkey: null, window: now(), count: 0 });
    return true;
  }
  function message(socket, raw) {
    const state = sockets.get(socket);
    if (!state) return;
    const t = now();
    if (t - state.window >= 1000) { state.window = t; state.count = 0; }
    state.count += 1;
    if (state.count > limit.perSecond) {
      if (state.count > limit.perSecond * 5) { try { socket.close(); } catch { /* gone */ } }
      return;
    }
    let m;
    try { m = JSON.parse(String(raw)); } catch { return; }
    if (m.type === "announce") {
      const pubkey = String(m.pubkey || "");
      if (!pubkey || pubkey.length > 128) return;
      if (!peers.has(pubkey) && peers.size >= limit.maxPeers) return;
      state.pubkey = pubkey;
      const before = peers.get(pubkey);
      const next = { socket, cell: String(m.cell || ""), role: m.role === "archive" ? "archive" : "player", catalog: String(m.catalog || ""), proto: Math.max(1, Math.min(9, Number(m.proto) || 1)), at: t };
      peers.set(pubkey, next);
      const changed = !before || before.cell !== next.cell || before.role !== next.role || before.catalog !== next.catalog || before.proto !== next.proto;
      if (before && before.cell !== next.cell) push(before.cell, [], [pubkey]);
      if (changed) push(next.cell, [entry(pubkey, next)], []);
      return;
    }
    if (m.type === "subscribe") {
      const cell = String(m.cell || "");
      subs.set(socket, cell);
      const found = [];
      for (const [key, peer] of peers) if (peer.cell === cell && t - peer.at <= ttlOf(peer)) found.push(entry(key, peer));
      socket.send(JSON.stringify({ type: "present", peers: found, cell, sub: true }));
      return;
    }
    if (m.type === "list") {
      sweep();
      const cell = String(m.cell || "");
      const found = [];
      for (const [key, peer] of peers) if (peer.cell === cell) found.push(entry(key, peer));
      socket.send(JSON.stringify({ type: "present", peers: found }));
      return;
    }
    if (m.type === "signal") {
      const blob = String(m.blob || "");
      if (blob.length > MAX_BLOB) { socket.send(JSON.stringify({ type: "reject", reason: "blob" })); return; }
      const dest = peers.get(String(m.to || ""));
      if (!dest || !live(dest.socket)) return;
      dest.socket.send(JSON.stringify({ type: "signal", to: m.to, from: m.from, blob }));
    }
  }
  function close(socket) {
    const state = sockets.get(socket);
    sockets.delete(socket);
    subs.delete(socket);
    if (state?.pubkey && peers.get(state.pubkey)?.socket === socket) forget(state.pubkey);
  }
  return { accept, message, close, sweep, peers: () => peers.size, clients: () => sockets.size };
}
