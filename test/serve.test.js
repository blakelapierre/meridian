import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { createStaticServer } from "../tools/serve.js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

test("pages can ask the test server to stop", async () => {
  const site = await createStaticServer(root, 0);
  try {
    const html = await fetch(`${site.url}/`).then((response) => response.text());
    assert.match(html, /\/tools\/quit\.js/);
  } finally {
    await site.close();
  }
  const child = spawn(process.execPath, ["--input-type=module", "-e", `
    import { createStaticServer } from "./tools/serve.js";
    const site = await createStaticServer(process.cwd(), 0);
    console.log(String(site.port));
  `], { cwd: root, stdio: ["ignore", "pipe", "pipe"] });
  const port = await new Promise((resolvePort, reject) => {
    let buffer = "";
    const timer = setTimeout(() => reject(new Error(buffer)), 4000);
    child.stdout.on("data", (chunk) => {
      buffer += chunk;
      const match = buffer.match(/(\d+)/);
      if (!match) return;
      clearTimeout(timer);
      resolvePort(match[1]);
    });
  });
  const response = await fetch(`http://127.0.0.1:${port}/__quit`, { method: "POST" });
  assert.equal(response.status, 200);
  const code = await new Promise((resolveCode) => child.once("exit", resolveCode));
  assert.equal(code, 0);
});
