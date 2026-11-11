// Batch 20: tracker health + failover, the Cloudflare Worker lighthouse core, TURN plumbing.
import assert from "node:assert/strict";
import test from "node:test";
import { BACKUP_TRACKERS, DEFAULT_TRACKERS, backupsFrom, createTorrentRoom } from "../src/net/signal-torrent.js";
import { DEFAULT_ICE, iceFrom, iceServers, resetIceCache, rtcConfig } from "../src/net/ice.js";
import { createHub } from "../tools/signal/hub.js";
import worker, { turnServers } from "../tools/cf-worker/worker.js";

// Fake WebSocket: `fate[url]` is "ok", "fail", or "silent" (opens, never answers).
function sockets(fate) {
  const made = [];
  class Fake {
    constructor(url) {
      this.url = url;
      this.readyState = 0;
      this.sent = [];
      made.push(this);
      queueMicrotask(() => {
        const f = fate[url] || "fail";
        if (f === "fail") { this.readyState = 3; this.onerror?.(); return; }
        this.readyState = 1;
        this.onopen?.();
      });
    }
    send(text) { this.sent.push(JSON.parse(text)); if ((fate[this.url] || "") === "ok") queueMicrotask(() => this.onmessage?.({ data: JSON.stringify({ action: "announce", interval: 120 }) })); }
    close() { this.readyState = 3; }
  }
  return { Fake, made };
}
const tick = (ms = 5) => new Promise((r) => setTimeout(r, ms));
function clock() { let t = 1000; return { now: () => t, add: (ms) => { t += ms; } }; }

test("three live trackers by default, backups opt-in", () => {
  assert.equal(DEFAULT_TRACKERS.length, 3);
  assert.ok(DEFAULT_TRACKERS.every((u) => u.startsWith("wss://")));
  assert.deepEqual(BACKUP_TRACKERS, []);
  assert.deepEqual(backupsFrom(new URLSearchParams("backups=wss://a,http://x, wss://b")), ["wss://a", "wss://b"]);
});

test("a failing tracker retries with backoff, then goes dead and a backup takes over", async () => {
  const { Fake, made } = sockets({ "wss://up": "ok", "wss://spare": "ok" });
  const timers = [];
  const room = createTorrentRoom({ me: "me", trackers: ["wss://up", "wss://down"], backups: ["wss://spare"], Socket: Fake, announceMs: 1e9, deadAfter: 3, later: (fn, ms) => timers.push({ fn, ms }) });
  await room.start();
  await tick();
  assert.equal(room.trackersUp(), 1);
  while (timers.length) { const t = timers.shift(); t.fn(); await tick(); }
  const down = room.health().find((h) => h.url === "wss://down");
  assert.equal(down.state, "dead");
  assert.equal(down.fails, 3);
  assert.equal(made.filter((s) => s.url === "wss://down").length, 3, "two retries after the first try");
  assert.equal(room.health().find((h) => h.url === "wss://spare").state, "up", "backup promoted");
  assert.equal(room.trackersUp(), 2);
  const spare = made.find((s) => s.url === "wss://spare");
  assert.ok(spare.sent.some((m) => m.event === "started"), "backup announces on open");
  room.close();
});

test("backoff doubles and caps", async () => {
  const { Fake } = sockets({ "wss://up": "ok" });
  const waits = [];
  const room = createTorrentRoom({ me: "me", trackers: ["wss://up", "wss://down"], Socket: Fake, announceMs: 1e9, deadAfter: 9, backoffMs: 1000, maxBackoffMs: 4000, later: (fn, ms) => { waits.push(ms); if (waits.length < 6) queueMicrotask(fn); } });
  await room.start();
  await tick(20);
  assert.deepEqual(waits.slice(0, 5), [1000, 2000, 4000, 4000, 4000]);
  room.close();
});

test("when every primary fails, start() fails over to backups", async () => {
  const { Fake } = sockets({ "wss://spare": "ok" });
  const room = createTorrentRoom({ me: "me", trackers: ["wss://a", "wss://b"], backups: ["wss://spare"], Socket: Fake, announceMs: 1e9, later: () => {} });
  await room.start();
  assert.equal(room.trackersUp(), 1);
  room.close();
  const none = createTorrentRoom({ me: "me", trackers: ["wss://a"], backups: [], Socket: Fake, announceMs: 1e9, later: () => {} });
  await assert.rejects(none.start(), /no tracker reachable/);
  none.close();
});

test("health check drops a tracker that went silent and reconnects it", async () => {
  const { Fake, made } = sockets({ "wss://ok": "ok", "wss://quiet": "silent" });
  const c = clock();
  const room = createTorrentRoom({ me: "me", trackers: ["wss://ok", "wss://quiet"], Socket: Fake, announceMs: 1e9, staleMs: 5000, now: c.now, later: () => {} });
  await room.start();
  await tick();
  // "ok" answers each announce; "quiet" never does.
  c.add(6000);
  for (const s of made) if (s.readyState === 1 && s.url === "wss://ok") s.onmessage({ data: "{}" });
  room.check();
  await tick();
  const quiet = room.health().find((h) => h.url === "wss://quiet");
  assert.equal(quiet.fails, 1);
  assert.equal(made.filter((s) => s.url === "wss://quiet").length, 2, "reopened");
  assert.equal(made.find((s) => s.url === "wss://quiet").readyState, 3, "stale socket closed");
  assert.equal(room.health().find((h) => h.url === "wss://ok").state, "up");
  room.close();
});

