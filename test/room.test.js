import assert from "node:assert/strict";
import test from "node:test";
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
