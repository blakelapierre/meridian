import assert from "node:assert/strict";
import test from "node:test";
import { WebSocket } from "ws";
import { createLighthouse } from "../tools/signal/server.js";
import { createRoom } from "../src/net/room.js";

test("a peer stays listed after the presence ttl because it re-announces", async () => {
  const server = await createLighthouse(0);
  const room = createRoom({ url: server.url, me: "a", refreshMs: 1000 });
  await room.start();
  await new Promise((resolve) => setTimeout(resolve, 16000));
  const other = new WebSocket(server.url);
  await new Promise((resolve) => other.addEventListener("open", resolve));
  const present = new Promise((resolve) => {
    other.addEventListener("message", (event) => {
      const message = JSON.parse(event.data);
      if (message.type === "present") resolve(message.peers);
    });
  });
  other.send(JSON.stringify({ type: "list", cell: "atoll-0" }));
  const peers = await present;
  assert.ok(peers.some((peer) => peer.pubkey === "a"));
  room.close();
  other.close();
  await server.close();
});

test("an archive is listed as an archive and a player is not", async () => {
  const server = await createLighthouse(0);
  const archive = new WebSocket(server.url);
  const player = new WebSocket(server.url);
  await Promise.all([opened(archive), opened(player)]);
  archive.send(JSON.stringify({ type: "announce", pubkey: "archive-1", cell: "atoll-0", role: "archive" }));
  player.send(JSON.stringify({ type: "announce", pubkey: "a", cell: "atoll-0" }));
  await new Promise((resolve) => setTimeout(resolve, 20));
  const present = new Promise((resolve) => {
    archive.on("message", (raw) => {
      const message = JSON.parse(raw.toString());
      if (message.type === "present") resolve(message.peers);
    });
  });
  archive.send(JSON.stringify({ type: "list", cell: "atoll-0" }));
  const peers = await present;
  const found = Object.fromEntries(peers.map((peer) => [peer.pubkey, peer.role]));
  assert.equal(found["archive-1"], "archive");
  assert.equal(found.a, "player");
  archive.close();
  player.close();
  await server.close();
});

function opened(socket) {
  return new Promise((resolve) => socket.once("open", resolve));
}

test("a public lighthouse caps messages per second and refuses other origins", async () => {
  const server = await createLighthouse(0, { limits: { perSecond: 5 }, origins: ["https://ok.example"] });
  const bad = new WebSocket(server.url, { headers: { origin: "https://evil.example" } });
  const refused = await new Promise((resolve) => {
    bad.on("error", () => resolve(true));
    bad.on("open", () => resolve(false));
  });
  assert.equal(refused, true);
  const good = new WebSocket(server.url, { headers: { origin: "https://ok.example" } });
  await new Promise((resolve) => good.on("open", resolve));
  const answers = [];
  good.on("message", (raw) => answers.push(JSON.parse(raw.toString())));
  for (let i = 0; i < 20; i++) good.send(JSON.stringify({ type: "list", cell: "atoll-0" }));
  await new Promise((resolve) => setTimeout(resolve, 100));
  assert.ok(answers.length <= 5 && answers.length > 0, `answered ${answers.length}`);
  good.close();
  await server.close();
});

test("a lighthouse refuses sockets past its cap", async () => {
  const server = await createLighthouse(0, { limits: { maxSockets: 1 } });
  const first = new WebSocket(server.url);
  await new Promise((resolve) => first.on("open", resolve));
  const second = new WebSocket(server.url);
  const refused = await new Promise((resolve) => {
    second.on("error", () => resolve(true));
    second.on("open", () => resolve(false));
  });
  assert.equal(refused, true);
  first.close();
  await server.close();
});
