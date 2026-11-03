// Meridian lighthouse on Cloudflare Workers (Batch 20; Batch 21 adds the TURN free-tier cap).
//   GET  /            -> "meridian lighthouse" (health check)
//   GET  /ws          -> WebSocket, lighthouse protocol (tools/signal/hub.js) in one Durable Object
//   GET  /turn        -> short-lived Cloudflare TURN iceServers, if TURN_KEY_ID/TURN_KEY_API_TOKEN set,
//                        metered by the TurnQuota Durable Object so the month stays inside the free tier
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
export async function turnServers(env, fetcher = fetch, ttl = 3600) {
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
        if (!env.TURN_KEY_ID || !env.TURN_KEY_API_TOKEN) return json({ error: "turn not configured" }, 404, origin);
        const cfg = turnCap(env);
        const ip = request.headers.get("cf-connecting-ip") || "?";
        if (env.TURN_QUOTA) {
          const verdict = await (await env.TURN_QUOTA.get(env.TURN_QUOTA.idFromName("month")).fetch("https://quota/take", {
            method: "POST", body: JSON.stringify({ ip }),
          })).json();
          if (!verdict.ok) return json({ error: verdict.why, retryAfter: verdict.retryAfter || 3600 }, 429, origin);
        } else if (cfg.capGB > 0) return json({ error: "turn quota unavailable" }, 503, origin);
        const iceServers = await turnServers(env, fetch, cfg.ttl);
        return iceServers ? json({ iceServers }, 200, origin) : json({ error: "turn not configured" }, 404, origin);
      } catch (error) {
        return json({ error: String(error.message || error) }, 502, origin);
      }
    }
    if (url.pathname === "/turn/status" && env.TURN_QUOTA) {
      const res = await env.TURN_QUOTA.get(env.TURN_QUOTA.idFromName("month")).fetch("https://quota/status");
      return json(await res.json(), 200, origin || "*");
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

// ---- TURN free-tier cap ------------------------------------------------------------------
// Cloudflare bills TURN egress at $0.05/GB after 1,000 GB/month free (shared with the SFU).
// The Worker cannot see real relay bytes, so it budgets: every credential is charged an
// estimated EST_GB_PER_CRED up front, and minting stops at REFUSE_AT of TURN_CAP_GB.
// Credentials live TURN_TTL seconds, so refusing new ones ends relayed traffic within that.
export function turnCap(env = {}) {
  const num = (v, d) => (Number.isFinite(Number(v)) && String(v ?? "") !== "" ? Number(v) : d);
  return {
    capGB: num(env.TURN_CAP_GB, 250),           // a quarter of the 1,000 GB free tier
    estGB: num(env.EST_GB_PER_CRED, 0.25),      // ~1 h at ~550 kbit/s, generous for game traffic
    refuseAt: num(env.TURN_REFUSE_AT, 0.9),
    ttl: Math.min(num(env.TURN_TTL, 3600), 172800),
    perIpHour: num(env.TURN_PER_IP_HOUR, 4),
  };
}
export const monthKey = (now = Date.now()) => new Date(now).toISOString().slice(0, 7);

// Pure decision so it can be unit tested; state = { month, used, ips: { ip: [times] } }.
export function takeCredential(state, ip, cfg, now = Date.now()) {
  const month = monthKey(now);
  if (state.month !== month) { state.month = month; state.used = 0; state.ips = {}; }
  const recent = (state.ips[ip] || []).filter((t) => now - t < 3600e3);
  state.ips[ip] = recent;
  if (state.used + cfg.estGB > cfg.capGB * cfg.refuseAt) return { ok: false, why: "turn monthly cap reached", retryAfter: 86400 };
  if (recent.length >= cfg.perIpHour) return { ok: false, why: "turn rate limit", retryAfter: Math.ceil((3600e3 - (now - recent[0])) / 1000) };
  recent.push(now);
  state.used += cfg.estGB;
  for (const key of Object.keys(state.ips)) if (!state.ips[key].some((t) => now - t < 3600e3)) delete state.ips[key];
  return { ok: true, usedGB: state.used, capGB: cfg.capGB };
}

export class TurnQuota {
  constructor(state, env) { this.state = state; this.env = env; }
  async fetch(request) {
    const url = new URL(request.url);
    const state = (await this.state.storage.get("s")) || { month: "", used: 0, ips: {} };
    if (url.pathname === "/status") { const cfg = turnCap(this.env); return Response.json({ month: state.month, usedGB: state.used, capGB: cfg.capGB, refuseAtGB: cfg.capGB * cfg.refuseAt }); }
    const { ip } = await request.json();
    const verdict = takeCredential(state, ip || "?", turnCap(this.env));
    await this.state.storage.put("s", state);
    return Response.json(verdict);
  }
}

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
