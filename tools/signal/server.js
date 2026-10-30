import { WebSocketServer } from "ws";

const MAX_BLOB = 64 * 1024;
const TTL_MS = 15_000;

// Limits for a lighthouse that faces the public internet. Defaults are generous for local play.
export const LIMITS = { maxSockets: 512, maxPeers: 1024, perSecond: 40, maxPayload: 1024 * 1024 };

export function createLighthouse(port = 0, { host, limits = {}, origins = null } = {}) {
  const limit = { ...LIMITS, ...limits };
  const peers = new Map();
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
        peers.set(pubkey, {
          socket,
          cell: String(message.cell || ""),
          role: message.role === "archive" ? "archive" : "player",
          catalog: String(message.catalog || ""),
          at: Date.now(),
        });
        return;
      }
      if (message.type === "list") {
        const now = Date.now();
        const cell = String(message.cell || "");
        const found = [];
        for (const [key, peer] of peers) {
          if (now - peer.at > TTL_MS) {
            peers.delete(key);
            continue;
          }
          if (peer.cell === cell) found.push({ pubkey: key, cell: peer.cell, role: peer.role, catalog: peer.catalog || "", exp: peer.at + TTL_MS });
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
      if (pubkey && peers.get(pubkey)?.socket === socket) peers.delete(pubkey);
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
