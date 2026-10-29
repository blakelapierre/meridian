import assert from "node:assert/strict";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { WebSocket } from "ws";
import { startDev } from "../tools/dev.js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

test("one command serves the view and the lighthouse", async () => {
  const dev = await startDev(root);
  try {
    const page = await fetch(`${dev.site}/tools/view/index.html`);
    assert.equal(page.status, 200);
    assert.match(await page.text(), /canvas/);
    const present = await new Promise((resolve, reject) => {
      const socket = new WebSocket(dev.lighthouse.url);
      socket.on("error", reject);
      socket.on("open", () => {
        socket.send(JSON.stringify({ type: "announce", pubkey: "a", cell: "atoll-0" }));
        socket.send(JSON.stringify({ type: "list", cell: "atoll-0" }));
      });
      socket.on("message", (raw) => {
        const message = JSON.parse(raw.toString());
        if (message.type !== "present") return;
        socket.close();
        resolve(message);
      });
    });
    assert.equal(present.peers[0].pubkey, "a");
  } finally {
    await dev.close();
  }
});
