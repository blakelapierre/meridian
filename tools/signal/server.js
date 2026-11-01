import { WebSocketServer } from "ws";

const MAX_BLOB = 64 * 1024;
const TTL_MS = 15_000;
// A v2 client announces every 12 s once subscribed, so it gets a longer lease.
const TTL_V2_MS = 30_000;
const ttlOf = (peer) => (peer.proto >= 2 ? TTL_V2_MS : TTL_MS);
const entry = (key, peer) => ({ pubkey: key, cell: peer.cell, role: peer.role, catalog: peer.catalog || "", proto: peer.proto, exp: peer.at + ttlOf(peer) });

// Limits for a lighthouse that faces the public internet. Defaults are generous for local play.
export const LIMITS = { maxSockets: 512, maxPeers: 1024, perSecond: 40, maxPayload: 1024 * 1024 };

export function createLighthouse(port = 0, { host, limits = {}, origins = null } = {}) {
  const limit = { ...LIMITS, ...limits };
  const peers = new Map();
  // Wire v2 subscribe: socket -> cell. Old clients never subscribe and see no change.
  const subs = new Map();
  function push(cell, add, drop) {
    if (!add.length && !drop.length) return;
    const text = JSON.stringify({ type: "roster", cell, add, drop });
    for (const [socket, wanted] of subs) {
      if (wanted === cell && socket.readyState === socket.OPEN) socket.send(text);
    }
  }
  function forget(key) {
    const peer = peers.get(key);
    if (!peer) return;
    peers.delete(key);
    push(peer.cell, [], [key]);
  }
  const sweep = setInterval(() => {
    const now = Date.now();
    for (const [key, peer] of peers) if (now - peer.at > ttlOf(peer)) forget(key);
  }, 5000);
  sweep.unref?.();
  const wss = new WebSocketServer({
    port,
    host,
    maxPayload: limit.maxPayload,
    verifyClient: ({ origin }) => wss.clients.size < limit.maxSockets && (!origins || origins.includes(origin)),
  });

  wss.on("connection", (socket) => {
    let pubkey = null;
    let window = Date.now();
    let count = 0;
    socket.on("message", (raw) => {
      const now = Date.now();
      if (now - window >= 1000) {
        window = now;
        count = 0;
      }
      count += 1;
      if (count > limit.perSecond) {
        if (count > limit.perSecond * 5) socket.terminate();
        return;
      }
      let message;
      try {
        message = JSON.parse(raw.toString());
      } catch {
        return;
      }
      if (message.type === "announce") {
        pubkey = String(message.pubkey || "");
        if (!pubkey || pubkey.length > 128) return;
        if (!peers.has(pubkey) && peers.size >= limit.maxPeers) return;
        const before = peers.get(pubkey);
        const next = {
          socket,
          cell: String(message.cell || ""),
          role: message.role === "archive" ? "archive" : "player",
          catalog: String(message.catalog || ""),
          proto: Math.max(1, Math.min(9, Number(message.proto) || 1)),
          at: Date.now(),
        };
        peers.set(pubkey, next);
        const changed = !before || before.cell !== next.cell || before.role !== next.role || before.catalog !== next.catalog || before.proto !== next.proto;
        if (before && before.cell !== next.cell) push(before.cell, [], [pubkey]);
        if (changed) push(next.cell, [entry(pubkey, next)], []);
        return;
      }
      if (message.type === "subscribe") {
        const cell = String(message.cell || "");
        subs.set(socket, cell);
        const now = Date.now();
        const found = [];
        for (const [key, peer] of peers) if (peer.cell === cell && now - peer.at <= ttlOf(peer)) found.push(entry(key, peer));
        socket.send(JSON.stringify({ type: "present", peers: found, cell, sub: true }));
        return;
      }
      if (message.type === "list") {
        const now = Date.now();
        const cell = String(message.cell || "");
        const found = [];
        for (const [key, peer] of peers) {
          if (now - peer.at > ttlOf(peer)) {
            forget(key);
            continue;
          }
          if (peer.cell === cell) found.push(entry(key, peer));
        }
        socket.send(JSON.stringify({ type: "present", peers: found }));
        return;
      }
      if (message.type === "signal") {
        const blob = String(message.blob || "");
        if (blob.length > MAX_BLOB) {
          socket.send(JSON.stringify({ type: "reject", reason: "blob" }));
          return;
        }
        const dest = peers.get(String(message.to || ""));
        if (!dest || dest.socket.readyState !== dest.socket.OPEN) return;
        dest.socket.send(JSON.stringify({
          type: "signal",
          to: message.to,
          from: message.from,
          blob,
        }));
      }
    });
    socket.on("close", () => {
      subs.delete(socket);
      if (pubkey && peers.get(pubkey)?.socket === socket) forget(pubkey);
    });
  });

  return new Promise((resolve) => {
    const ready = () => {
      const address = wss.address();
      resolve({
        port: address.port,
        url: `ws://127.0.0.1:${address.port}`,
        clients: () => wss.clients.size,
        peers: () => peers.size,
        close() {
          clearInterval(sweep);
          for (const peer of peers.values()) peer.socket.terminate();
          return new Promise((done) => wss.close(done));
        },
      });
    };
    if (wss.address()) ready();
    else wss.once("listening", ready);
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const port = Number(process.env.PORT || 8787);
  createLighthouse(port).then((server) => {
    console.log(`lighthouse ${server.url}`);
  });
}
