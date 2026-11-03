import { test } from "node:test";
import assert from "node:assert/strict";
import { WebSocketServer, WebSocket } from "ws";
import { createTorrentRoom, roomHash, trackersFrom, unwrapSdp, wrap, DEFAULT_TRACKERS } from "../src/net/signal-torrent.js";
import { signalMode, torrentLine } from "../src/app/demo.js";

// A mock WebTorrent tracker with the relay rules real ones follow: offers from an announce go to
// other leechers in the room, answers go to to_peer_id only.
function mockTracker() {
  const wss = new WebSocketServer({ port: 0 });
  const rooms = new Map();
  const seen = [];
  wss.on("connection", (socket) => {
    socket.on("message", (data) => {
      const m = JSON.parse(String(data));
      seen.push(m);
      if (m.action !== "announce") return;
      const room = rooms.get(m.info_hash) || new Map();
      rooms.set(m.info_hash, room);
      if (m.event === "stopped") { room.delete(m.peer_id); return; }
      room.set(m.peer_id, socket);
      if (m.answer) {
        room.get(m.to_peer_id)?.send(JSON.stringify({ action: "announce", info_hash: m.info_hash, peer_id: m.peer_id, offer_id: m.offer_id, answer: m.answer }));
        return;
      }
      socket.send(JSON.stringify({ action: "announce", info_hash: m.info_hash, interval: 120, complete: 0, incomplete: room.size }));
      const others = [...room].filter(([id]) => id !== m.peer_id);
      (m.offers || []).forEach((offer, i) => {
        const target = others[i];
        if (target) target[1].send(JSON.stringify({ action: "announce", info_hash: m.info_hash, peer_id: m.peer_id, offer_id: offer.offer_id, offer: offer.offer }));
      });
    });
  });
  return new Promise((resolve) => wss.on("listening", () => resolve({ url: `ws://127.0.0.1:${wss.address().port}`, seen, close: () => { for (const c of wss.clients) c.terminate(); wss.close(); } })));
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(fn, ms = 3000) {
  const end = Date.now() + ms;
  while (Date.now() < end) { if (await fn()) return true; await wait(20); }
  return false;
}

test("room hash is a 20-byte SHA-1 of the namespaced world", async () => {
  const a = await roomHash("atoll-0");
  assert.equal(a.length, 20);
  assert.equal(a, await roomHash("atoll-0"));
  assert.notEqual(a, await roomHash("atoll-1"));
});

test("payloads survive the sdp wrapper", () => {
  const body = { t: "sig", blob: JSON.stringify({ sdp: { type: "offer", sdp: "v=0\r\nx" } }) };
  assert.deepEqual(unwrapSdp(wrap(body)), body);
  assert.equal(unwrapSdp("v=0\r\n"), null);
  assert.equal(unwrapSdp(null), null);
});

test("signal selection: torrent by default, lighthouse wins, solo when asked", () => {
  const p = (q) => new URLSearchParams(q);
  assert.equal(signalMode(p(""), null), "torrent");
  assert.equal(signalMode(p(""), "wss://x"), "lighthouse");
  assert.equal(signalMode(p("signal=torrent"), "wss://x"), "torrent");
  assert.equal(signalMode(p("signal=torrent&lighthouse=wss://y"), "wss://y"), "lighthouse");
  assert.equal(signalMode(p("signal=lighthouse"), null), "solo");
  assert.equal(signalMode(p("lighthouse=off"), null), "solo");
  assert.equal(signalMode(p("solo=1"), null), "solo");
  assert.equal(torrentLine("up", 2), "multiplayer via public trackers · 2 peers");
  assert.equal(torrentLine("up", 1), "multiplayer via public trackers · 1 peer");
  assert.match(torrentLine("unreachable"), /solo/);
});

test("trackers param overrides the default list", () => {
  assert.deepEqual(trackersFrom(new URLSearchParams("")), DEFAULT_TRACKERS);
  assert.deepEqual(trackersFrom(new URLSearchParams("trackers=wss://a,http://b,ws://c")), ["wss://a", "ws://c"]);
});

test("two rooms find each other and pass signals through a tracker", async () => {
  const t = await mockTracker();
  const a = createTorrentRoom({ me: "p-a", catalog: "c1", trackers: [t.url], Socket: WebSocket });
  const b = createTorrentRoom({ me: "p-b", catalog: "c1", trackers: [t.url], Socket: WebSocket });
  try {
    await a.start();
    await b.start();
    assert.ok(await until(async () => (await a.list()).length === 1 && (await b.list()).length === 1));
    assert.deepEqual(await a.list(), [{ pubkey: "p-b", role: "player", catalog: "c1" }]);
    const got = [];
    b.onMessage((m) => { if (m.type === "signal") got.push(m); });
    a.send("p-b", "hello");
    a.send("p-b", "hello"); // same blob inside 2.5 s is skipped
    a.send("p-b", "two");
    assert.ok(await until(() => got.length === 2));
    assert.deepEqual(got.map((m) => [m.from, m.to, m.blob]), [["p-a", "p-b", "hello"], ["p-a", "p-b", "two"]]);
    assert.equal(a.peers(), 1);
  } finally { a.close(); b.close(); t.close(); }
});

test("several trackers: one down still works, duplicates across trackers drop", async () => {
  const t1 = await mockTracker();
  const t2 = await mockTracker();
  const dead = "ws://127.0.0.1:1";
  const a = createTorrentRoom({ me: "p-a", trackers: [dead, t1.url, t2.url], Socket: WebSocket });
  const b = createTorrentRoom({ me: "p-b", trackers: [t1.url, t2.url], Socket: WebSocket });
  try {
    await a.start();
    await b.start();
    assert.ok(await until(async () => (await a.list()).length === 1));
    await until(() => a.trackersUp() === 2);
    const got = [];
    b.onMessage((m) => { if (m.type === "signal") got.push(m.blob); });
    a.send("p-b", "once");
    await wait(300);
    assert.deepEqual(got, ["once"]);
  } finally { a.close(); b.close(); t1.close(); t2.close(); }
});

test("start rejects when no tracker is reachable", async () => {
  const a = createTorrentRoom({ me: "p-a", trackers: ["ws://127.0.0.1:1"], Socket: WebSocket });
  await assert.rejects(a.start(), /no tracker/);
  a.close();
});

test("quiet peers age out of the roster", async () => {
  const t = await mockTracker();
  let clock = 0;
  const a = createTorrentRoom({ me: "p-a", trackers: [t.url], Socket: WebSocket, now: () => clock, peerTtlMs: 1000 });
  const b = createTorrentRoom({ me: "p-b", trackers: [t.url], Socket: WebSocket });
  try {
    await a.start();
    await b.start();
    assert.ok(await until(async () => (await a.list()).length === 1));
    clock = 5000;
    assert.equal((await a.list()).length, 0);
  } finally { a.close(); b.close(); t.close(); }
});
