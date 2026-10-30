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