// ---------- Worker lighthouse core ----------
function fakeSocket() { return { open: true, got: [], send(t) { this.got.push(JSON.parse(t)); }, close() { this.open = false; } }; }

test("hub speaks the lighthouse protocol: announce, subscribe, roster push, signal relay", () => {
  const hub = createHub();
  const a = fakeSocket();
  const b = fakeSocket();
  assert.ok(hub.accept(a) && hub.accept(b));
  hub.message(a, JSON.stringify({ type: "subscribe", cell: "atoll-0" }));
  assert.deepEqual(a.got.shift(), { type: "present", peers: [], cell: "atoll-0", sub: true });
  hub.message(b, JSON.stringify({ type: "announce", pubkey: "bb", cell: "atoll-0", proto: 2 }));
  const push = a.got.shift();
  assert.equal(push.type, "roster");
  assert.equal(push.add[0].pubkey, "bb");
  hub.message(a, JSON.stringify({ type: "announce", pubkey: "aa", cell: "atoll-0", proto: 2 }));
  hub.message(a, JSON.stringify({ type: "signal", from: "aa", to: "bb", blob: "hello" }));
  assert.deepEqual(b.got.pop(), { type: "signal", to: "bb", from: "aa", blob: "hello" });
  hub.message(a, JSON.stringify({ type: "signal", from: "aa", to: "bb", blob: "x".repeat(70000) }));
  assert.equal(a.got.pop().reason, "blob");
  hub.close(b);
  assert.deepEqual(a.got.pop(), { type: "roster", cell: "atoll-0", add: [], drop: ["bb"] });
  assert.equal(hub.peers(), 1);
});

test("hub rate-limits and caps sockets", () => {
  const hub = createHub({ limits: { maxSockets: 1, perSecond: 2 }, now: () => 0 });
  const a = fakeSocket();
  assert.ok(hub.accept(a));
  assert.equal(hub.accept(fakeSocket()), false);
  for (let i = 0; i < 11; i++) hub.message(a, JSON.stringify({ type: "list", cell: "x" }));
  assert.equal(a.got.length, 2);
  assert.equal(a.open, false, "flooder closed");
});

test("worker: health, TURN off by default, TURN creds filtered of port 53", async () => {
  const ok = await worker.fetch(new Request("https://w.example/"), {});
  assert.equal(await ok.text(), "meridian lighthouse\n");
  const off = await worker.fetch(new Request("https://w.example/turn"), {});
  assert.equal(off.status, 404);
  const ws = await worker.fetch(new Request("https://w.example/ws"), {});
  assert.equal(ws.status, 426);
  const denied = await worker.fetch(new Request("https://w.example/turn", { headers: { origin: "https://evil.example" } }), { ALLOWED_ORIGINS: "https://good.example" });
  assert.equal(denied.status, 403);
  let asked = null;
  const fetcher = async (url, init) => {
    asked = { url, init };
    return new Response(JSON.stringify({ iceServers: [{ urls: ["stun:stun.cloudflare.com:3478"] }, { urls: ["turn:turn.cloudflare.com:3478?transport=udp", "turn:turn.cloudflare.com:53?transport=udp", "turns:turn.cloudflare.com:443?transport=tcp"], username: "u", credential: "c" }] }), { status: 201 });
  };
  const servers = await turnServers({ TURN_KEY_ID: "kid", TURN_KEY_API_TOKEN: "tok" }, fetcher);
  assert.match(asked.url, /\/v1\/turn\/keys\/kid\/credentials\/generate-ice-servers$/);
  assert.equal(asked.init.headers.authorization, "Bearer tok");
  assert.deepEqual(servers[1].urls, ["turn:turn.cloudflare.com:3478?transport=udp", "turns:turn.cloudflare.com:443?transport=tcp"]);
  assert.equal(servers[1].credential, "c");
});

// ---------- ICE ----------
test("ICE: STUN by default, static TURN by query, relay-only switch, Worker creds merged", async () => {
  const p = (q) => new URLSearchParams(q);
  assert.deepEqual(iceFrom(p("")), DEFAULT_ICE);
  const t = iceFrom(p("turn=turns:t.example:443?transport=tcp,http://no&turnuser=u&turncred=c"));
  assert.deepEqual(t[1], { urls: ["turns:t.example:443?transport=tcp"], username: "u", credential: "c" });
  assert.equal(rtcConfig([], p("relay=1")).iceTransportPolicy, "relay");
  assert.equal(rtcConfig([], p("")).iceTransportPolicy, undefined);
  resetIceCache();
  const got = await iceServers(p("ice=https://w.example/turn"), async () => ({ ok: true, json: async () => ({ iceServers: [{ urls: ["turn:x"], username: "a", credential: "b" }] }) }));
  assert.equal(got.length, 2);
  resetIceCache();
  const fallback = await iceServers(p("ice=https://w.example/turn"), async () => { throw new Error("down"); });
  assert.deepEqual(fallback, DEFAULT_ICE);
  resetIceCache();
});
