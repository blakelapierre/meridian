// Meridian lighthouse on Cloudflare Workers (Batch 20). Prepared, NOT deployed: no account exists.
//   GET  /            -> "meridian lighthouse" (health check)
//   GET  /ws          -> WebSocket, lighthouse protocol (tools/signal/hub.js) in one Durable Object
//   GET  /turn        -> short-lived Cloudflare TURN iceServers, if TURN_KEY_ID/TURN_KEY_API_TOKEN set
// Clients: ?signal=wss://<worker-host>/ws and, for TURN, ?ice=https://<worker-host>/turn
// See docs/cloudflare.md.
import { createHub } from "../signal/hub.js";

const json = (body, status = 200, origin = "*") => new Response(JSON.stringify(body), {
  status,
  headers: { "content-type": "application/json", "access-control-allow-origin": origin, "cache-control": "no-store" },
});

function allowed(request, env) {
  const list = String(env.ALLOWED_ORIGINS || "").split(",").map((s) => s.trim()).filter(Boolean);
  if (!list.length) return "*";
  const origin = request.headers.get("origin") || "";
  return list.includes(origin) ? origin : null;
}

// Cloudflare TURN: mint per-visitor credentials from the long-lived key, server side only.
export async function turnServers(env, fetcher = fetch, ttl = 86400) {
  if (!env.TURN_KEY_ID || !env.TURN_KEY_API_TOKEN) return null;
  const res = await fetcher(`https://rtc.live.cloudflare.com/v1/turn/keys/${env.TURN_KEY_ID}/credentials/generate-ice-servers`, {
    method: "POST",
    headers: { authorization: `Bearer ${env.TURN_KEY_API_TOKEN}`, "content-type": "application/json" },
    body: JSON.stringify({ ttl }),
  });
  if (!res.ok) throw new Error(`turn ${res.status}`);
  const data = await res.json();
  // Port 53 is blocked by browsers and only adds a timeout.
  const list = Array.isArray(data.iceServers) ? data.iceServers : [data.iceServers];
  return list.map((server) => ({ ...server, urls: [].concat(server.urls).filter((url) => !/:53(\?|$)/.test(url)) }));
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = allowed(request, env);
    if (url.pathname === "/") return new Response("meridian lighthouse\n");
    if (url.pathname === "/turn") {
      if (!origin) return json({ error: "origin" }, 403);
      try {
        const iceServers = await turnServers(env);
        return iceServers ? json({ iceServers }, 200, origin) : json({ error: "turn not configured" }, 404, origin);
      } catch (error) {
        return json({ error: String(error.message || error) }, 502, origin);
      }
    }
    if (url.pathname === "/ws") {
      if (request.headers.get("upgrade") !== "websocket") return new Response("expected websocket", { status: 426 });
      if (!origin) return new Response("origin", { status: 403 });
      const id = env.LIGHTHOUSE.idFromName(url.searchParams.get("shard") || "global");
      return env.LIGHTHOUSE.get(id).fetch(request);
    }
    return new Response("not found", { status: 404 });
  },
};

// One Durable Object holds the roster, so every socket sees the same peers.
export class Lighthouse {
  constructor(state, env) {
    this.state = state;
    this.env = env;
    this.hub = createHub({ limits: { maxSockets: Number(env.MAX_SOCKETS) || 512 } });
    this.sweeper = null;
  }
  async fetch() {
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    server.accept();
    const socket = { open: true, send: (text) => { try { server.send(text); } catch { socket.open = false; } }, close: () => { socket.open = false; try { server.close(1008, "rate"); } catch { /* gone */ } } };
    if (!this.hub.accept(socket)) { server.close(1013, "full"); return new Response(null, { status: 101, webSocket: client }); }
    server.addEventListener("message", (event) => this.hub.message(socket, event.data));
    const gone = () => { socket.open = false; this.hub.close(socket); };
    server.addEventListener("close", gone);
    server.addEventListener("error", gone);
    if (!this.sweeper) this.sweeper = setInterval(() => this.hub.sweep(), 5000);
    return new Response(null, { status: 101, webSocket: client });
  }
}
