import assert from "node:assert/strict";
import { PassThrough } from "node:stream";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { watchQuit } from "../tools/console.js";
import { createStaticServer } from "../tools/serve.js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

test("q on the server console stops it, and a browser page cannot", async () => {
  const site = await createStaticServer(root, 0);
  try {
    const html = await fetch(`${site.url}/`).then((response) => response.text());
    assert.doesNotMatch(html, /quit\.js/);
    const quit = await fetch(`${site.url}/__quit`, { method: "POST" });
    assert.equal(quit.status, 404);
  } finally {
    await site.close();
  }
  const input = new PassThrough();
  let stopped = false;
  watchQuit(input, () => {
    stopped = true;
  });
  input.write("q");
  assert.equal(stopped, true);
});
